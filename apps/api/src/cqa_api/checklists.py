"""Immutable checklist versions, validated by the domain before they are stored."""

import logging
from uuid import uuid4

from cqa_contracts.http_models import ChecklistSummary
from cqa_contracts.interfaces import ContractError
from cqa_contracts.models import ChecklistDraft, ChecklistVersion, ErrorCode
from sqlalchemy import Connection

from .db import from_wire_time, row, rows, run, to_wire_time
from .errors import ApiFailure, make_error, not_found
from .services import Services

logger = logging.getLogger("cqa_api.checklists")
ZERO_HASH = "0" * 64


def _build_version(services: Services, checklist_id: str, draft: ChecklistDraft) -> ChecklistVersion:
    """Runs before any transaction: the validator is pure but may be slow."""
    pending = ChecklistVersion(
        **draft.model_dump(),
        checklist_id=checklist_id,
        version_id=f"clv_{uuid4().hex}",
        semantic_hash=ZERO_HASH,
        scoring_config_hash=ZERO_HASH,
        created_at=services.clock(),
    )
    version = pending.model_copy(
        update={
            "semantic_hash": services.domain.checklist_semantic_hash(pending),
            "scoring_config_hash": services.domain.checklist_scoring_hash(pending),
        }
    )
    services.domain.validate_checklist(version)
    return version


def _insert_version(conn: Connection, version: ChecklistVersion) -> None:
    run(
        conn,
        "INSERT INTO checklist_versions (version_id, checklist_id, title, semantic_hash, "
        "scoring_config_hash, document_json, created_at) VALUES (:version_id, :checklist_id, "
        ":title, :semantic, :scoring, :document, :created_at)",
        {
            "version_id": version.version_id,
            "checklist_id": version.checklist_id,
            "title": version.title,
            "semantic": version.semantic_hash,
            "scoring": version.scoring_config_hash,
            "document": version.model_dump_json(),
            "created_at": to_wire_time(version.created_at),
        },
    )


def create_checklist(services: Services, draft: ChecklistDraft) -> ChecklistVersion:
    checklist_id = f"cl_{uuid4().hex}"
    version = _build_version(services, checklist_id, draft)
    with services.db.write() as conn:
        run(
            conn,
            "INSERT INTO checklists (id, created_at) VALUES (:id, :now)",
            {"id": checklist_id, "now": to_wire_time(version.created_at)},
        )
        _insert_version(conn, version)
    return version


def seed_original_checklist(services: Services) -> None:
    """The starting rubric from the domain, once, into an empty checklist table."""
    draft_source = services.domain.original_checklist_draft
    if draft_source is None or not services.settings.seed_original_checklist:
        return
    with services.db.read() as conn:
        if row(conn, "SELECT 1 AS x FROM checklists LIMIT 1") is not None:
            return
    try:
        create_checklist(services, draft_source())
    except (ContractError, NotImplementedError) as exc:
        # Not fatal: the server stays diagnosable and other checklists stay usable.
        message = f"original checklist not seeded: {type(exc).__name__}"
        services.registry_errors.append(message)
        logger.error(message)


def _latest_version_id(conn: Connection, checklist_id: str) -> str | None:
    found = row(
        conn,
        "SELECT version_id FROM checklist_versions WHERE checklist_id = :id "
        "ORDER BY seq DESC LIMIT 1",
        {"id": checklist_id},
    )
    return None if found is None else str(found["version_id"])


def create_version(
    services: Services, checklist_id: str, expected_latest: str, draft: ChecklistDraft
) -> ChecklistVersion:
    version = _build_version(services, checklist_id, draft)
    with services.db.write() as conn:
        latest = _latest_version_id(conn, checklist_id)
        if latest is None:
            raise not_found("Checklist")
        if latest != expected_latest:
            raise ApiFailure(
                make_error(
                    ErrorCode.REVISION_CONFLICT,
                    "Checklist has a newer version than the one that was edited",
                )
            )
        _insert_version(conn, version)
    return version


def get_version(services: Services, version_id: str) -> ChecklistVersion:
    with services.db.read() as conn:
        return pinned_checklist(conn, version_id)


def pinned_checklist(conn: Connection, version_id: str) -> ChecklistVersion:
    found = row(
        conn,
        "SELECT document_json FROM checklist_versions WHERE version_id = :id",
        {"id": version_id},
    )
    if found is None:
        raise not_found("Checklist version")
    return ChecklistVersion.model_validate_json(found["document_json"])


def list_checklists(
    services: Services, limit: int, offset: int
) -> tuple[list[ChecklistSummary], int]:
    with services.db.read() as conn:
        total = row(conn, "SELECT COUNT(*) AS n FROM checklists")
        page = rows(
            conn,
            """
            SELECT c.id, c.created_at, v.version_id, v.title
            FROM checklists c
            JOIN checklist_versions v ON v.seq = (
                SELECT MAX(seq) FROM checklist_versions WHERE checklist_id = c.id
            )
            ORDER BY c.seq DESC LIMIT :limit OFFSET :offset
            """,
            {"limit": limit, "offset": offset},
        )
    return (
        [
            ChecklistSummary(
                checklist_id=r["id"],
                title=r["title"],
                latest_version_id=r["version_id"],
                created_at=from_wire_time(r["created_at"]),
            )
            for r in page
        ],
        int(total["n"]) if total else 0,
    )


def list_versions(
    services: Services, checklist_id: str, limit: int, offset: int
) -> tuple[list[ChecklistVersion], int]:
    """Newest version first."""
    with services.db.read() as conn:
        if row(conn, "SELECT 1 AS x FROM checklists WHERE id = :id", {"id": checklist_id}) is None:
            raise not_found("Checklist")
        total = row(
            conn,
            "SELECT COUNT(*) AS n FROM checklist_versions WHERE checklist_id = :id",
            {"id": checklist_id},
        )
        page = rows(
            conn,
            "SELECT document_json FROM checklist_versions WHERE checklist_id = :id "
            "ORDER BY seq DESC LIMIT :limit OFFSET :offset",
            {"id": checklist_id, "limit": limit, "offset": offset},
        )
    return (
        [ChecklistVersion.model_validate_json(r["document_json"]) for r in page],
        int(total["n"]) if total else 0,
    )
