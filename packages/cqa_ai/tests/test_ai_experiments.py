import json
from pathlib import Path

import pytest
from cqa_ai.experiments import check_split, load_cases, main, report
from cqa_domain import original_checklist

ROOT = Path(__file__).resolve().parents[3]
DATASET = ROOT / "fixtures/evaluation"
PROFILES = [
    "--profile",
    f"baseline={DATASET / 'profiles/baseline.json'}",
    "--profile",
    f"b-light={DATASET / 'profiles/b-light.json'},{DATASET / 'corpus/manifest.json'}",
]


def test_fixture_cases_are_synthetic_labelled_and_cover_rubric() -> None:
    cases = load_cases(DATASET)
    assert len(cases) >= 6
    ids = {c.id for c in original_checklist().criteria}
    for case in cases:
        assert case.labels is not None
        assert case.labels["provenance"] == "rule_synthetic"
        assert set(case.labels["answers"]) == ids
        assert case.labels["labelled_before_model_output"] is True
    assert {c.conversation.language for c in cases} == {"RU", "KZ", "EN"}
    assert {c.conversation.channel for c in cases} == {"agent_chat", "voice_call"}


def test_scenario_split_keeps_language_variants_together() -> None:
    manifest = json.loads((DATASET / "scenario-manifest.json").read_text(encoding="utf-8"))
    cases = load_cases(DATASET)
    assert check_split(manifest, cases) == []
    families = {c.case_id: c.group_id for c in cases}
    assert families["syn-kz-chat-002"] == families["syn-en-chat-002"]
    leaked = json.loads(json.dumps(manifest))
    leaked["groups"].append(
        {"group_id": "g-other", "split": "tune", "members": ["syn-en-chat-002"]}
    )
    assert check_split(leaked, cases)


def test_offline_replay_report(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    out = tmp_path / "report.json"
    assert main(["--dataset", str(DATASET), *PROFILES, "--out", str(out)]) == 0
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["mode"] == "offline_replay"
    assert "not model quality" in data["disclaimer"]
    base, light = data["profiles"]["baseline"], data["profiles"]["b-light"]
    for profile in (base, light):
        assert profile["metric_kind"] == "formal_check"  # never "accuracy" here
        assert profile["cost"] is None and profile["cost_complete"] is False
        assert profile["excluded"]["total_not_comparable"] == 1  # undetermined label
    assert light["provider_calls"] > base["provider_calls"]
    assert light["review_outcomes"] == {"agreed": 1, "conflicted": 1}
    # keep_valid_initial_v1: a conflicting review never changes automatic_final.
    assert data["comparison"]["changed_decisions"] == 0
    capsys.readouterr()


def test_metric_kind_depends_on_label_provenance() -> None:
    cases = load_cases(DATASET)
    checklist = original_checklist()
    for provenance, expected in (
        ("human", "accuracy"),
        ("official", "accuracy"),
        ("model_generated", "agreement"),
    ):
        for case in cases:
            assert case.labels is not None
            case.labels["provenance"] = provenance
        from cqa_ai.experiments import ProfileRun

        result = report([ProfileRun("p")], cases, checklist, "offline_replay")
        assert result["profiles"]["p"]["metric_kind"] == expected


def test_split_filter_runs_only_check_groups(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    out = tmp_path / "check.json"
    assert main(["--dataset", str(DATASET), *PROFILES, "--split", "check", "--out", str(out)]) == 0
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["cases"] == 4
    capsys.readouterr()
