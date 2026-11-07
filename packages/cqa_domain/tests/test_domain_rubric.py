from decimal import Decimal

from _cqa_domain_helpers import ROOT
from cqa_domain import original_checklist, validate_checklist
from cqa_domain.rubric import original_checklist_json

EXPECTED = [
    # id, weight, response_type, allow_na, raw values
    ("c1_contact", "10", "binary", False, [True, False]),
    ("c2_needs", "15", "binary", True, [True, False]),
    ("c3_identification", "20", "binary", True, [True, False]),
    ("c4_consultation", "20", "scale", True, [20, 15, 10, 5, 0]),
    ("c5_empathy", "15", "binary", False, [True, False]),
    ("c6_dialog_management", "15", "scale", False, [10, 7, 4, 0]),
    ("c7_closing", "5", "binary", True, [True, False]),
    ("c8_gross_errors", "0", "flag", False, [True, False]),
]


def test_original_rubric_matches_master_section_4() -> None:
    checklist = original_checklist()
    validate_checklist(checklist)
    assert [
        (
            c.id,
            format(c.weight, "f"),
            c.response_type,
            c.allow_na,
            [ch.raw_value for ch in c.choices],
        )
        for c in checklist.criteria
    ] == EXPECTED
    assert sum(c.weight for c in checklist.criteria) == Decimal(100)
    assert checklist.sections == []


def test_fractions_follow_raw_over_max_for_original_scales() -> None:
    by_id = {c.id: c for c in original_checklist().criteria}
    for cid, maximum in (("c4_consultation", 20), ("c6_dialog_management", 10)):
        for ch in by_id[cid].choices:
            assert ch.score_fraction == Decimal(ch.raw_value) / maximum  # type: ignore[arg-type]
    for cid in ("c1_contact", "c2_needs", "c3_identification", "c5_empathy", "c7_closing"):
        fractions = {ch.id: ch.score_fraction for ch in by_id[cid].choices}
        assert fractions == {"yes": Decimal(1), "no": Decimal(0)}
    flag = by_id["c8_gross_errors"]
    assert flag.weight == 0
    assert all(ch.score_fraction is None for ch in flag.choices)
    assert flag.flag_when_choice_ids == ["yes"]


def test_na_conditions_only_where_master_allows() -> None:
    for c in original_checklist().criteria:
        assert (c.na_condition is not None) == c.allow_na


def test_every_choice_has_meaningful_anchor() -> None:
    for c in original_checklist().criteria:
        for ch in c.choices:
            assert len(ch.anchor) > 10


def test_voice_policy_for_criterion_6_requires_audio_for_tempo() -> None:
    c6 = next(c for c in original_checklist().criteria if c.id == "c6_dialog_management")
    assert "звука" in c6.channel_instructions.voice_call
    assert c6.channel_instructions.voice_policy_version == "text-observable-v1"


def test_rubric_is_deterministic_and_published_snapshot_is_current() -> None:
    assert original_checklist() == original_checklist()
    snapshot = (ROOT / "fixtures/evaluation/original-checklist.json").read_text(encoding="utf-8")
    assert snapshot == original_checklist_json(), (
        "Regenerate: uv run python -m cqa_domain rubric fixtures/evaluation/original-checklist.json"
    )
