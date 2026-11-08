"""Appeals and reasoned decisions. Check, write and recalculation share one transaction."""

import json
from typing import Any
from uuid import uuid4

from cqa_contracts.http_models import CreateAppeal
from cqa_contracts.models import (
    Appeal,
    ChecklistVersion,
    Conversation,
    CorpusSnapshot,
    Criterion,
    CriterionProposal,
    Decision,
    DecisionRequest,
    ErrorCode,
    ErrorDetail,
    ReasonCode,
)
from sqlalchemy import RowMapping

from .checklists import pinned_checklist
from .conversations import pinned_conversation
from .db import from_wire_time, row, rows, run, to_wire_time
from .errors import ApiFailure, make_error, not_found, validation_failure
from .evaluations import PROPOSALS
from .registry import pinned_corpus
from .services import Services


def _appeal_dto(found: RowMapping) -> Appeal:
    return Appeal(
        id=found["id"],
        evaluation_id=found["evaluation_id"],
        criterion_id=found["criterion_id"],
        comment=found["comment"],
        effective_revision=found["effective_revision"],
        state=found["state"],
        created_at=from_wire_time(found["created_at"]),
    )


def _revision_conflict() -> ApiFailure:
    return ApiFailure(
        make_error(ErrorCode.REVISION_CONFLICT, "Evaluation has a newer revision; reload it")
    )


def create_appeal(services: Services, evaluation_id: str, body: CreateAppeal) -> Appeal:
    with services.db.write() as conn:
        evaluation = row(
            conn, "SELECT * FROM evaluations WHERE id = :id", {"id": evaluation_id}
        )
        if evaluation is None:
            raise not_found("Evaluation")
        if evaluation["status"] == "failed":
            raise ApiFailure(
                make_error(ErrorCode.INVALID_STATE, "A failed evaluation has nothing to appeal")
            )
        if body.expected_revision != evaluation["revision"]:
            raise _revision_conflict()
        checklist = pinned_checklist(conn, evaluation["checklist_version_id"])
        if body.criterion_id not in {c.id for c in checklist.criteria}:
            raise validation_failure(
                "Criterion is not part of the evaluated checklist version",
                [ErrorDetail(field="criterion_id", reason="invalid")],
            )
        existing = row(
            conn,
            "SELECT 1 AS x FROM appeals WHERE evaluation_id = :evaluation "
            "AND criterion_id = :criterion AND state = 'open'",
            {"evaluation": evaluation_id, "criterion": body.criterion_id},
        )
        if existing is not None:
            raise ApiFailure(
                make_error(ErrorCode.OPEN_APPEAL_EXISTS, "This criterion already has an open appeal")
            )
        appeal_id = f"appeal_{uuid4().hex}"
        run(
            conn,
            "INSERT INTO appeals (id, evaluation_id, criterion_id, comment, effective_revision, "
            "state, created_at) VALUES (:id, :evaluation, :criterion, :comment, :revision, 'open', "
            ":now)",
            {
                "id": appeal_id,
                "evaluation": evaluation_id,
                "criterion": body.criterion_id,
                "comment": body.comment,
                "revision": evaluation["revision"],
                "now": to_wire_time(services.clock()),
            },
        )
        created = row(conn, "SELECT * FROM appeals WHERE id = :id", {"id": appeal_id})
        assert created is not None
        return _appeal_dto(created)


def get_appeal(services: Services, appeal_id: str) -> Appeal:
    with services.db.read() as conn:
        found = row(conn, "SELECT * FROM appeals WHERE id = :id", {"id": appeal_id})
        if found is None:
            raise not_found("Appeal")
        return _appeal_dto(found)


def list_appeals(
    services: Services, limit: int, offset: int, state: str | None, evaluation_id: str | None
) -> tuple[list[Appeal], int]:
    """A review queue: oldest first."""
    clauses = []
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    if state is not None:
        clauses.append("state = :state")
        params["state"] = state
    if evaluation_id is not None:
        clauses.append("evaluation_id = :evaluation_id")
        params["evaluation_id"] = evaluation_id
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with services.db.read() as conn:
        total = row(conn, f"SELECT COUNT(*) AS n FROM appeals {where}", params)
        page = rows(
            conn,
            f"SELECT * FROM appeals {where} ORDER BY seq LIMIT :limit OFFSET :offset",
            params,
        )
    return [_appeal_dto(r) for r in page], int(total["n"]) if total else 0


def _evidence_problems(
    proposal: CriterionProposal, conversation: Conversation, corpus: CorpusSnapshot
) -> list[ErrorDetail]:
    ordinals = {m.id: m.ordinal for m in conversation.messages}
    chunks = {c.chunk_id for c in corpus.chunks}
    problems: list[ErrorDetail] = []
    for index, evidence in enumerate(proposal.evidence):
        known = all(message_id in ordinals for message_id in evidence.message_ids)
        if evidence.kind == "range":
            start, end = evidence.start_message_id, evidence.end_message_id
            known = (
                start in ordinals
                and end in ordinals
                and ordinals[start or ""] <= ordinals[end or ""]
            )
        if evidence.kind == "source":
            known = evidence.source_chunk_id in chunks
        if not known:
            problems.append(
                ErrorDetail(index=index, field="replacement.evidence", reason="invalid")
            )
    return problems


def _replacement_problems(
    replacement: CriterionProposal,
    criterion: Criterion,
    conversation: Conversation,
    corpus: CorpusSnapshot,
) -> list[ErrorDetail]:
    """Structural checks against the pinned version; arithmetic stays in domain.score."""
    problems: list[ErrorDetail] = []

    def add(field: str, reason: Any = "invalid") -> None:
        problems.append(ErrorDetail(field=f"replacement.{field}", reason=reason))

    if replacement.criterion_id != criterion.id:
        add("criterion_id")
    if replacement.applicability == "undetermined":
        add("applicability", "unsupported")
    if (
        replacement.applicability == "applicable"
        and replacement.answer_choice_id not in {c.id for c in criterion.choices}
    ):
        add("answer_choice_id")
    if replacement.applicability == "not_applicable" and not criterion.allow_na:
        add("applicability", "unsupported")
    policy = criterion.evidence_policy
    if policy.require_evidence and not replacement.evidence:
        add("evidence", "missing")
    if not policy.allow_source and any(e.kind == "source" for e in replacement.evidence):
        add("evidence", "unsupported")
    problems.extend(_evidence_problems(replacement, conversation, corpus))
    return problems


def _next_proposals(
    current: list[CriterionProposal],
    appeal: RowMapping,
    body: DecisionRequest,
    checklist: ChecklistVersion,
    conversation: Conversation,
    corpus: CorpusSnapshot,
) -> list[CriterionProposal]:
    if body.decision == "confirmed" or body.replacement is None:
        return current  # the current value stays, undetermined included
    criterion = next(c for c in checklist.criteria if c.id == appeal["criterion_id"])
    problems = _replacement_problems(body.replacement, criterion, conversation, corpus)
    if problems:
        raise validation_failure("Replacement does not fit the evaluated criterion", problems)
    return [body.replacement if p.criterion_id == criterion.id else p for p in current]


def decide_appeal(services: Services, appeal_id: str, body: DecisionRequest) -> Decision:
    with services.db.write() as conn:
        appeal = row(conn, "SELECT * FROM appeals WHERE id = :id", {"id": appeal_id})
        if appeal is None:
            raise not_found("Appeal")
        if appeal["state"] != "open":
            raise ApiFailure(
                make_error(ErrorCode.INVALID_STATE, "This appeal already has a decision")
            )
        evaluation = row(
            conn, "SELECT * FROM evaluations WHERE id = :id", {"id": appeal["evaluation_id"]}
        )
        assert evaluation is not None  # foreign key
        if body.expected_revision != evaluation["revision"]:
            raise _revision_conflict()
        checklist = pinned_checklist(conn, evaluation["checklist_version_id"])
        conversation = pinned_conversation(
            conn, evaluation["conversation_id"], evaluation["conversation_revision"]
        )
        corpus = pinned_corpus(conn, evaluation["corpus_snapshot_id"])
        current = PROPOSALS.validate_json(evaluation["effective_proposals_json"])
        proposals = _next_proposals(current, appeal, body, checklist, conversation, corpus)
        # The same pure scorer as the automatic result. No network; an error rolls back.
        effective_score = services.domain.score(checklist, proposals)
        revision = int(evaluation["revision"]) + 1
        now = services.clock()
        decision = Decision(
            id=f"dec_{uuid4().hex}",
            appeal_id=appeal_id,
            evaluation_id=appeal["evaluation_id"],
            criterion_id=appeal["criterion_id"],
            expected_revision=body.expected_revision,
            decision=body.decision,
            replacement=body.replacement,
            reason=body.reason,
            reason_codes=[
                ReasonCode.HUMAN_CHANGED
                if body.decision == "changed"
                else ReasonCode.HUMAN_CONFIRMED
            ],
            revision=revision,
            created_at=now,
        )
        run(
            conn,
            "INSERT INTO decisions (id, appeal_id, evaluation_id, revision, document_json, "
            "created_at) VALUES (:id, :appeal, :evaluation, :revision, :document, :now)",
            {
                "id": decision.id,
                "appeal": appeal_id,
                "evaluation": appeal["evaluation_id"],
                "revision": revision,
                "document": decision.model_dump_json(),
                "now": to_wire_time(now),
            },
        )
        run(
            conn,
            "UPDATE appeals SET state = 'resolved' WHERE id = :id",
            {"id": appeal_id},
        )
        run(
            conn,
            "UPDATE evaluations SET revision = :revision, effective_proposals_json = :proposals, "
            "effective_score_json = :score WHERE id = :id",
            {
                "revision": revision,
                "proposals": json.dumps(
                    [p.model_dump(mode="json") for p in proposals], ensure_ascii=False
                ),
                "score": effective_score.model_dump_json(),
                "id": appeal["evaluation_id"],
            },
        )
        return decision
