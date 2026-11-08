from cqa_api import criterion_suggestions
from cqa_contracts.http_models import SuggestCriterionRequest
from cqa_contracts.interfaces import ConfigurationError
from cqa_contracts.models import APIError, ErrorCode


def body():
    return {
        "title": "Понятный следующий шаг",
        "description": "Оператор объясняет, что клиенту делать дальше.",
        "profile_id": "test-synthetic",
    }


def test_design_is_idempotent_without_saving_a_checklist(client):
    before = client.get("/api/v1/checklists").json()
    response = client.post(
        "/api/v1/criterion-suggestions", json=body(), headers={"Idempotency-Key": "draft-one"}
    )
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["state"] == "succeeded", result
    assert result["mode"] == "test"
    assert result["suggestion"]["title"] == body()["title"]
    assert "weight" not in result["suggestion"]
    assert result["suggestion"]["allow_na"] is True
    assert len(result["calls"]) == 1
    assert result["calls"][0]["actual"]["model"] == "test-criterion-designer"
    assert result["calls"][0]["cost"] == "0"
    assert (
        client.post(
            "/api/v1/criterion-suggestions", json=body(), headers={"Idempotency-Key": "draft-one"}
        ).json()
        == result
    )
    assert client.get("/api/v1/criterion-suggestions").json()["total"] == 1
    assert client.get("/api/v1/checklists").json() == before
    assert (
        client.post(
            "/api/v1/criterion-suggestions",
            json={**body(), "title": "Another"},
            headers={"Idempotency-Key": "draft-one"},
        ).status_code
        == 409
    )


def test_missing_credentials_and_restart_do_not_save_or_retry(client, monkeypatch):
    async def missing(*args, **kwargs):
        raise ConfigurationError(
            APIError(
                code=ErrorCode.CONFIGURATION_ERROR,
                message="Missing key",
                retryable=False,
                correlation_id="test",
            )
        )

    monkeypatch.setattr(criterion_suggestions, "suggest_criterion", missing)
    result = client.post(
        "/api/v1/criterion-suggestions", json=body(), headers={"Idempotency-Key": "missing"}
    ).json()
    assert result["state"] == "failed"
    assert "Ключ" in result["error"]["message"]
    assert result["calls"] == []
    services = client.app.state.services
    record, _, _ = criterion_suggestions._prepare(
        services, SuggestCriterionRequest.model_validate(body()), "interrupted"
    )
    criterion_suggestions.recover(services)
    replay = client.post(
        "/api/v1/criterion-suggestions", json=body(), headers={"Idempotency-Key": "interrupted"}
    ).json()
    assert replay["id"] == record.id
    assert replay["state"] == "failed"
    assert replay["calls"] == []
    assert client.get("/api/v1/checklists").json()["total"] == 0
