"""Cross-object validation of evaluation artifacts and evidence (no network).

The server guarantees structure, allowed values, reference existence and
arithmetic. Semantic sufficiency of evidence is NOT asserted here.
"""

from collections.abc import Sequence

from cqa_contracts.models import (
    ChecklistDraft,
    ChecklistVersion,
    Conversation,
    CorpusSnapshot,
    Criterion,
    CriterionProposal,
    EvaluationArtifact,
    Evidence,
    Message,
    ReasonCode,
)

from .checklist import checklist_rule_problems
from .errors import Problems
from .hashing import (
    checklist_semantic_hash,
    conversation_content_hash,
    corpus_snapshot_hash,
    text_hash,
)
from .proposals import proposal_set_problems

# Limitation and review codes emitted by the evaluator (stable strings, no free text).
REVIEW_TRIGGER_CODES = (
    "potential_violation",
    "identification_order",
    "observed_contradiction",
    "source_conflict",
    "disputed_applicability",
    "unresolved_request_at_maximum",
    "ambiguous_ending_or_role",
)
# Trigger codes plus outcome markers the evaluator appends after a blind review.
REVIEW_REASON_CODES = (*REVIEW_TRIGGER_CODES, "reviewer_agreed", "reviewer_disagreed")
PROPOSAL_LIMITATION_CODES = (
    "factual_verification_limited",
    "knowledge_base_missing",
    "conflicting_sources",
    "audio_not_analyzed",
    "asr_noise",
    "internal_consultation",
    "unclear_speaker",
    "test_evaluator",
)


def evidence_messages(conversation: Conversation, evidence: Evidence) -> list[Message]:
    """Original messages an evidence item refers to (quotes come from the original)."""
    by_id = {m.id: m for m in conversation.messages}
    if evidence.kind == "message":
        return [by_id[mid] for mid in evidence.message_ids if mid in by_id]
    if evidence.kind == "range":
        start = by_id.get(evidence.start_message_id or "")
        end = by_id.get(evidence.end_message_id or "")
        if start is None or end is None:
            return []
        return [m for m in conversation.messages if start.ordinal <= m.ordinal <= end.ordinal]
    return []


def evidence_problems(
    conversation: Conversation,
    corpus: CorpusSnapshot,
    criterion: Criterion,
    evidence: Sequence[Evidence],
    path: str,
    index: int,
    problems: Problems,
    allowed_chunk_ids: set[str] | None = None,
) -> None:
    ordinals = {m.id: m.ordinal for m in conversation.messages}
    chunk_ids = {c.chunk_id for c in corpus.chunks}
    for j, ev in enumerate(evidence):
        epath = f"{path}.evidence[{j}]"
        if ev.kind == "message":
            known = [mid for mid in ev.message_ids if mid in ordinals]
            if len(known) != len(ev.message_ids):
                problems.add(f"{epath}.message_ids", "invalid", index)
            elif len(set(known)) != len(known):
                problems.add(f"{epath}.message_ids", "duplicate", index)
            elif [ordinals[m] for m in known] != sorted(ordinals[m] for m in known):
                problems.add(f"{epath}.message_ids", "invalid", index)
        elif ev.kind == "range":
            start = ordinals.get(ev.start_message_id or "")
            end = ordinals.get(ev.end_message_id or "")
            if start is None:
                problems.add(f"{epath}.start_message_id", "invalid", index)
            if end is None:
                problems.add(f"{epath}.end_message_id", "invalid", index)
            if start is not None and end is not None and start > end:
                problems.add(f"{epath}.end_message_id", "invalid", index)
        else:
            if not criterion.evidence_policy.allow_source:
                problems.add(f"{epath}.kind", "unsupported", index)
            if ev.source_chunk_id not in chunk_ids:
                problems.add(f"{epath}.source_chunk_id", "invalid", index)
            elif allowed_chunk_ids is not None and ev.source_chunk_id not in allowed_chunk_ids:
                problems.add(f"{epath}.source_chunk_id", "invalid", index)


def automatic_proposal_problems(
    conversation: Conversation,
    checklist: ChecklistDraft,
    corpus: CorpusSnapshot,
    proposals: Sequence[CriterionProposal],
    *,
    origin: str,
    allowed_chunk_ids: set[str] | None = None,
    require_full_coverage: bool = True,
) -> Problems:
    """Rules for evaluator-produced proposals (initial, review or automatic_final)."""
    if require_full_coverage:
        problems = proposal_set_problems(checklist, proposals)
    else:
        subset = [c for c in checklist.criteria if c.id in {p.criterion_id for p in proposals}]
        problems = proposal_set_problems(
            checklist.model_copy(update={"criteria": subset}), proposals
        )
    by_id = {c.id: c for c in checklist.criteria}
    for i, p in enumerate(proposals):
        criterion = by_id.get(p.criterion_id)
        if criterion is None:
            continue
        path = f"proposals[{i}]"
        if p.origin != origin:
            problems.add(f"{path}.origin", "invalid", i)
        evidence_problems(
            conversation, corpus, criterion, p.evidence, path, i, problems, allowed_chunk_ids
        )
        conversational = [e for e in p.evidence if e.kind in ("message", "range")]
        if (
            criterion.evidence_policy.require_evidence
            and p.applicability != "undetermined"
            and not conversational
        ):
            problems.add(f"{path}.evidence", "missing", i)
        if (
            ReasonCode.MISSING_EXPECTED_ACTION in p.reason_codes
            and criterion.evidence_policy.missing_action_requires_range
            and not any(e.kind == "range" for e in p.evidence)
        ):
            problems.add(f"{path}.evidence", "missing", i)
        if p.applicability == "not_applicable" and ReasonCode.NOT_APPLICABLE not in p.reason_codes:
            problems.add(f"{path}.reason_codes", "missing", i)
        if (
            criterion.requires_reference
            and p.applicability == "applicable"
            and not any(e.kind == "source" for e in p.evidence)
        ):
            problems.add(f"{path}.evidence", "missing", i)
        if any(code not in REVIEW_REASON_CODES for code in p.review_reasons):
            problems.add(f"{path}.review_reasons", "invalid", i)
    return problems


def corpus_problems(corpus: CorpusSnapshot) -> Problems:
    problems = Problems()
    keys = [(s.source_id, s.version) for s in corpus.sources]
    if len(set(keys)) != len(keys):
        problems.add("corpus.sources", "duplicate")
    chunk_ids = [c.chunk_id for c in corpus.chunks]
    if len(set(chunk_ids)) != len(chunk_ids):
        problems.add("corpus.chunks.chunk_id", "duplicate")
    for i, c in enumerate(corpus.chunks):
        if (c.source_id, c.source_version) not in set(keys):
            problems.add(f"corpus.chunks[{i}].source_id", "invalid", i)
        if c.content_hash != text_hash(c.text):
            problems.add(f"corpus.chunks[{i}].content_hash", "invalid", i)
    if corpus.content_hash != corpus_snapshot_hash(corpus):
        problems.add("corpus.content_hash", "invalid")
    return problems


def validate_corpus(corpus: CorpusSnapshot) -> None:
    corpus_problems(corpus).raise_if_any("Corpus snapshot is inconsistent")


def validate_artifact(
    conversation: Conversation,
    checklist: ChecklistVersion,
    corpus: CorpusSnapshot,
    artifact: EvaluationArtifact,
) -> None:
    """Shared schema is already enforced by Pydantic; this checks cross-object facts."""
    problems = checklist_rule_problems(checklist)
    problems.extend(corpus_problems(corpus).details)
    content_hash = conversation_content_hash(conversation)
    if conversation.content_hash != content_hash:
        problems.add("conversation.content_hash", "invalid")
    identity = artifact.identity
    if identity.conversation_content_hash != content_hash:
        problems.add("identity.conversation_content_hash", "invalid")
    if identity.checklist_semantic_hash != checklist_semantic_hash(checklist):
        problems.add("identity.checklist_semantic_hash", "invalid")
    if identity.corpus_snapshot_hash != corpus_snapshot_hash(corpus):
        problems.add("identity.corpus_snapshot_hash", "invalid")
    if identity.audio_content_hash is not None and (
        identity.audio_content_hash != conversation.audio.content_hash
    ):
        problems.add("identity.audio_content_hash", "invalid")

    call_ids = [c.call_id for c in artifact.calls]
    if len(set(call_ids)) != len(call_ids):
        problems.add("calls.call_id", "duplicate")
    for i, call in enumerate(artifact.calls):
        if call.outcome == "started" or call.finished_at is None:
            problems.add(f"calls[{i}].outcome", "invalid", i)

    # Fragments must be exact copies of pinned corpus entries.
    chunks = {c.chunk_id: c for c in corpus.chunks}
    sources = {(s.source_id, s.version): s for s in corpus.sources}
    fragment_ids: list[str] = []
    for i, fragment in enumerate(artifact.source_fragments):
        fragment_ids.append(fragment.chunk.chunk_id)
        if chunks.get(fragment.chunk.chunk_id) != fragment.chunk:
            problems.add(f"source_fragments[{i}].chunk", "invalid", i)
        key = (fragment.chunk.source_id, fragment.chunk.source_version)
        if (fragment.source.source_id, fragment.source.version) != key or sources.get(
            key
        ) != fragment.source:
            problems.add(f"source_fragments[{i}].source", "invalid", i)
    if len(set(fragment_ids)) != len(fragment_ids):
        problems.add("source_fragments.chunk", "duplicate")

    origin = "test" if artifact.evaluator_mode == "test" else "ai"
    allowed = set(fragment_ids)
    if artifact.status == "failed":
        if artifact.initial or artifact.automatic_final or artifact.reviews:
            problems.add("status", "invalid")
    else:
        for name, proposals in (
            ("initial", artifact.initial),
            ("automatic", artifact.automatic_final),
        ):
            for d in automatic_proposal_problems(
                conversation, checklist, corpus, proposals, origin=origin, allowed_chunk_ids=allowed
            ).details:
                problems.add(f"{name}.{d.field}", d.reason, d.index)
        initial = {p.criterion_id: p for p in artifact.initial}
        for i, p in enumerate(artifact.automatic_final):
            first = initial.get(p.criterion_id)
            if first is not None and (first.applicability, first.answer_choice_id) != (
                p.applicability,
                p.answer_choice_id,
            ):
                # keep_valid_initial_v1: review never replaces the initial decision.
                problems.add(f"automatic_final[{i}]", "conflicting_duplicate", i)
        reviewed: set[str] = set()
        for i, review in enumerate(artifact.reviews):
            if review.criterion_id not in initial:
                problems.add(f"reviews[{i}].criterion_id", "invalid", i)
                continue
            if review.criterion_id in reviewed:
                problems.add(f"reviews[{i}].criterion_id", "duplicate", i)
            reviewed.add(review.criterion_id)
            if not set(review.call_ids) <= set(call_ids):
                problems.add(f"reviews[{i}].call_ids", "invalid", i)
            if review.outcome in ("agreed", "conflicted"):
                if review.proposal is None:
                    problems.add(f"reviews[{i}].proposal", "missing", i)
                    continue
                for d in automatic_proposal_problems(
                    conversation,
                    checklist,
                    corpus,
                    [review.proposal],
                    origin=origin,
                    allowed_chunk_ids=allowed,
                    require_full_coverage=False,
                ).details:
                    problems.add(f"reviews[{i}].{d.field}", d.reason, i)
                first = initial[review.criterion_id]
                same = (first.applicability, first.answer_choice_id) == (
                    review.proposal.applicability,
                    review.proposal.answer_choice_id,
                )
                if same != (review.outcome == "agreed"):
                    problems.add(f"reviews[{i}].outcome", "invalid", i)
    problems.raise_if_any("Evaluation artifact is inconsistent")
