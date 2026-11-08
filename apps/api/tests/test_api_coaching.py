from conftest import criterion
from cqa_api import assistant
from cqa_contracts.http_models import CoachingRequest
from cqa_contracts.interfaces import ConfigurationError
from cqa_contracts.models import APIError, ErrorCode
from test_api_appeals import decide, evaluated, open_appeal, replacement


def losing_evaluation(client):
    item = criterion("c1")
    item["choices"].reverse()
    return evaluated(client, item)


def test_coaching_retains_evaluation_and_idempotent_history(client):
    before = losing_evaluation(client)
    eid = before["id"]
    body = {"criterion_id": "c1", "scope": "effective", "expected_revision": before["revision"]}
    response = client.post(
        f"/api/v1/evaluations/{eid}/coaching", json=body, headers={"Idempotency-Key": "coach-one"}
    )
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["state"] == "succeeded", result
    assert result["coaching"]["language"] == "RU"
    assert result["coaching"]["suggestions"][0]["message_id"] == "m0002"
    assert "[" in result["coaching"]["suggestions"][0]["text"]
    assert result["calls"][0]["actual"]["model"] == "test-coaching"
    assert result["calls"][0]["cost"] == "0"
    assert client.get(f"/api/v1/evaluations/{eid}").json() == before
    assert (
        client.post(
            f"/api/v1/evaluations/{eid}/coaching",
            json=body,
            headers={"Idempotency-Key": "coach-one"},
        ).json()
        == result
    )
    assert client.get(f"/api/v1/evaluations/{eid}/assistant-runs").json()["total"] == 1
    conflict = client.post(
        f"/api/v1/evaluations/{eid}/coaching",
        json={**body, "scope": "automatic"},
        headers={"Idempotency-Key": "coach-one"},
    )
    assert conflict.status_code == 409


def test_loss_is_checked_in_requested_scope_and_revision(client):
    evaluation = losing_evaluation(client)
    appeal = open_appeal(client, evaluation).json()
    response = decide(
        client, appeal["id"], 1, replacement_value=replacement(answer_choice_id="yes")
    )
    assert response.status_code == 200
    endpoint = f"/api/v1/evaluations/{evaluation['id']}/coaching"
    body = {"criterion_id": "c1", "scope": "effective", "expected_revision": 1}
    assert client.post(endpoint, json=body, headers={"Idempotency-Key": "stale"}).status_code == 409
    body["expected_revision"] = 2
    assert (
        client.post(endpoint, json=body, headers={"Idempotency-Key": "no-loss"}).status_code != 201
    )
    body["scope"] = "automatic"
    result = client.post(endpoint, json=body, headers={"Idempotency-Key": "auto-loss"}).json()
    assert result["state"] == "succeeded"
    assert result["scope"] == "automatic"
    assert result["evaluation_revision"] == 2


def test_missing_key_and_restart_leave_scores_available(client, monkeypatch):
    evaluation = losing_evaluation(client)
    eid = evaluation["id"]
    body = CoachingRequest(criterion_id="c1", expected_revision=1)

    async def missing(*args, **kwargs):
        raise ConfigurationError(
            APIError(
                code=ErrorCode.CONFIGURATION_ERROR,
                message="Missing credential",
                retryable=False,
                correlation_id="test",
            )
        )

    monkeypatch.setattr(assistant, "coach", missing)
    result = client.post(
        f"/api/v1/evaluations/{eid}/coaching",
        json=body.model_dump(mode="json"),
        headers={"Idempotency-Key": "missing"},
    ).json()
    assert result["state"] == "failed"
    assert "Ключ" in result["error"]["message"]
    assert result["calls"] == []
    record, _ = assistant._prepare(client.app.state.services, eid, body, "interrupted-coach")
    assistant.recover(client.app.state.services)
    history = client.get(f"/api/v1/evaluations/{eid}/assistant-runs").json()
    assert history["items"][0]["id"] == record.id
    assert history["items"][0]["state"] == "failed"
    assert client.get(f"/api/v1/evaluations/{eid}").json() == evaluation
