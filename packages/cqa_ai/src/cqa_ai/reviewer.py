"""Optional blind reviewer, policy keep_valid_initial_v1 (MASTER §10).

Selection uses the initial proposals' trigger flags, but the reviewer prompt is
built from the original conversation, the neutral criterion and the same pinned
sources only — never the initial answer, rationale or evidence. A formally valid
disagreement keeps the initial decision in automatic_final and marks a conflict.
Reviewer failure, budget or deadline exhaustion keep the initial with a limitation.
"""

from collections.abc import Sequence

from cqa_contracts.models import ChecklistDraft, CriterionProposal, ReasonCode
from cqa_domain import REVIEW_TRIGGER_CODES


def select_for_review(
    checklist: ChecklistDraft, initial: Sequence[CriterionProposal], max_criteria: int
) -> list[str]:
    """Deterministic: highest-priority trigger first, then checklist order.

    Undetermined proposals and proposals without a trigger are not reviewed;
    N/A is reviewed only when flagged as disputed applicability.
    """
    order = {c.id: i for i, c in enumerate(checklist.criteria)}
    ranked: list[tuple[int, int, str]] = []
    for p in initial:
        if p.applicability == "undetermined":
            continue
        triggers = [
            REVIEW_TRIGGER_CODES.index(code)
            for code in p.review_reasons
            if code in REVIEW_TRIGGER_CODES
        ]
        if ReasonCode.CONFLICTING_EVIDENCE in p.reason_codes:
            triggers.append(REVIEW_TRIGGER_CODES.index("observed_contradiction"))
        if not triggers:
            continue
        ranked.append((min(triggers), order[p.criterion_id], p.criterion_id))
    ranked.sort()
    return [cid for _, _, cid in ranked[:max_criteria]]


def mark(proposal: CriterionProposal, marker: str) -> CriterionProposal:
    if marker in proposal.review_reasons:
        return proposal
    return proposal.model_copy(update={"review_reasons": [*proposal.review_reasons, marker]})
