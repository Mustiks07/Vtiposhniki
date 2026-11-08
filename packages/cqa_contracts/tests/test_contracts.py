import hashlib
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from cqa_contracts import hash_inputs
from cqa_contracts import models as m
from cqa_contracts.interfaces import BudgetExceeded, ConfigurationError, ObserverPersistenceError
from cqa_contracts.operations import create_contract_app
from cqa_contracts.runtime import require_production_configuration
from cqa_contracts.testing import SyntheticEvaluator
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from pydantic import ValidationError

ROOT = Path(__file__).resolve().parents[3]


def fixture(model, name):
    return model.model_validate_json(
        (ROOT / "fixtures/contracts" / f"{name}.json").read_text(encoding="utf-8")
    )


def test_http_contract_ids_and_safe_errors():
    client = TestClient(create_contract_app())
    schema = client.get("/openapi.json").json()
    operations = [
        op
        for item in schema["paths"].values()
        for method, op in item.items()
        if method in {"get", "post"}
    ]
    assert len(operations) == 25
    assert len({op["operationId"] for op in operations}) == 25
    assert {"createSecondOpinion", "listSecondOpinions"} <= {op["operationId"] for op in operations}
    assert client.get("/api/v1/health").json()["business_ready"] is False
    error = client.get("/api/v1/conversations")
    assert error.status_code == 501
    assert m.APIError.model_validate(error.json()).code == "not_implemented"
    invalid = client.post(
        "/api/v1/imports", json={"source": "json", "records": [], "SECRET_INPUT": "never echo me"}
    )
    assert invalid.status_code == 422
    assert "never echo me" not in invalid.text
    m.APIError.model_validate(invalid.json())
    batch = client.post(
        "/api/v1/evaluation-batches",
        json={
            "conversation_ids": ["c"],
            "checklist_version_id": "v",
            "profile_id": "p",
            "mode": "fresh",
        },
    )
    assert batch.status_code == 422  # idempotency header is mandatory
    assert "Idempotency-Key" in batch.text


def test_runtime_openapi_matches_generated():
    from cqa_api.main import create_app

    assert create_app().openapi() == json.loads(
        (ROOT / "contracts/openapi.json").read_text(encoding="utf-8")
    )


@pytest.mark.parametrize("bad", [0.5, "NaN", "Infinity", "-0.1", "1.1", "invalid", "1e-1"])
def test_fraction_rejects_numeric_wire_or_invalid_range(bad):
    with pytest.raises((ValidationError, ValueError)):
        m.Choice(id="x", label="x", raw_value=1, anchor="x", score_fraction=bad)


def test_ai_cannot_claim_human_provenance_and_mapping_is_verified():
    proposal = fixture(m.EvaluationArtifact, "artifact-complete").initial[0].model_dump(mode="json")
    with pytest.raises(ValidationError):
        m.CriterionProposal.model_validate(proposal | {"reason_codes": ["human_changed"]})
    with pytest.raises(ValidationError):
        m.AudioMetadata(availability="unknown", alignment_status="unverified", mapping=[])
    with pytest.raises(ValidationError):
        m.ScoreSummary(
            status="incomplete_evaluation",
            total_score="0",
            contributions=[],
            section_results=[],
            flags=[],
        )


def test_json_schema_validates_every_contract_fixture():
    schema = json.loads((ROOT / "contracts/json-schema.json").read_text(encoding="utf-8"))
    manifest = json.loads((ROOT / "fixtures/contracts/manifest.json").read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    for entry in manifest["fixtures"]:
        validator = Draft202012Validator(
            {"$defs": schema["$defs"], "$ref": f"#/$defs/{entry['model']}"}
        )
        payload = json.loads(
            (ROOT / "fixtures/contracts" / entry["file"]).read_text(encoding="utf-8")
        )
        validator.validate(payload)


def test_hash_vector_shapes_and_expected_bytes():
    vectors = json.loads((ROOT / "fixtures/hashing/vectors.json").read_text(encoding="utf-8"))[
        "vectors"
    ]
    models = {
        "content": hash_inputs.ConversationHashInput,
        "semantic": hash_inputs.SemanticHashInput,
        "scoring": hash_inputs.ScoringHashInput,
        "profile": m.EvaluatorProfile,
        "corpus": hash_inputs.CorpusHashInput,
        "reuse": m.EvaluationIdentity,
    }
    assert set(models) == {v["kind"] for v in vectors}
    for vector in vectors:
        models[vector["kind"]].model_validate(vector["projection"])
        expected = json.dumps(
            vector["projection"], ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        assert expected == vector["canonical_json"]
        assert hashlib.sha256(expected.encode("utf-8")).hexdigest() == vector["sha256"]


def test_production_without_keys_fails_closed():
    profile = fixture(m.EvaluatorProfile, "profile-test").model_dump(mode="json")
    production = m.EvaluatorProfile.model_validate(
        profile
        | {
            "mode": "production",
            "primary": {
                "provider": "gemini",
                "model": "explicit-unconfigured-model",
                "configuration_ref": "GEMINI_API_KEY",
            },
        }
    )
    with pytest.raises(ConfigurationError):
        require_production_configuration(production, {})
    with pytest.raises(ConfigurationError):
        SyntheticEvaluator(app_mode="production")
    with pytest.raises(ValidationError):
        m.EvaluatorProfile.model_validate(profile | {"mode": "production"})


def evaluator_inputs():
    return dict(
        conversation=fixture(m.Conversation, "conversation-chat"),
        checklist=fixture(m.ChecklistVersion, "checklist-custom"),
        profile=fixture(m.EvaluatorProfile, "profile-test"),
        corpus=fixture(m.CorpusSnapshot, "corpus-synthetic"),
        budget=m.ExecutionBudget(
            logical_job_id="test-job",
            attempt_id="test-attempt",
            max_provider_calls=2,
            consumed_calls=0,
            deadline_at=datetime.now(UTC) + timedelta(minutes=1),
        ),
    )


async def test_synthetic_evaluator_callback_order_and_no_total():
    inputs = evaluator_inputs()
    events = []

    async def observer(event):
        events.append(event)
        return inputs["budget"].model_copy(update={"consumed_calls": 1})

    artifact = await SyntheticEvaluator(app_mode="test")(**inputs, call_observer=observer)
    assert [event.event for event in events] == ["call_started", "call_finished"]
    assert events[0].call_id == events[1].call_id
    assert artifact.evaluator_mode == "test" and "total_score" not in artifact.model_dump()
    assert artifact.calls[0].cost is None
    assert {p.criterion_id for p in artifact.automatic_final} == {
        c.id for c in inputs["checklist"].criteria
    }


@pytest.mark.parametrize("fail_on", ["call_started", "call_finished"])
async def test_observer_failure_never_returns_success(fail_on):
    inputs = evaluator_inputs()
    events = []

    async def observer(event):
        events.append(event.event)
        if event.event == fail_on:
            raise ObserverPersistenceError(
                m.APIError(
                    code="persistence_error",
                    message="Test persistence failure",
                    retryable=False,
                    correlation_id="test",
                )
            )
        return inputs["budget"]

    with pytest.raises(ObserverPersistenceError):
        await SyntheticEvaluator(app_mode="test")(**inputs, call_observer=observer)
    if fail_on == "call_started":
        assert events == ["call_started"]


async def test_exhausted_budget_prevents_callbacks():
    inputs = evaluator_inputs()
    inputs["budget"] = inputs["budget"].model_copy(update={"consumed_calls": 2})

    async def observer(event):
        pytest.fail("No callback after exhausted budget")

    with pytest.raises(BudgetExceeded):
        await SyntheticEvaluator(app_mode="test")(**inputs, call_observer=observer)


@pytest.mark.parametrize("year", [2001, 2099])
async def test_synthetic_deadline_and_records_use_the_injected_clock(year):
    inputs = evaluator_inputs()
    moment = [datetime(year, 1, 1, tzinfo=UTC)]
    started = moment[0]
    deadline = started + timedelta(minutes=1)
    inputs["budget"] = inputs["budget"].model_copy(update={"deadline_at": deadline})
    events = []

    async def observer(event):
        events.append(event)
        if event.event == "call_started":
            moment[0] += timedelta(seconds=2)
        return inputs["budget"]

    evaluator = SyntheticEvaluator(app_mode="test", clock=lambda: moment[0])
    artifact = await evaluator(**inputs, call_observer=observer)
    assert artifact.calls[0].started_at == started
    assert artifact.calls[0].finished_at == started + timedelta(seconds=2)
    moment[0] = deadline
    with pytest.raises(BudgetExceeded):
        await evaluator(**inputs, call_observer=observer)
    assert len(events) == 2  # Expired in the simulated clock, even in the far future.
