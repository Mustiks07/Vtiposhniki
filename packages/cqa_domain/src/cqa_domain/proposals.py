"""Proposal validation against a rubric (applies to automatic and effective sets)."""

from collections.abc import Sequence

from cqa_contracts.models import ChecklistDraft, Criterion, CriterionProposal, ReasonCode

from .errors import Problems


def proposal_problems(
    criterion: Criterion, proposal: CriterionProposal, index: int, problems: Problems
) -> None:
    """Rules for one proposal of one criterion; usable during repair diagnostics."""
    path = f"proposals[{index}]"
    if proposal.criterion_id != criterion.id:
        problems.add(f"{path}.criterion_id", "invalid", index)
        return
    choice_ids = {ch.id for ch in criterion.choices}
    if proposal.applicability == "applicable":
        if proposal.answer_choice_id not in choice_ids:
            problems.add(f"{path}.answer_choice_id", "invalid", index)
    elif proposal.answer_choice_id is not None:
        problems.add(f"{path}.answer_choice_id", "invalid", index)
    if proposal.applicability == "not_applicable" and not criterion.allow_na:
        problems.add(f"{path}.applicability", "unsupported", index)
    if proposal.origin != "human" and {
        ReasonCode.HUMAN_CHANGED,
        ReasonCode.HUMAN_CONFIRMED,
    }.intersection(proposal.reason_codes):
        problems.add(f"{path}.reason_codes", "invalid", index)
    if len(set(proposal.reason_codes)) != len(proposal.reason_codes):
        problems.add(f"{path}.reason_codes", "duplicate", index)


def proposal_set_problems(
    checklist: ChecklistDraft, proposals: Sequence[CriterionProposal]
) -> Problems:
    """Exactly one structurally valid proposal per rubric criterion."""
    problems = Problems()
    by_id = {c.id: c for c in checklist.criteria}
    seen: set[str] = set()
    for i, p in enumerate(proposals):
        criterion = by_id.get(p.criterion_id)
        if criterion is None:
            problems.add(f"proposals[{i}].criterion_id", "invalid", i)
            continue
        if p.criterion_id in seen:
            problems.add(f"proposals[{i}].criterion_id", "duplicate", i)
            continue
        seen.add(p.criterion_id)
        proposal_problems(criterion, p, i, problems)
    for i, c in enumerate(checklist.criteria):
        if c.id not in seen:
            problems.add(f"criteria[{i}].id", "missing", i)
    return problems


def validate_proposals(checklist: ChecklistDraft, proposals: Sequence[CriterionProposal]) -> None:
    proposal_set_problems(checklist, proposals).raise_if_any("Proposals do not match the rubric")
