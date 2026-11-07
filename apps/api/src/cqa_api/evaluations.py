"""Read side of evaluations. The stored automatic artifact is never rewritten."""

from typing import Any

from cqa_contracts.models import (
    CriterionProposal,
    EvaluationArtifact,
    EvaluationView,
    ReuseProvenance,
    ScoreSummary,
)
from pydantic import TypeAdapter
from sqlalchemy import Connection, RowMapping

from .db import from_wire_time, row, rows
from .errors import not_found
from .services import Services

_PROPOSALS = TypeAdapter(list[CriterionProposal])


def no_score() -> ScoreSummary:
    """A failed artifact has no valid proposal set to score. This is not arithmetic."""
    return ScoreSummary(
        status="incomplete_evaluation",
        total_score=None,
        contributions=[],
        section_results=[],
        flags=[],
    )


def view_from_row(conn: Connection, found: RowMapping) -> EvaluationView:
    artifact = EvaluationArtifact.model_validate_json(found["artifact_json"])
    return EvaluationView(
        id=found["id"],
        conversation_id=found["conversation_id"],
        conversation_revision=found["conversation_revision"],
        checklist_version_id=found["checklist_version_id"],
        profile_id=found["profile_id"],
        profile_version=found["profile_version"],
        corpus_snapshot_id=found["corpus_snapshot_id"],
        created_at=from_wire_time(found["created_at"]),
        revision=found["revision"],
        artifact=artifact,
        automatic_score=ScoreSummary.model_validate_json(found["automatic_score_json"]),
        human_decisions=[],
        effective_proposals=_PROPOSALS.validate_json(found["effective_proposals_json"]),
        effective_score=ScoreSummary.model_validate_json(found["effective_score_json"]),
        reuse=ReuseProvenance(
            mode=found["reuse_mode"],
            reused_from_evaluation_id=found["reused_from"],
            reuse_key=found["reuse_key"],
        ),
        source_fragments=artifact.source_fragments,
    )


def get_evaluation(services: Services, evaluation_id: str) -> EvaluationView:
    with services.db.read() as conn:
        found = row(conn, "SELECT * FROM evaluations WHERE id = :id", {"id": evaluation_id})
        if found is None:
            raise not_found("Evaluation")
        return view_from_row(conn, found)


def list_evaluations(
    services: Services,
    limit: int,
    offset: int,
    conversation_id: str | None,
    batch_id: str | None,
    status: str | None,
) -> tuple[list[EvaluationView], int]:
    clauses = []
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    for column, value in (
        ("conversation_id", conversation_id),
        ("batch_id", batch_id),
        ("status", status),
    ):
        if value is not None:
            clauses.append(f"{column} = :{column}")
            params[column] = value
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with services.db.read() as conn:
        total = row(conn, f"SELECT COUNT(*) AS n FROM evaluations {where}", params)
        page = rows(
            conn,
            f"SELECT * FROM evaluations {where} ORDER BY seq DESC LIMIT :limit OFFSET :offset",
            params,
        )
        return [view_from_row(conn, r) for r in page], int(total["n"]) if total else 0
