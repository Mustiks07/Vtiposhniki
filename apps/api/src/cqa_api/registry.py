"""Immutable registry of evaluator profiles and corpus snapshots.

Sources: JSON files under <config_dir>/corpora and <config_dir>/profiles, plus the
built-in synthetic pair in explicit test mode only. A profile's mode must match the
server's. A registered version never changes; a file changing the content of an
existing version is refused, not applied.
"""

import logging
import os
from pathlib import Path

from cqa_contracts.http_models import ProfileSummary
from cqa_contracts.interfaces import ConfigurationError
from cqa_contracts.models import CorpusSnapshot, ErrorCode, EvaluatorProfile, SourceVersion
from cqa_contracts.runtime import require_production_configuration
from pydantic import ValidationError
from sqlalchemy import Connection

from .db import row, rows, run, to_wire_time
from .errors import ApiFailure, make_error, not_found
from .services import Services
from .testmode import synthetic_corpus, synthetic_profile

logger = logging.getLogger("cqa_api.registry")


def register_corpus(conn: Connection, services: Services, corpus: CorpusSnapshot) -> None:
    expected = services.domain.corpus_snapshot_hash(corpus)
    if expected != corpus.content_hash:
        raise ValueError("corpus content hash does not match its content")
    existing = row(
        conn, "SELECT content_hash FROM corpus_snapshots WHERE id = :id", {"id": corpus.id}
    )
    if existing is not None:
        if existing["content_hash"] != corpus.content_hash:
            raise ValueError("registered corpus snapshot cannot change")
        return
    run(
        conn,
        "INSERT INTO corpus_snapshots (id, content_hash, document_json, registered_at) "
        "VALUES (:id, :hash, :document, :now)",
        {
            "id": corpus.id,
            "hash": corpus.content_hash,
            "document": corpus.model_dump_json(),
            "now": to_wire_time(services.clock()),
        },
    )


def register_profile(conn: Connection, services: Services, profile: EvaluatorProfile) -> None:
    if profile.mode != services.settings.mode:
        raise ValueError("profile mode does not match the application mode")
    digest = services.domain.profile_hash(profile)
    existing = row(
        conn,
        "SELECT profile_hash FROM evaluator_profiles WHERE profile_id = :id AND version = :version",
        {"id": profile.id, "version": profile.version},
    )
    if existing is not None:
        if existing["profile_hash"] != digest:
            raise ValueError("registered profile version cannot change")
        return
    if row(
        conn, "SELECT 1 AS x FROM corpus_snapshots WHERE id = :id", {"id": profile.corpus_snapshot_id}
    ) is None:
        raise ValueError("profile refers to an unknown corpus snapshot")
    run(
        conn,
        "INSERT INTO evaluator_profiles (profile_id, version, corpus_snapshot_id, profile_hash, "
        "document_json, registered_at) VALUES (:id, :version, :corpus, :hash, :document, :now)",
        {
            "id": profile.id,
            "version": profile.version,
            "corpus": profile.corpus_snapshot_id,
            "hash": digest,
            "document": profile.model_dump_json(),
            "now": to_wire_time(services.clock()),
        },
    )


def _load_directory(
    services: Services, directory: Path, kind: str
) -> None:
    if not directory.is_dir():
        return
    for path in sorted(directory.glob("*.json")):
        try:
            text = path.read_text(encoding="utf-8")
            with services.db.write() as conn:
                if kind == "corpus":
                    register_corpus(conn, services, CorpusSnapshot.model_validate_json(text))
                else:
                    register_profile(conn, services, EvaluatorProfile.model_validate_json(text))
        except (OSError, ValueError, ValidationError, NotImplementedError) as exc:
            # A bad file must not silently become a usable profile. File name and type only.
            message = f"{kind} configuration {path.name} rejected: {type(exc).__name__}"
            services.registry_errors.append(message)
            logger.error(message)


def sync_registry(services: Services) -> None:
    if services.settings.mode == "test":
        with services.db.write() as conn:
            register_corpus(conn, services, synthetic_corpus(services.domain))
            register_profile(conn, services, synthetic_profile())
    base = services.settings.effective_config_dir
    _load_directory(services, base / "corpora", "corpus")
    _load_directory(services, base / "profiles", "profile")


def latest_profile(conn: Connection, profile_id: str) -> EvaluatorProfile:
    found = row(
        conn,
        "SELECT document_json FROM evaluator_profiles WHERE profile_id = :id "
        "ORDER BY seq DESC LIMIT 1",
        {"id": profile_id},
    )
    if found is None:
        raise not_found("Evaluator profile")
    return EvaluatorProfile.model_validate_json(found["document_json"])


def pinned_profile(conn: Connection, profile_id: str, version: str) -> EvaluatorProfile:
    found = row(
        conn,
        "SELECT document_json FROM evaluator_profiles WHERE profile_id = :id AND version = :v",
        {"id": profile_id, "v": version},
    )
    if found is None:
        raise not_found("Evaluator profile")
    return EvaluatorProfile.model_validate_json(found["document_json"])


def pinned_corpus(conn: Connection, corpus_id: str) -> CorpusSnapshot:
    found = row(
        conn, "SELECT document_json FROM corpus_snapshots WHERE id = :id", {"id": corpus_id}
    )
    if found is None:
        raise not_found("Corpus snapshot")
    return CorpusSnapshot.model_validate_json(found["document_json"])


def profile_configuration_error(services: Services, profile: EvaluatorProfile) -> ApiFailure | None:
    if profile.mode != services.settings.mode:
        return ApiFailure(
            make_error(ErrorCode.CONFIGURATION_ERROR, "Profile mode is not enabled on this server")
        )
    if profile.mode == "test":
        return None
    try:
        require_production_configuration(profile, os.environ)
    except ConfigurationError as exc:
        return ApiFailure(exc.error)
    return None


def list_profiles(
    services: Services, limit: int, offset: int
) -> tuple[list[ProfileSummary], int]:
    with services.db.read() as conn:
        latest = rows(
            conn,
            "SELECT document_json FROM evaluator_profiles WHERE seq IN "
            "(SELECT MAX(seq) FROM evaluator_profiles GROUP BY profile_id) ORDER BY profile_id",
        )
    profiles = [EvaluatorProfile.model_validate_json(r["document_json"]) for r in latest]
    summaries = []
    for profile in profiles[offset : offset + limit]:
        failure = profile_configuration_error(services, profile)
        summaries.append(
            ProfileSummary(
                profile=profile,
                configured=failure is None,
                configuration_error=None if failure is None else failure.error,
            )
        )
    return summaries, len(profiles)


def has_usable_profile(services: Services) -> bool:
    profiles, _ = list_profiles(services, limit=200, offset=0)
    return any(summary.configured for summary in profiles)


def list_sources(
    services: Services, limit: int, offset: int, corpus_snapshot_id: str | None
) -> tuple[list[SourceVersion], int]:
    with services.db.read() as conn:
        if corpus_snapshot_id is not None:
            selected = rows(
                conn,
                "SELECT document_json FROM corpus_snapshots WHERE id = :id",
                {"id": corpus_snapshot_id},
            )
            if not selected:
                raise not_found("Corpus snapshot")
        else:
            selected = rows(conn, "SELECT document_json FROM corpus_snapshots ORDER BY id")
    sources: dict[tuple[str, str], SourceVersion] = {}
    for item in selected:
        for source in CorpusSnapshot.model_validate_json(item["document_json"]).sources:
            sources.setdefault((source.source_id, source.version), source)
    ordered = [sources[key] for key in sorted(sources)]
    return ordered[offset : offset + limit], len(ordered)
