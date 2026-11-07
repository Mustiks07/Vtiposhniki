"""Read side of conversations, with evaluation status for the latest revision."""

from typing import Any

from cqa_contracts.http_models import ConversationSummary
from cqa_contracts.models import Conversation
from sqlalchemy import Connection

from .db import row, rows
from .errors import not_found
from .services import Services

# Status of the newest job for the latest revision. A new revision starts unevaluated.
SUMMARY_FROM = """
    FROM conversations c
    JOIN conversation_revisions r
      ON r.conversation_id = c.id AND r.revision = c.latest_revision
    LEFT JOIN jobs j ON j.seq = (
        SELECT MAX(seq) FROM jobs
        WHERE conversation_id = c.id AND conversation_revision = c.latest_revision
    )
    LEFT JOIN evaluations e ON e.id = j.evaluation_id
"""
STATUS_SQL = """
    CASE
        WHEN j.id IS NULL THEN 'unevaluated'
        WHEN j.state IN ('queued', 'running', 'retry_wait') THEN 'pending'
        WHEN e.status IS NOT NULL THEN e.status
        ELSE 'failed'
    END
"""


def pinned_conversation(conn: Connection, conversation_id: str, revision: int) -> Conversation:
    found = row(
        conn,
        "SELECT document_json FROM conversation_revisions "
        "WHERE conversation_id = :id AND revision = :revision",
        {"id": conversation_id, "revision": revision},
    )
    if found is None:
        raise not_found("Conversation revision")
    return Conversation.model_validate_json(found["document_json"])


def get_conversation(services: Services, conversation_id: str, revision: int | None) -> Conversation:
    with services.db.read() as conn:
        if revision is None:
            latest = row(
                conn,
                "SELECT latest_revision FROM conversations WHERE id = :id",
                {"id": conversation_id},
            )
            if latest is None:
                raise not_found("Conversation")
            revision = int(latest["latest_revision"])
        return pinned_conversation(conn, conversation_id, revision)


def list_conversations(
    services: Services,
    limit: int,
    offset: int,
    language: str | None,
    channel: str | None,
    status: str | None,
) -> tuple[list[ConversationSummary], int]:
    clauses = []
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    if language is not None:
        clauses.append("r.language = :language")
        params["language"] = language
    if channel is not None:
        clauses.append("r.channel = :channel")
        params["channel"] = channel
    if status is not None:
        clauses.append(f"({STATUS_SQL}) = :status")
        params["status"] = status
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with services.db.read() as conn:
        total = row(conn, f"SELECT COUNT(*) AS n {SUMMARY_FROM} {where}", params)
        page = rows(
            conn,
            f"SELECT r.document_json, e.id AS evaluation_id, {STATUS_SQL} AS status "
            f"{SUMMARY_FROM} {where} ORDER BY c.seq DESC LIMIT :limit OFFSET :offset",
            params,
        )
    return (
        [
            ConversationSummary(
                conversation=Conversation.model_validate_json(r["document_json"]),
                latest_evaluation_id=r["evaluation_id"],
                evaluation_status=r["status"],
            )
            for r in page
        ],
        int(total["n"]) if total else 0,
    )
