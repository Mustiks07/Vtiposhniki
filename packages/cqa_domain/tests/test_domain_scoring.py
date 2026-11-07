import decimal
from decimal import Decimal
from typing import Any

import pytest
from _cqa_domain_helpers import (
    contract_fixture,
    original,
    original_proposals,
    proposal,
    rehash,
)
from cqa_contracts.interfaces import DomainValidationError
from cqa_contracts.models import ChecklistVersion, ScoreSummary
from cqa_domain import score


def set_fraction(criterion: dict[str, Any], choice_id: str, fraction: str) -> None:
    for choice in criterion["choices"]:
        if choice["id"] == choice_id:
            choice["score_fraction"] = fraction


def total(summary: ScoreSummary) -> str | None:
    return None if summary.total_score is None else format(summary.total_score, "f")


# MASTER §5 mandatory arithmetic references, in MASTER order.
@pytest.mark.parametrize(
    ("overrides", "na", "expected"),
    [
        ({}, (), "100.00"),
        ({"c6_dialog_management": "p7"}, (), "95.50"),
        (
            {"c4_consultation": "p15", "c6_dialog_management": "p7", "c7_closing": "no"},
            (),
            "85.50",
        ),
        ({}, ("c3_identification",), "100.00"),
        (
            {"c4_consultation": "p15", "c6_dialog_management": "p7"},
            ("c2_needs", "c3_identification"),
            "85.38",
        ),
    ],
)
def test_master_reference_totals(
    overrides: dict[str, str], na: tuple[str, ...], expected: str
) -> None:
    summary = score(original(), original_proposals(overrides, na=na))
    assert summary.status == "complete"
    assert total(summary) == expected


def test_criterion_6_step_7_contributes_10_5_of_15() -> None:
    summary = score(original(), original_proposals({"c6_dialog_management": "p7"}))
    c6 = next(c for c in summary.contributions if c.criterion_id == "c6_dialog_management")
    assert c6.score_fraction == Decimal("0.7")
    assert c6.earned_weight == Decimal("10.5")
    assert c6.original_weight == Decimal("15")
    assert c6.raw_value == 7


def test_flag_is_separate_and_never_reduces_total() -> None:
    clean = score(original(), original_proposals())
    flagged = score(original(), original_proposals({"c8_gross_errors": "yes"}))
    assert total(clean) == total(flagged) == "100.00"
    assert [f.detected for f in flagged.flags] == [True]
    assert [f.detected for f in clean.flags] == [False]
    assert all(c.criterion_id != "c8_gross_errors" for c in flagged.contributions)


def test_undetermined_gives_incomplete_even_for_flag() -> None:
    for cid in ("c4_consultation", "c8_gross_errors"):
        summary = score(original(), original_proposals(undetermined=(cid,)))
        assert summary.status == "incomplete_evaluation"
        assert summary.total_score is None
    flag = score(original(), original_proposals(undetermined=("c8_gross_errors",)))
    assert flag.flags[0].detected is None
    # Contributions of the determined criteria still carry no normalized share.
    assert all(c.normalized_contribution is None for c in flag.contributions)


def test_all_weighted_na_without_undetermined_is_no_applicable_weight() -> None:
    checklist = rehash(contract_fixture("checklist-custom"))
    proposals = [
        proposal("synthetic-binary", None, "not_applicable"),
        proposal("synthetic-scale", None, "not_applicable"),
        proposal("synthetic-flag", "no"),
    ]
    # synthetic-binary forbids N/A in the fixture; build a variant that allows it.
    data = checklist.model_dump(mode="json")
    for c in data["criteria"]:
        if c["id"] == "synthetic-binary":
            c["allow_na"] = True
            c["na_condition"] = "Synthetic condition."
    summary = score(rehash(data), proposals)
    assert summary.status == "no_applicable_weight"
    assert summary.total_score is None
    assert summary.section_results[0].section_percent is None


def test_flag_only_custom_checklist_has_no_total() -> None:
    data = contract_fixture("checklist-custom")
    data["criteria"] = [c for c in data["criteria"] if c["response_type"] == "flag"]
    data["sections"] = []
    summary = score(rehash(data), [proposal("synthetic-flag", "yes")])
    assert summary.status == "no_applicable_weight"
    assert summary.total_score is None
    assert summary.contributions == []


def test_zero_weight_criteria_only_is_no_applicable_weight() -> None:
    data = contract_fixture("checklist-custom")
    for c in data["criteria"]:
        c["weight"] = "0"
    summary = score(
        rehash(data),
        [
            proposal("synthetic-binary", "yes"),
            proposal("synthetic-scale", "high"),
            proposal("synthetic-flag", "no"),
        ],
    )
    assert summary.status == "no_applicable_weight"


@pytest.mark.parametrize(
    ("fraction", "expected"),
    [
        ("0.12345", "12.35"),  # half-even would give 12.34
        ("0.00125", "0.13"),  # half-even would give 0.12
        ("0.00135", "0.14"),
        ("0.99995", "100.00"),
        ("0.99994", "99.99"),
    ],
)
def test_round_half_up_boundaries(fraction: str, expected: str) -> None:
    data = contract_fixture("checklist-custom")
    for c in data["criteria"]:
        if c["id"] == "synthetic-scale":
            set_fraction(c, "middle", fraction)
    data["criteria"] = [c for c in data["criteria"] if c["id"] != "synthetic-binary"]
    summary = score(
        rehash(data), [proposal("synthetic-scale", "middle"), proposal("synthetic-flag", "no")]
    )
    assert total(summary) == expected


def test_no_intermediate_rounding_with_repeating_fractions() -> None:
    data = contract_fixture("checklist-custom")
    for c in data["criteria"]:
        if c["id"] == "synthetic-binary":
            c["weight"] = "1"
        if c["id"] == "synthetic-scale":
            c["weight"] = "2"
            set_fraction(c, "middle", "0.333")
    checklist = rehash(data)
    summary = score(
        checklist,
        [
            proposal("synthetic-binary", "no"),
            proposal("synthetic-scale", "middle"),
            proposal("synthetic-flag", "no"),
        ],
    )
    # 100 * (2 * 0.333) / 3 = 22.2 exactly
    assert total(summary) == "22.20"
    third = score(
        checklist,
        [
            proposal("synthetic-binary", "yes"),
            proposal("synthetic-scale", "low"),
            proposal("synthetic-flag", "no"),
        ],
    )
    assert total(third) == "33.33"


def test_reverse_nonzero_scale_uses_explicit_fractions() -> None:
    data = contract_fixture("checklist-custom")
    for c in data["criteria"]:
        if c["id"] == "synthetic-scale":
            # Reverse direction with a non-zero bottom step: raw 1 is best, raw 3 worst.
            c["choices"] = [
                {
                    "id": "r1",
                    "label": "1",
                    "raw_value": 1,
                    "anchor": "Best.",
                    "score_fraction": "1",
                },
                {
                    "id": "r2",
                    "label": "2",
                    "raw_value": 2,
                    "anchor": "Middle.",
                    "score_fraction": "0.6",
                },
                {
                    "id": "r3",
                    "label": "3",
                    "raw_value": 3,
                    "anchor": "Worst.",
                    "score_fraction": "0.2",
                },
            ]
    checklist = rehash(data)
    for choice, expected in (("r1", "100.00"), ("r2", "76.00"), ("r3", "52.00")):
        summary = score(
            checklist,
            [
                proposal("synthetic-binary", "yes"),
                proposal("synthetic-scale", choice),
                proposal("synthetic-flag", "no"),
            ],
        )
        assert total(summary) == expected


def test_matches_illustrative_contract_score_fixtures() -> None:
    checklist = rehash(contract_fixture("checklist-custom"))
    cases = {
        "score-complete": [("synthetic-binary", "yes"), ("synthetic-scale", "middle")],
        "score-human-effective": [("synthetic-binary", "yes"), ("synthetic-scale", "high")],
    }
    for name, answers in cases.items():
        proposals = [proposal(cid, ch) for cid, ch in answers] + [proposal("synthetic-flag", "no")]
        expected = ScoreSummary.model_validate(contract_fixture(name))
        assert score(checklist, proposals) == expected
    partial = score(
        checklist,
        [
            proposal("synthetic-binary", "yes"),
            proposal("synthetic-scale", None, "undetermined"),
            proposal("synthetic-flag", "no"),
        ],
    )
    assert partial == ScoreSummary.model_validate(contract_fixture("score-partial"))
    na = score(
        checklist,
        [
            proposal("synthetic-binary", "yes"),
            proposal("synthetic-scale", None, "not_applicable"),
            proposal("synthetic-flag", "no"),
        ],
    )
    assert na == ScoreSummary.model_validate(contract_fixture("score-na"))


def test_sections_use_own_denominator_and_contributions_common_one() -> None:
    data = contract_fixture("checklist-custom")
    data["sections"].append({"id": "second", "title": "Second synthetic section"})
    for c in data["criteria"]:
        if c["id"] == "synthetic-scale":
            c["section_id"] = "second"
    checklist = rehash(data)
    summary = score(
        checklist,
        [
            proposal("synthetic-binary", "yes"),
            proposal("synthetic-scale", "middle"),
            proposal("synthetic-flag", "no"),
        ],
    )
    sections = {s.section_id: s for s in summary.section_results}
    assert sections["synthetic-section"].section_percent == Decimal("100.00")
    assert sections["second"].section_percent == Decimal("50.00")
    assert sections["second"].section_earned_weight == Decimal("30")
    shares = sum((c.normalized_contribution or Decimal(0)) for c in summary.contributions)
    assert shares == summary.total_score == Decimal("70.00")


def test_effective_score_after_human_completion_of_partial() -> None:
    checklist = original()
    automatic = original_proposals(undetermined=("c4_consultation",))
    assert score(checklist, automatic).total_score is None
    effective = [
        proposal("c4_consultation", "p15", origin="human")
        if p.criterion_id == "c4_consultation"
        else p
        for p in automatic
    ]
    summary = score(checklist, effective)
    assert summary.status == "complete"
    assert total(summary) == "95.00"


def test_human_not_applicable_is_scored_when_allowed() -> None:
    effective = [
        proposal("c3_identification", None, "not_applicable", origin="human")
        if p.criterion_id == "c3_identification"
        else p
        for p in original_proposals({"c6_dialog_management": "p7"})
    ]
    assert total(score(original(), effective)) == "94.38"


@pytest.mark.parametrize(
    "mutate",
    [
        lambda ps: ps[:-1],  # missing criterion
        lambda ps: ps + [ps[0]],  # duplicate criterion
        lambda ps: [
            proposal("c4_consultation", "p8") if p.criterion_id == "c4_consultation" else p
            for p in ps
        ],  # invented raw 8
        lambda ps: [
            proposal("c1_contact", None, "not_applicable") if p.criterion_id == "c1_contact" else p
            for p in ps
        ],  # forbidden N/A
        lambda ps: ps + [proposal("unknown", "yes")],  # unknown criterion
        lambda ps: [
            proposal("c6_dialog_management", "yes")
            if p.criterion_id == "c6_dialog_management"
            else p
            for p in ps
        ],
    ],
)
def test_invalid_or_incomplete_sets_are_rejected(mutate: object) -> None:
    proposals = original_proposals()
    with pytest.raises(DomainValidationError) as info:
        score(original(), mutate(proposals))  # type: ignore[operator]
    assert info.value.error.code == "validation_error"


def test_score_rejects_checklist_with_tampered_hash() -> None:
    data = original().model_dump(mode="json")
    data["criteria"][0]["weight"] = "11"
    tampered = ChecklistVersion.model_validate(data)
    with pytest.raises(DomainValidationError):
        score(tampered, original_proposals())


def test_score_is_deterministic_and_context_independent() -> None:
    proposals = original_proposals(
        {"c4_consultation": "p15", "c6_dialog_management": "p7"},
        na=("c2_needs", "c3_identification"),
    )
    first = score(original(), proposals)
    with decimal.localcontext() as ctx:
        ctx.prec = 3
        ctx.rounding = decimal.ROUND_DOWN
        second = score(original(), proposals)
    assert first == second
    assert first.model_dump_json() == second.model_dump_json()
