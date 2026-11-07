"""Flag states consumed by the flag filter (docs/FLAG_FILTER_CONTRACT.md).

detected=True only for an explicit triggering answer — also when other criteria
are undetermined; False only for an explicit non-triggering answer; N/A and
undetermined stay None (unknown), never False.
"""

from typing import Any

import pytest
from _cqa_domain_helpers import contract_fixture, original, original_proposals, proposal, rehash
from cqa_domain import score


def flags(summary: Any) -> dict[str, tuple[bool | None, str | None]]:
    return {f.criterion_id: (f.detected, f.answer_choice_id) for f in summary.flags}


def test_confirmed_flag_stays_true_when_other_criteria_are_undetermined() -> None:
    summary = score(
        original(),
        original_proposals({"c8_gross_errors": "yes"}, undetermined=("c4_consultation",)),
    )
    assert summary.status == "incomplete_evaluation"
    assert summary.total_score is None
    assert flags(summary) == {"c8_gross_errors": (True, "yes")}


def test_explicit_negative_flag_with_partial_rest_is_false() -> None:
    summary = score(original(), original_proposals(undetermined=("c2_needs",)))
    assert flags(summary) == {"c8_gross_errors": (False, "no")}


def test_undetermined_flag_is_unknown_not_false() -> None:
    summary = score(original(), original_proposals(undetermined=("c8_gross_errors",)))
    assert flags(summary) == {"c8_gross_errors": (None, None)}


def arbitrary_flag_checklist(allow_na: bool = True) -> Any:
    data = contract_fixture("checklist-custom")
    for c in data["criteria"]:
        if c["response_type"] == "flag":
            c["id"] = "arbitrary-flag-id"
            c["title"] = "Произвольный пользовательский флаг"
            c["choices"] = [
                {
                    "id": "violation",
                    "label": "Нарушение",
                    "raw_value": "violation",
                    "anchor": "Synthetic violation anchor.",
                    "score_fraction": None,
                },
                {
                    "id": "clear",
                    "label": "Нет нарушения",
                    "raw_value": "clear",
                    "anchor": "Synthetic clear anchor.",
                    "score_fraction": None,
                },
            ]
            c["flag_when_choice_ids"] = ["violation"]
            c["allow_na"] = allow_na
            c["na_condition"] = "Synthetic: no opportunity for the violation." if allow_na else None
    return rehash(data)


@pytest.mark.parametrize(
    ("answer", "applicability", "expected"),
    [
        ("violation", "applicable", (True, "violation")),
        ("clear", "applicable", (False, "clear")),
        (None, "not_applicable", (None, None)),
        (None, "undetermined", (None, None)),
    ],
)
def test_arbitrary_flag_id_states(
    answer: str | None, applicability: str, expected: tuple[bool | None, str | None]
) -> None:
    checklist = arbitrary_flag_checklist()
    summary = score(
        checklist,
        [
            proposal("synthetic-binary", "yes"),
            proposal("synthetic-scale", None, "undetermined"),  # partial elsewhere
            proposal("arbitrary-flag-id", answer, applicability),
        ],
    )
    assert flags(summary) == {"arbitrary-flag-id": expected}
    assert summary.status == "incomplete_evaluation"


def test_flag_never_changes_total() -> None:
    checklist = arbitrary_flag_checklist()
    totals = set()
    for answer, applicability in (
        ("violation", "applicable"),
        ("clear", "applicable"),
        (None, "not_applicable"),
    ):
        totals.add(
            score(
                checklist,
                [
                    proposal("synthetic-binary", "yes"),
                    proposal("synthetic-scale", "middle"),
                    proposal("arbitrary-flag-id", answer, applicability),
                ],
            ).total_score
        )
    assert len(totals) == 1


def test_automatic_true_and_effective_after_human_change_are_scored_independently() -> None:
    checklist = original()
    automatic = original_proposals({"c8_gross_errors": "yes"}, undetermined=("c4_consultation",))
    effective = [
        proposal("c8_gross_errors", "no", origin="human")
        if p.criterion_id == "c8_gross_errors"
        else proposal("c4_consultation", "p20", origin="human")
        if p.criterion_id == "c4_consultation"
        else p
        for p in automatic
    ]
    auto_summary = score(checklist, automatic)
    effective_summary = score(checklist, effective)
    assert flags(auto_summary) == {"c8_gross_errors": (True, "yes")}
    assert flags(effective_summary) == {"c8_gross_errors": (False, "no")}
    assert auto_summary.total_score is None
    assert effective_summary.status == "complete"
    # Inputs are untouched: automatic still carries the original true flag.
    assert automatic[-1].answer_choice_id == "yes"


def test_flag_only_checklist_reports_flag_without_total() -> None:
    data = contract_fixture("checklist-custom")
    data["criteria"] = [c for c in data["criteria"] if c["response_type"] == "flag"]
    data["sections"] = []
    summary = score(rehash(data), [proposal("synthetic-flag", "yes")])
    assert summary.status == "no_applicable_weight"
    assert flags(summary) == {"synthetic-flag": (True, "yes")}
