"""Wire examples and safety boundaries, not domain arithmetic acceptance."""

import json
import subprocess
import sys
from pathlib import Path

import pytest
from cqa_contracts import http_models, models
from pydantic import ValidationError

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "fixtures/contracts"
MANIFEST = json.loads((FIXTURES / "manifest.json").read_text(encoding="utf-8"))


def load(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("entry", MANIFEST["fixtures"], ids=lambda entry: entry["file"])
def test_fixture_validates_and_round_trips(entry: dict) -> None:
    cls = getattr(models, entry["model"], None) or getattr(http_models, entry["model"])
    payload = json.loads((FIXTURES / entry["file"]).read_text(encoding="utf-8"))
    assert cls.model_validate(payload).model_dump(mode="json") == payload


def test_manifest_covers_all_fixture_json() -> None:
    assert MANIFEST["synthetic"] is True
    assert {entry["file"] for entry in MANIFEST["fixtures"]} == {
        p.name for p in FIXTURES.glob("*.json") if p.name != "manifest.json"
    }


def test_regeneration_is_deterministic(tmp_path: Path) -> None:
    subprocess.run(
        [sys.executable, str(ROOT / "scripts/build_fixtures.py"), "--output", str(tmp_path)],
        check=True,
    )
    for expected in FIXTURES.glob("*.json"):
        assert (tmp_path / expected.name).read_bytes() == expected.read_bytes()


def test_partial_automatic_is_preserved_after_human_completion() -> None:
    view = models.EvaluationView.model_validate(load("evaluation-human-completed"))
    assert view.artifact.status == "partial"
    assert view.automatic_score.total_score is None
    assert view.effective_score.status == "complete"
    assert all(p.applicability != "undetermined" for p in view.effective_proposals)
    assert any(p.applicability == "undetermined" for p in view.artifact.automatic_final)
    assert view.human_decisions[0].replacement.origin == "human"


def test_confirmation_preserves_current_value_and_review_limit_preserves_initial() -> None:
    view = models.EvaluationView.model_validate(load("evaluation-confirmed"))
    assert view.human_decisions[0].replacement is None
    assert view.effective_proposals == view.artifact.automatic_final
    artifact = models.EvaluationArtifact.model_validate(load("artifact-review-budget"))
    assert artifact.initial == artifact.automatic_final
    assert artifact.reviews[0].outcome == "skipped"
    assert artifact.reviews[0].call_ids == []


def walk(value: object):
    if isinstance(value, dict):
        for key, item in value.items():
            yield key, item
            yield from walk(item)
    elif isinstance(value, list):
        for item in value:
            yield from walk(item)


@pytest.mark.parametrize("name", ["safe-export-automatic", "safe-export-effective"])
def test_safe_exports_contain_no_free_text_and_keep_failed_pending(name: str) -> None:
    payload = load(name)
    forbidden = {
        "text",
        "rationale",
        "comment",
        "reason",
        "explanation",
        "source_fragments",
        "safe_url",
        "audio_url",
        "api_key",
        "message",
    }
    assert not forbidden.intersection(key for key, _ in walk(payload))
    assert "PRIVATE_TEXT_SENTINEL" not in json.dumps(payload)
    assert {item["job_state"] for item in payload["items"]} >= {"succeeded", "failed", "queued"}
    assert all(item["cost"] is None and item["cost_complete"] is False for item in payload["items"])
    unsafe = payload | {"rationale": "must not be accepted"}
    with pytest.raises(ValidationError):
        models.SafeExport.model_validate(unsafe)
    unsafe_item = payload["items"][0] | {"comment": "must not be accepted"}
    with pytest.raises(ValidationError):
        models.SafeExportItem.model_validate(unsafe_item)


def test_audio_examples_never_invent_alignment() -> None:
    for name in ["conversation-voice-unavailable", "conversation-voice-unverified"]:
        conversation = models.Conversation.model_validate(load(name))
        assert conversation.audio.mapping is None
        assert conversation.audio.alignment_status != "verified"


def test_all_undetermined_is_a_complete_set_of_proposals_but_partial_artifact() -> None:
    artifact = models.EvaluationArtifact.model_validate(load("artifact-all-undetermined"))
    checklist = models.ChecklistVersion.model_validate(load("checklist-custom"))
    assert artifact.status == "partial"
    assert {p.criterion_id for p in artifact.automatic_final} == {c.id for c in checklist.criteria}
    assert all(
        p.applicability == "undetermined" and p.answer_choice_id is None
        for p in artifact.automatic_final
    )
