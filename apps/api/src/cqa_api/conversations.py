"""Read side of conversations: the current revision and the job selected for it.

The rule is the same with and without a flag selection. Each conversation contributes
exactly one row: its latest revision, the newest job of that revision (in the selected
checklist version, when there is one) and only that job's evaluation. The job is chosen
first and the flag is read afterwards, so an older result can neither satisfy a filter
nor show through a newer pending or failed run.

Flag values come from the score the domain stored. No total, rationale, title or
criterion number is ever consulted.
"""

from typing import Any

from cqa_contracts.http_models import (
    ConversationFlagQuery,
    ConversationFlagSummary,
    ConversationSummary,
    FlagScope,
    FlagStatus,
)
from cqa_contracts.models import Conversation, ErrorDetail, FlagResult
from sqlalchemy import Connection, RowMapping

from .checklists import pinned_checklist
from .db import row, rows
from .errors import not_found, validation_failure
from .services import Services

# Fixed text only: nothing from the request is ever placed in a statement.
STATUS_SQL = """
    CASE
        WHEN j.id IS NULL THEN 'unevaluated'
        WHEN j.state IN ('queued', 'running', 'retry_wait') THEN 'pending'
        WHEN j.state = 'succeeded' AND e.status IS NOT NULL THEN e.status
        ELSE 'failed'
    END
"""
SCORE_COLUMN: dict[FlagScope, str] = {
    "automatic": "e.automatic_score_json",
    "effective": "e.effective_score_json",
}
DETECTED_SQL = "json_extract(flag_json, '$.detected')"
FLAG_STATUS_SQL: dict[FlagStatus, str] = {
    "detected": f"{DETECTED_SQL} = 1",
    "not_detected": f"{DETECTED_SQL} = 0",
    "unknown": f"{DETECTED_SQL} IS NULL",
}


def _selected_sql(selection: ConversationFlagQuery) -> str:
    """One row per conversation. COUNT and the page both read this same statement."""
    version = (
        ""
        if selection.checklist_version_id is None
        else "AND checklist_version_id = :checklist_version_id"
    )
    flag = (
        "NULL"
        if selection.flag_criterion_id is None
        else f"""
        CASE WHEN j.state = 'succeeded' AND e.status IN ('complete', 'partial') THEN (
            SELECT f.value FROM json_each({SCORE_COLUMN[selection.flag_scope]}, '$.flags') AS f
            WHERE json_extract(f.value, '$.criterion_id') = :flag_criterion_id
            LIMIT 1
        ) END
        """
    )
    return f"""
        SELECT c.seq AS seq, r.document_json AS document_json,
               r.language AS language, r.channel AS channel,
               j.id AS job_id, e.id AS evaluation_id,
               {STATUS_SQL} AS status, {flag} AS flag_json
        FROM conversations c
        JOIN conversation_revisions r
          ON r.conversation_id = c.id AND r.revision = c.latest_revision
        LEFT JOIN jobs j ON j.seq = (
            SELECT MAX(seq) FROM jobs
            WHERE conversation_id = c.id AND conversation_revision = c.latest_revision
            {version}
        )
        LEFT JOIN evaluations e ON e.id = j.evaluation_id
    """


def _check_selection(conn: Connection, selection: ConversationFlagQuery) -> None:
    """An unknown version is 404; a criterion that is not a flag of it is 422."""
    if selection.checklist_version_id is None:
        return
    checklist = pinned_checklist(conn, selection.checklist_version_id)
    if selection.flag_criterion_id is None:
        return
    if not any(
        c.id == selection.flag_criterion_id and c.response_type == "flag"
        for c in checklist.criteria
    ):
        raise validation_failure(
            "Criterion is not a flag of the selected checklist version",
            [ErrorDetail(field="flag_criterion_id", reason="invalid")],
        )


def _flag_summary(
    found: RowMapping, selection: ConversationFlagQuery
) -> ConversationFlagSummary | None:
    if selection.checklist_version_id is None or selection.flag_criterion_id is None:
        return None
    result = (
        FlagResult(criterion_id=selection.flag_criterion_id, detected=None, answer_choice_id=None)
        if found["flag_json"] is None
        else FlagResult.model_validate_json(found["flag_json"])
    )
    status: FlagStatus = (
        "unknown" if result.detected is None else "detected" if result.detected else "not_detected"
    )
    return ConversationFlagSummary(
        checklist_version_id=selection.checklist_version_id,
        latest_job_id=found["job_id"],
        scope=selection.flag_scope,
        status=status,
        result=result,
    )


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
    selection: ConversationFlagQuery,
) -> tuple[list[ConversationSummary], int]:
    clauses = []
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    for column, value in (("language", language), ("channel", channel), ("status", status)):
        if value is not None:
            clauses.append(f"{column} = :{column}")
            params[column] = value
    if selection.checklist_version_id is not None:
        params["checklist_version_id"] = selection.checklist_version_id
    if selection.flag_criterion_id is not None:
        params["flag_criterion_id"] = selection.flag_criterion_id
    if selection.flag_status is not None:
        clauses.append(FLAG_STATUS_SQL[selection.flag_status])
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    selected = f"WITH selected AS ({_selected_sql(selection)})"
    # One read transaction: the page and its total describe the same snapshot.
    with services.db.read() as conn:
        _check_selection(conn, selection)
        total = row(conn, f"{selected} SELECT COUNT(*) AS n FROM selected {where}", params)
        page = rows(
            conn,
            f"{selected} SELECT * FROM selected {where} "
            "ORDER BY seq DESC LIMIT :limit OFFSET :offset",
            params,
        )
    return (
        [
            ConversationSummary(
                conversation=Conversation.model_validate_json(r["document_json"]),
                latest_evaluation_id=r["evaluation_id"],
                evaluation_status=r["status"],
                flag_summary=_flag_summary(r, selection),
            )
            for r in page
        ],
        int(total["n"]) if total else 0,
    )
