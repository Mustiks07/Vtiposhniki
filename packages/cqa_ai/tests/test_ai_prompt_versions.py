"""Pinned prompt versions must not silently change older evaluation profiles."""

import hashlib
import json
from pathlib import Path
from typing import Literal

import pytest
from _cqa_ai_helpers import conversation, make, profile, run
from cqa_ai.prompts import (
    AUTHORIZATION_AND_CLOSURE_V7,
    BOUNDARIES_V5,
    CONSISTENCY_V4,
    DECISION_DISCIPLINE_V3,
    NA_FIRST_V9,
    NEED_AND_CLOSING_PHASES_V8,
    OBSERVABLE_CONDUCT_V6,
    SYSTEM_PRIMARY,
    SYSTEM_REVIEW,
    build_messages,
)
from cqa_ai.testing import answer_all, ok
from cqa_contracts.models import EvaluatorProfile
from cqa_domain import original_checklist, profile_hash


@pytest.mark.parametrize(
    "version",
    [
        "cqa-eval-v2",
        "cqa-eval-v3",
        "cqa-eval-v4",
        "cqa-eval-v5",
        "cqa-eval-v6",
        "cqa-eval-v7",
        "cqa-eval-v8",
        "cqa-eval-v9",
    ],
)
async def test_primary_and_blind_review_use_pinned_prompt(version: str) -> None:
    checklist, conv = original_checklist(), conversation()
    initial = answer_all(checklist, conv, flags={"c8_gross_errors": ["potential_violation"]})
    initial["criteria"][0]["rationale"] = "INITIAL-ONLY-SENTINEL"
    review = answer_all(checklist, conv)
    review["criteria"] = [c for c in review["criteria"] if c["criterion_id"] == "c8_gross_errors"]
    evaluator, transport, _ = make([ok(initial), ok(review)])
    prof = profile(reviewer=True, max_criteria=1).model_copy(update={"prompt_version": version})
    result, _ = await run(evaluator, prof=prof)
    assert result.status == "complete"
    assert result.identity.profile_hash == profile_hash(prof)
    assert len(transport.requests) == 2
    for request, legacy in zip(transport.requests, (SYSTEM_PRIMARY, SYSTEM_REVIEW), strict=True):
        expected = legacy if version == "cqa-eval-v2" else legacy + "\n" + DECISION_DISCIPLINE_V3
        if version == "cqa-eval-v4":
            expected += "\n" + CONSISTENCY_V4
        if version in {"cqa-eval-v5", "cqa-eval-v6", "cqa-eval-v7", "cqa-eval-v8", "cqa-eval-v9"}:
            expected += "\n" + BOUNDARIES_V5
        if version in {"cqa-eval-v6", "cqa-eval-v7", "cqa-eval-v8", "cqa-eval-v9"}:
            expected += "\n" + OBSERVABLE_CONDUCT_V6
        if version in {"cqa-eval-v7", "cqa-eval-v8", "cqa-eval-v9"}:
            expected += "\n" + AUTHORIZATION_AND_CLOSURE_V7
        if version == "cqa-eval-v8":
            expected += "\n" + NEED_AND_CLOSING_PHASES_V8
        if version == "cqa-eval-v9":
            expected += "\n" + NA_FIRST_V9
        assert request.messages[0].content == expected
    assert "INITIAL-ONLY-SENTINEL" not in transport.requests[1].messages[1].content


def test_existing_profile_prompts_keep_pre_experiment_bytes() -> None:
    path = Path(__file__).resolve().parents[3] / "fixtures/evaluation/prompt-system-sha256.json"
    for version, modes in json.loads(path.read_text()).items():
        for mode, digest in modes.items():
            messages = build_messages(
                mode, conversation(), original_checklist(), [], prompt_version=version
            )
            assert hashlib.sha256(messages[0].content.encode()).hexdigest() == digest


def test_v8_diagnostic_keeps_the_same_rubric_and_input() -> None:
    args = ("primary", conversation(), original_checklist(), [])
    old = build_messages(*args, prompt_version="cqa-eval-v7")
    new = build_messages(*args, prompt_version="cqa-eval-v8")
    assert old[1] == new[1]
    assert new[0].content.startswith(old[0].content)
    assert "p1-" not in new[0].content and "p4-" not in new[0].content


@pytest.mark.parametrize("mode", ["primary", "review"])
def test_v9_is_v7_plus_only_na_rules(mode: Literal["primary", "review"]) -> None:
    args = (mode, conversation(), original_checklist(), [])
    old = build_messages(*args, prompt_version="cqa-eval-v7")
    new = build_messages(*args, prompt_version="cqa-eval-v9")
    assert old[1] == new[1]
    assert new[0].content == old[0].content + "\n" + NA_FIRST_V9
    assert NEED_AND_CLOSING_PHASES_V8 not in new[0].content
    assert "p1-" not in new[0].content and "p2-" not in new[0].content


def test_v9_profile_changes_only_identity_and_prompt() -> None:
    folder = Path(__file__).resolve().parents[3] / "examples/control-config/profiles"
    old = EvaluatorProfile.model_validate_json((folder / "boundary-gemini-v7-1.json").read_text())
    new = EvaluatorProfile.model_validate_json((folder / "boundary-gemini-v9-1.json").read_text())
    assert new.id == "boundary-gemini-v9-1"
    assert new.prompt_version == "cqa-eval-v9"
    assert new.model_copy(update={"id": old.id, "prompt_version": old.prompt_version}) == old
    assert profile_hash(new) != profile_hash(old)


def test_v3_changes_instructions_without_changing_rubric_or_conversation() -> None:
    args = ("primary", conversation(), original_checklist(), [])
    old = build_messages(*args, prompt_version="cqa-eval-v2")
    new = build_messages(*args, prompt_version="cqa-eval-v3")
    assert old[1] == new[1]
    payload = json.loads(new[1].content)
    assert all("weight" not in c for c in payload["rubric"])
    with pytest.raises(ValueError, match="Unsupported"):
        build_messages(*args, prompt_version="unknown-version")


@pytest.mark.parametrize(
    "filename,version",
    [
        ("live-xerosharc-rubric-v3.json", "cqa-eval-v3"),
        ("live-xerosharc-quality-v1.json", "cqa-eval-v4"),
    ],
)
def test_xerosharc_candidate_preserves_baseline_and_bounds_retries(
    filename: str, version: str
) -> None:
    folder = Path(__file__).resolve().parents[3] / "examples/xerosharc-config/profiles"
    old = EvaluatorProfile.model_validate_json((folder / "live-xerosharc-sol-v1.json").read_text())
    new = EvaluatorProfile.model_validate_json((folder / filename).read_text())
    assert old.prompt_version == "cqa-eval-v2"
    assert new.prompt_version == version
    assert new.id != old.id and profile_hash(new) != profile_hash(old)
    assert new.primary == old.primary
    assert new.retries.max_provider_calls == 4
    assert new.retries.max_transport_retries == 1
    assert new.retries.max_job_attempts == 2
