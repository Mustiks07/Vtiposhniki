"""The single Decimal scorer (MASTER §5).

total = 100 × Σ(weight × score_fraction) / Σ(applicable weight), flags excluded,
N/A removes both numerator and denominator. No intermediate rounding; the final
total and section percentages use the checklist rounding policy (ROUND_HALF_UP, 2).
"""

from collections.abc import Sequence
from decimal import ROUND_HALF_UP, Context, Decimal, localcontext
from typing import Literal

from cqa_contracts.models import (
    ChecklistVersion,
    CriterionProposal,
    FlagResult,
    RoundingPolicy,
    ScoreContribution,
    ScoreSummary,
    SectionResult,
)

from .canonical import canonical_decimal
from .checklist import validate_checklist
from .proposals import validate_proposals

_HUNDRED = Decimal(100)
_ZERO = Decimal(0)
# Generous fixed precision, independent of any caller's thread-local context.
_CONTEXT = Context(prec=60)


def _clean(value: Decimal) -> Decimal:
    """Exact value without insignificant trailing zeros (stable wire strings)."""
    return Decimal(canonical_decimal(value))


def round_final(value: Decimal, policy: RoundingPolicy) -> Decimal:
    if policy.mode != "ROUND_HALF_UP":  # pragma: no cover - guarded by the contract type
        raise ValueError("Unsupported rounding mode")
    quantum = Decimal(1).scaleb(-policy.decimal_places)
    return value.quantize(quantum, rounding=ROUND_HALF_UP, context=_CONTEXT)


def score(checklist: ChecklistVersion, proposals: list[CriterionProposal]) -> ScoreSummary:
    """Pure deterministic score of exactly the supplied proposal set.

    Raises DomainValidationError for an invalid rubric or an invalid/incomplete
    proposal set; such sets are not scored as a full evaluation.
    """
    validate_checklist(checklist)
    validate_proposals(checklist, proposals)
    return _score(checklist, proposals)


def _score(checklist: ChecklistVersion, proposals: Sequence[CriterionProposal]) -> ScoreSummary:
    by_id = {p.criterion_id: p for p in proposals}
    with localcontext(_CONTEXT):
        weighted = [c for c in checklist.criteria if c.response_type != "flag"]
        flags = [c for c in checklist.criteria if c.response_type == "flag"]
        undetermined = any(p.applicability == "undetermined" for p in proposals)

        rows: list[tuple[str, CriterionProposal, Decimal | None, Decimal, Decimal | None]] = []
        total_earned = _ZERO
        total_applicable = _ZERO
        for c in weighted:
            p = by_id[c.id]
            fraction: Decimal | None = None
            earned: Decimal | None
            applicable: Decimal
            if p.applicability == "applicable":
                choice = next(ch for ch in c.choices if ch.id == p.answer_choice_id)
                fraction = choice.score_fraction
                assert fraction is not None  # guaranteed by validate_checklist
                earned = c.weight * fraction
                applicable = c.weight
                total_earned += earned
                total_applicable += applicable
            elif p.applicability == "not_applicable":
                earned, applicable = _ZERO, _ZERO
            else:
                earned, applicable = None, _ZERO
            rows.append((c.id, p, earned, applicable, fraction))

        status: Literal["complete", "no_applicable_weight", "incomplete_evaluation"]
        if undetermined:
            status = "incomplete_evaluation"
            total: Decimal | None = None
        elif total_applicable == _ZERO:
            status = "no_applicable_weight"
            total = None
        else:
            status = "complete"
            total = round_final(_HUNDRED * total_earned / total_applicable, checklist.rounding)

        contributions = []
        for c, (cid, p, earned, applicable, fraction) in zip(weighted, rows, strict=True):
            normalized: Decimal | None = None
            if status == "complete" and earned is not None:
                normalized = _clean(_HUNDRED * earned / total_applicable)
            choice_raw = next(
                (ch.raw_value for ch in c.choices if ch.id == p.answer_choice_id), None
            )
            contributions.append(
                ScoreContribution(
                    criterion_id=cid,
                    applicability=p.applicability,
                    answer_choice_id=p.answer_choice_id,
                    raw_value=choice_raw,
                    score_fraction=fraction,
                    original_weight=c.weight,
                    earned_weight=None if earned is None else _clean(earned),
                    applicable_weight=_clean(applicable),
                    normalized_contribution=normalized,
                )
            )

        sections = []
        for s in checklist.sections:
            members = [
                (row, c) for row, c in zip(rows, weighted, strict=True) if c.section_id == s.id
            ]
            s_earned = sum((row[2] for row, _ in members if row[2] is not None), _ZERO)
            s_applicable = sum((row[3] for row, _ in members), _ZERO)
            s_undetermined = any(row[1].applicability == "undetermined" for row, _ in members)
            percent = (
                None
                if s_undetermined or s_applicable == _ZERO
                else round_final(_HUNDRED * s_earned / s_applicable, checklist.rounding)
            )
            sections.append(
                SectionResult(
                    section_id=s.id,
                    section_earned_weight=_clean(s_earned),
                    section_applicable_weight=_clean(s_applicable),
                    section_percent=percent,
                )
            )

        flag_results = []
        for c in flags:
            p = by_id[c.id]
            detected: bool | None = None
            if p.applicability == "applicable":
                detected = p.answer_choice_id in c.flag_when_choice_ids
            flag_results.append(
                FlagResult(
                    criterion_id=c.id, detected=detected, answer_choice_id=p.answer_choice_id
                )
            )

    return ScoreSummary(
        status=status,
        total_score=total,
        contributions=contributions,
        section_results=sections,
        flags=flag_results,
    )
