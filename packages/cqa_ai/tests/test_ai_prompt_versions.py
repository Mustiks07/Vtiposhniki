"""Pinned prompt versions must not silently change older evaluation profiles."""

import json
from pathlib import Path

import pytest
from _cqa_ai_helpers import conversation, make, profile, run
from cqa_ai.prompts import (
    AUTHORIZATION_AND_CLOSURE_V7,
    BOUNDARIES_V5,
    CONSISTENCY_V4,
    DECISION_DISCIPLINE_V3,
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
    ["cqa-eval-v2", "cqa-eval-v3", "cqa-eval-v4", "cqa-eval-v5", "cqa-eval-v6", "cqa-eval-v7"],
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
        if version in {"cqa-eval-v5", "cqa-eval-v6", "cqa-eval-v7"}:
            expected += "\n" + BOUNDARIES_V5
        if version in {"cqa-eval-v6", "cqa-eval-v7"}:
            expected += "\n" + OBSERVABLE_CONDUCT_V6
        if version == "cqa-eval-v7":
            expected += "\n" + AUTHORIZATION_AND_CLOSURE_V7
        assert request.messages[0].content == expected
    assert "INITIAL-ONLY-SENTINEL" not in transport.requests[1].messages[1].content


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
