"""Safe export built by allowlist. Never serializes a DB row or an EvaluationView.

No transcript, free text, source fragment, external ID or URL can reach this output:
items are assembled field by field from identifiers, codes, statuses and numbers.
"""

import csv
import io
import json
from collections.abc import Iterable
from decimal import Decimal
from typing import Any, Literal

from cqa_contracts.models import (
    CriterionProposal,
    ErrorCode,
    EvaluationView,
    Job,
    ReasonCode,
    SafeCriterionResult,
    SafeDecision,
    SafeEvidenceRef,
    SafeExport,
    SafeExportItem,
    ScoreSummary,
)
from sqlalchemy import Connection, RowMapping

from .conversations import pinned_conversation
from .db import row, rows
from .errors import not_found
from .evaluations import view_from_row
from .jobs import _job_dto, call_records, job_cost
from .registry import pinned_profile
from .services import Services

Scope = Literal["automatic", "effective"]

CSV_COLUMNS = (
    "schema_version,scope,batch_id,job_id,evaluation_id,conversation_id,conversation_revision,"
    "checklist_version_id,profile_id,profile_version,corpus_snapshot_id,evaluation_revision,"
    "job_state,evaluation_status,score_status,total_score,criterion_id,applicability,"
    "answer_choice_id,origin,reason_codes,evidence,score_fraction,earned_weight,applicable_weight,"
    "normalized_contribution,flag_detected,decisions,error_code,limitation_codes,cost,"
    "cost_complete,currency"
).split(",")
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
TERMINAL_STATES = ("succeeded", "failed", "cancelled")


def _criteria(
    proposals: Iterable[CriterionProposal], score: ScoreSummary
) -> list[SafeCriterionResult]:
    contributions = {c.criterion_id: c for c in score.contributions}
    flags = {f.criterion_id: f for f in score.flags}
    results = []
    for proposal in proposals:
        contribution = contributions.get(proposal.criterion_id)
        flag = flags.get(proposal.criterion_id)
        results.append(
            SafeCriterionResult(
                criterion_id=proposal.criterion_id,
                applicability=proposal.applicability,
                answer_choice_id=proposal.answer_choice_id,
                origin=proposal.origin,
                reason_codes=proposal.reason_codes,
                evidence=[
                    SafeEvidenceRef(
                        kind=e.kind,
                        message_ids=e.message_ids,
                        start_message_id=e.start_message_id,
                        end_message_id=e.end_message_id,
                        source_chunk_id=e.source_chunk_id,
                        relation=e.relation,
                    )
                    for e in proposal.evidence
                ],
                score_fraction=contribution.score_fraction if contribution else None,
                earned_weight=contribution.earned_weight if contribution else None,
                applicable_weight=contribution.applicable_weight if contribution else Decimal(0),
                normalized_contribution=(
                    contribution.normalized_contribution if contribution else None
                ),
                flag_detected=flag.detected if flag else None,
            )
        )
    return results


def _limitations(
    conn: Connection,
    job_row: RowMapping,
    job: Job,
    view: EvaluationView | None,
    proposals: list[CriterionProposal],
    score: ScoreSummary | None,
    cost_known: bool,
) -> list[Any]:
    codes: list[str] = []
    artifact = view.artifact if view is not None else None
    if pinned_profile(conn, job_row["profile_id"], job_row["profile_version"]).mode == "test":
        codes.append("test_evaluator")
    if (artifact is not None and artifact.status == "partial") or (
        score is not None and score.status == "incomplete_evaluation"
    ):
        codes.append("incomplete")
    if artifact is not None and any(r.outcome in ("skipped", "failed") for r in artifact.reviews):
        codes.append("review_unfinished")
    if any(ReasonCode.FACTUAL_VERIFICATION_LIMITED in p.reason_codes for p in proposals):
        codes.append("factual_verification_limited")
    conversation = pinned_conversation(conn, job.conversation_id, job.conversation_revision)
    if conversation.channel == "voice_call" and conversation.audio.availability != "available":
        codes.append("audio_unavailable")
    if not cost_known:
        codes.append("cost_unknown")
    if artifact is not None and any(text != "test_evaluator" for text in artifact.limitations):
        codes.append("other")
    return codes


def _item(
    conn: Connection, scope: Scope, job_row: RowMapping, view: EvaluationView | None
) -> SafeExportItem:
    job = _job_dto(conn, job_row)
    cost, complete = job_cost(call_records(conn, job.id))
    if job.state not in TERMINAL_STATES:
        complete = False  # more calls may follow
        cost = cost if job.progress.completed_calls else None

    score: ScoreSummary | None = None
    proposals: list[CriterionProposal] = []
    decisions: list[SafeDecision] = []
    if view is not None:
        automatic = scope == "automatic"
        score = view.automatic_score if automatic else view.effective_score
        proposals = view.artifact.automatic_final if automatic else view.effective_proposals
        if not automatic:
            decisions = [
                SafeDecision(
                    id=d.id,
                    appeal_id=d.appeal_id,
                    criterion_id=d.criterion_id,
                    decision=d.decision,
                    reason_codes=d.reason_codes,
                    revision=d.revision,
                )
                for d in view.human_decisions
            ]
    failed = view is not None and view.artifact.status == "failed"
    error: ErrorCode | None = job.error.code if job.error is not None else None
    if error is None and failed and view is not None and view.artifact.error is not None:
        error = view.artifact.error.code
    return SafeExportItem(
        job_id=job.id,
        evaluation_id=view.id if view is not None else None,
        conversation_id=job.conversation_id,
        conversation_revision=job.conversation_revision,
        checklist_version_id=job_row["checklist_version_id"],
        profile_id=job_row["profile_id"],
        profile_version=job_row["profile_version"],
        corpus_snapshot_id=job_row["corpus_snapshot_id"],
        evaluation_revision=None if view is None else view.revision,
        job_state=job.state,
        evaluation_status=view.artifact.status if view is not None else None,
        score_status=None if score is None or failed else score.status,
        total_score=None if score is None else score.total_score,
        criteria=_criteria(proposals, score) if score is not None else [],
        decisions=decisions,
        error_code=error,
        limitation_codes=_limitations(conn, job_row, job, view, proposals, score, complete),
        cost=cost,
        cost_complete=complete,
    )


def export_evaluation(services: Services, evaluation_id: str, scope: Scope) -> SafeExport:
    with services.db.read() as conn:
        found = row(conn, "SELECT * FROM evaluations WHERE id = :id", {"id": evaluation_id})
        if found is None:
            raise not_found("Evaluation")
        job = row(conn, "SELECT * FROM jobs WHERE id = :id", {"id": found["job_id"]})
        assert job is not None  # foreign key
        return SafeExport(
            scope=scope,
            generated_at=services.clock(),
            batch_id=found["batch_id"],
            items=[_item(conn, scope, job, view_from_row(conn, found))],
        )


def export_batch(services: Services, batch_id: str, scope: Scope) -> SafeExport:
    with services.db.read() as conn:
        if row(conn, "SELECT 1 AS x FROM batches WHERE id = :id", {"id": batch_id}) is None:
            raise not_found("Evaluation batch")
        items = []
        for job in rows(
            conn, "SELECT * FROM jobs WHERE batch_id = :id ORDER BY seq", {"id": batch_id}
        ):
            found = (
                row(conn, "SELECT * FROM evaluations WHERE id = :id", {"id": job["evaluation_id"]})
                if job["evaluation_id"] is not None
                else None
            )
            view = view_from_row(conn, found) if found is not None else None
            items.append(_item(conn, scope, job, view))
        return SafeExport(
            scope=scope, generated_at=services.clock(), batch_id=batch_id, items=items
        )


def _guard(value: str) -> str:
    return f"'{value}" if value.startswith(FORMULA_PREFIXES) else value


def _cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (list, dict)):
        return _guard(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
    return _guard(str(value))


def to_csv(export: SafeExport) -> str:
    """The documented flattening of SafeExport: one row per criterion, or one empty row."""
    payload = export.model_dump(mode="json")
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(CSV_COLUMNS)
    for item in payload["items"]:
        shared = {
            **item,
            "scope": payload["scope"],
            "batch_id": payload["batch_id"],
            "schema_version": payload["schema_version"],
        }
        for criterion in item["criteria"] or [None]:
            merged = dict(shared)
            if criterion is not None:
                merged.update(
                    {key: value for key, value in criterion.items() if key != "schema_version"}
                )
            writer.writerow([_cell(merged.get(column)) for column in CSV_COLUMNS])
    return buffer.getvalue()
