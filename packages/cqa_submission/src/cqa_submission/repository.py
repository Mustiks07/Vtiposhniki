"""Read one SQLite snapshot using the API's existing pinned-data readers.

No schema migrations, normalization, scoring, history writes or network calls.
"""

import sqlite3
from pathlib import Path

from cqa_api.checklists import pinned_checklist
from cqa_api.conversations import pinned_conversation
from cqa_api.db import row, rows
from cqa_api.evaluations import view_from_row
from cqa_api.jobs import call_records
from cqa_api.registry import pinned_corpus, pinned_profile
from cqa_contracts.submission import SubmissionConfig, SubmissionManifest, SubmissionRun
from sqlalchemy import create_engine

from .adapter import PreparationError, SavedItem, digest


def execution_digest(config: SubmissionConfig) -> str:
    # Privacy redactions may be added after evaluation without rerunning the AI.
    return digest(
        {
            k: getattr(config, k)
            for k in (
                "checklist_version_id",
                "profile_id",
                "profile_version",
            )
        }
    )


def check_run(run: SubmissionRun, manifest: SubmissionManifest, config: SubmissionConfig) -> None:
    if (
        run.manifest_sha256 != digest(manifest.model_dump(mode="json"))
        or run.config_sha256 != execution_digest(config)
        or [a.external_id for a in run.attempts] != [e.external_id for e in manifest.entries]
        or len({a.idempotency_key for a in run.attempts}) != len(run.attempts)
    ):
        raise PreparationError("run_does_not_match_manifest_or_execution_config")


def read_items(
    database: Path, manifest: SubmissionManifest, config: SubmissionConfig, receipt: SubmissionRun
) -> list[SavedItem]:
    check_run(receipt, manifest, config)
    if not database.is_file():
        raise PreparationError("database_not_found")
    uri = database.resolve().as_uri() + "?mode=ro"
    engine = create_engine("sqlite://", creator=lambda: sqlite3.connect(uri, uri=True))
    result = []
    try:
        with engine.connect() as conn:
            conn.exec_driver_sql("PRAGMA query_only = ON")
            conn.exec_driver_sql("BEGIN")
            checklist = pinned_checklist(conn, config.checklist_version_id)
            profile = pinned_profile(conn, config.profile_id, config.profile_version)
            corpus = pinned_corpus(conn, profile.corpus_snapshot_id)
            for entry, attempt in zip(manifest.entries, receipt.attempts, strict=True):
                conversation = pinned_conversation(conn, entry.conversation_id, entry.revision)
                batch = row(
                    conn,
                    "SELECT * FROM batches WHERE idempotency_key = :key",
                    {"key": attempt.idempotency_key},
                )
                state, evaluation, calls = "not_started", None, []
                if batch is None:
                    if attempt.batch_id is not None:
                        raise PreparationError("recorded_batch_not_found_in_database")
                else:
                    if (
                        attempt.batch_id is not None
                        and batch["id"] != attempt.batch_id
                        or batch["checklist_version_id"] != config.checklist_version_id
                        or batch["profile_id"] != config.profile_id
                        or batch["profile_version"] != config.profile_version
                        or batch["corpus_snapshot_id"] != corpus.id
                        or batch["mode"] != "fresh"
                    ):
                        raise PreparationError("batch_pinned_identity_mismatch")
                    jobs = rows(
                        conn, "SELECT * FROM jobs WHERE batch_id = :id", {"id": batch["id"]}
                    )
                    if len(jobs) != 1:
                        raise PreparationError("submission_receipt_requires_one_job_per_batch")
                    job = jobs[0]
                    if (
                        job["conversation_id"] != entry.conversation_id
                        or job["conversation_revision"] != entry.revision
                    ):
                        raise PreparationError("job_conversation_revision_mismatch")
                    state = job["state"]
                    calls = call_records(conn, job["id"])
                    if job["evaluation_id"]:
                        stored = row(
                            conn,
                            "SELECT * FROM evaluations WHERE id = :id",
                            {"id": job["evaluation_id"]},
                        )
                        if stored is None:
                            raise PreparationError("job_evaluation_not_found")
                        evaluation = view_from_row(conn, stored)
                        logged = {c.call_id: c for c in calls}
                        if any(logged.get(c.call_id) != c for c in evaluation.artifact.calls):
                            raise PreparationError("artifact_calls_do_not_match_persisted_log")
                result.append(
                    SavedItem(
                        entry, conversation, checklist, profile, corpus, state, evaluation, calls
                    )
                )
            conn.rollback()
    finally:
        engine.dispose()
    return result
