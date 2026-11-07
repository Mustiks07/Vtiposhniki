"""Read side of evaluations. The stored automatic artifact is never rewritten."""

import logging
from collections.abc import Iterable, Iterator
from itertools import chain
from typing import Any

from cqa_contracts.models import (
    CriterionProposal,
    Decision,
    EvaluationArtifact,
    EvaluationRun,
    EvaluationView,
    ReuseProvenance,
    ScoreSummary,
    SourceFragment,
)
from pydantic import TypeAdapter
from sqlalchemy import Connection, RowMapping

from .db import from_wire_time, row, rows
from .errors import not_found
from .jobs import _job_dto, call_records, job_cost
from .registry import pinned_corpus
from .services import Services

logger = logging.getLogger("cqa_api.evaluations")
PROPOSALS = TypeAdapter(list[CriterionProposal])


def no_score() -> ScoreSummary:
    """A failed artifact has no valid proposal set to score. This is not arithmetic."""
    return ScoreSummary(
        status="incomplete_evaluation",
        total_score=None,
        contributions=[],
        section_results=[],
        flags=[],
    )


def _cited_chunks(proposals: Iterable[CriterionProposal]) -> Iterator[str]:
    for proposal in proposals:
        for evidence in proposal.evidence:
            if evidence.source_chunk_id is not None:
                yield evidence.source_chunk_id


def _source_fragments(
    conn: Connection,
    corpus_id: str,
    artifact: EvaluationArtifact,
    effective: list[CriterionProposal],
    decisions: list[Decision],
) -> list[SourceFragment]:
    """Artifact fragments, plus the text of any other chunk cited in this evaluation.

    Derived at read time from the pinned corpus. The stored artifact is not touched, and
    a chunk cited only by a replaced decision stays readable for the decision history.
    """
    fragments = list(artifact.source_fragments)
    known = {fragment.chunk.chunk_id for fragment in fragments}
    cited = chain(
        _cited_chunks(artifact.initial),
        _cited_chunks(artifact.automatic_final),
        _cited_chunks(r.proposal for r in artifact.reviews if r.proposal is not None),
        _cited_chunks(effective),
        _cited_chunks(d.replacement for d in decisions if d.replacement is not None),
    )
    missing = [chunk_id for chunk_id in dict.fromkeys(cited) if chunk_id not in known]
    if not missing:
        return fragments  # the common case does not read the corpus at all
    corpus = pinned_corpus(conn, corpus_id)
    chunks = {chunk.chunk_id: chunk for chunk in corpus.chunks}
    sources = {(source.source_id, source.version): source for source in corpus.sources}
    for chunk_id in missing:
        chunk = chunks.get(chunk_id)
        source = None if chunk is None else sources.get((chunk.source_id, chunk.source_version))
        if chunk is None or source is None:
            logger.error("Corpus %s has no text for a cited chunk", corpus_id)
            continue
        fragments.append(SourceFragment(source=source, chunk=chunk))
    return fragments


def view_from_row(conn: Connection, found: RowMapping) -> EvaluationView:
    artifact = EvaluationArtifact.model_validate_json(found["artifact_json"])
    decisions = [
        Decision.model_validate_json(d["document_json"])
        for d in rows(
            conn,
            "SELECT document_json FROM decisions WHERE evaluation_id = :id ORDER BY revision",
            {"id": found["id"]},
        )
    ]
    effective = PROPOSALS.validate_json(found["effective_proposals_json"])
    job_row = row(conn, "SELECT * FROM jobs WHERE id = :id", {"id": found["job_id"]})
    if job_row is None:
        raise not_found("Evaluation job")
    job = _job_dto(conn, job_row)
    calls = call_records(conn, job.id)
    cost, cost_complete = job_cost(calls, state=job.state)
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
        run=EvaluationRun(job=job, calls=calls, cost=cost, cost_complete=cost_complete),
        automatic_score=ScoreSummary.model_validate_json(found["automatic_score_json"]),
        human_decisions=decisions,
        effective_proposals=effective,
        effective_score=ScoreSummary.model_validate_json(found["effective_score_json"]),
        reuse=ReuseProvenance(
            mode=found["reuse_mode"],
            reused_from_evaluation_id=found["reused_from"],
            reuse_key=found["reuse_key"],
        ),
        source_fragments=_source_fragments(
            conn, found["corpus_snapshot_id"], artifact, effective, decisions
        ),
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
