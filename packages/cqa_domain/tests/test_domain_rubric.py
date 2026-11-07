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


def test_sectioned_version_preserves_answers_total_and_na_denominators() -> None:
    from _cqa_domain_helpers import proposal
    from cqa_domain import score, sectioned_original_checklist

    old, grouped = original_checklist(), sectioned_original_checklist()
    validate_checklist(grouped)
    assert old.semantic_hash == grouped.semantic_hash
    assert old.scoring_config_hash != grouped.scoring_config_hash
    answers = [
        proposal(c.id, None, "not_applicable")
        if c.id in {"c2_needs", "c3_identification"}
        else proposal(c.id, c.choices[0].id)
        for c in old.criteria
    ]
    before, after = score(old, answers), score(grouped, answers)
    assert before.total_score == after.total_score == Decimal(100)
    assert before.flags == after.flags
    assert [s.section_applicable_weight for s in after.section_results] == [10, 20, 35, 0]
    assert [s.section_percent for s in after.section_results] == [100, 100, 100, None]


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


def test_original_fractions_are_exact_under_low_precision() -> None:
    import decimal
    from fractions import Fraction

    with decimal.localcontext() as ctx:
        ctx.prec = 1
        checklist = original_checklist()
    by_id = {c.id: c for c in checklist.criteria}
    expected = {
        "c4_consultation": {"p20": "1", "p15": "0.75", "p10": "0.5", "p5": "0.25", "p0": "0"},
        "c6_dialog_management": {"p10": "1", "p7": "0.7", "p4": "0.4", "p0": "0"},
    }
    for cid, fractions in expected.items():
        for ch in by_id[cid].choices:
            assert ch.score_fraction == Decimal(fractions[ch.id])
            assert Fraction(ch.score_fraction) == Fraction(
                ch.raw_value,
                20
                if cid  # type: ignore[arg-type]
                == "c4_consultation"
                else 10,
            )
