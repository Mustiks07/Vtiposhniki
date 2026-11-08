from cqa_ai.transport import ProviderFailure
from cqa_api import assistance
from cqa_contracts.models import CallEvent, CallRecord
from test_api_appeals import evaluated, open_appeal


def test_appeal_direct_lookup_does_not_depend_on_queue_filters(client):
    evaluation = evaluated(client)
    appeal = open_appeal(client, evaluation).json()
    assert client.get("/api/v1/appeals?state=resolved").json()["items"] == []
    assert client.get(f"/api/v1/appeals/{appeal['id']}").json() == appeal
    assert client.get("/api/v1/appeals/missing-appeal").status_code == 404


def test_second_opinion_is_logged_and_idempotent_without_changing_the_assessment(client):
    evaluation = evaluated(client)
    appeal = open_appeal(client, evaluation).json()
    endpoint = f"/api/v1/appeals/{appeal['id']}/second-opinions"
    before = client.get(f"/api/v1/evaluations/{evaluation['id']}").json()
    export = client.get(f"/api/v1/evaluations/{evaluation['id']}/export").json()
    response = client.post(endpoint, headers={"Idempotency-Key": "second-opinion-test"})
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["state"] == "succeeded", result
    assert result["mode"] == "test"
    assert result["proposal"]["origin"] == "test"
    assert result["proposal"]["criterion_id"] == appeal["criterion_id"]
    assert "Тестовая подсказка" in result["proposal"]["rationale"]
    assert len(result["calls"]) == 1
    assert result["calls"][0]["actual"]["model"] == "test-second-opinion"
    assert result["calls"][0]["cost"] == "0"
    assert (
        client.post(endpoint, headers={"Idempotency-Key": "second-opinion-test"}).json() == result
    )
    assert client.get(endpoint).json()["total"] == 1
    assert client.get(f"/api/v1/evaluations/{evaluation['id']}").json() == before
    after_export = client.get(f"/api/v1/evaluations/{evaluation['id']}/export").json()
    # Each download gets a new generation time; compare the actual exported content.
    after_export.pop("generated_at")
    export.pop("generated_at")
    assert after_export == export
    assert client.get("/api/v1/appeals").json()["items"][0]["state"] == "open"


def test_provider_failure_remains_advisory_and_same_request_does_not_retry(client, monkeypatch):
    evaluation = evaluated(client)
    appeal = open_appeal(client, evaluation).json()
    calls = []

    async def unavailable(*args, **kwargs):
        calls.append(1)
        raise ProviderFailure("insufficient_quota", "Provider account has insufficient balance")

    monkeypatch.setattr(assistance, "second_opinion", unavailable)
    endpoint = f"/api/v1/appeals/{appeal['id']}/second-opinions"
    result = client.post(endpoint, headers={"Idempotency-Key": "quota"}).json()
    assert result["state"] == "failed"
    assert "квоты" in result["error"]["message"]
    assert result["proposal"] is None
    assert client.post(endpoint, headers={"Idempotency-Key": "quota"}).json() == result
    assert len(calls) == 1
    assert client.get(f"/api/v1/evaluations/{evaluation['id']}").json() == evaluation


def test_restart_preserves_uncertain_call_and_never_resends_it(client):
    evaluation = evaluated(client)
    appeal = open_appeal(client, evaluation).json()
    services = client.app.state.services
    record, inputs = assistance._prepare(services, appeal["id"], "interrupted")
    assert inputs is not None
    assistance._record_call(
        services,
        record.id,
        CallEvent(
            event="call_started",
            logical_job_id=record.id,
            attempt_id=record.id,
            call_id="uncertain-call",
            record=CallRecord(
                call_id="uncertain-call",
                attempt_id=record.id,
                purpose="review",
                requested=inputs.profile.primary,
                started_at=services.clock(),
                outcome="started",
            ),
        ),
    )
    assistance.recover(services)
    result = client.post(
        f"/api/v1/appeals/{appeal['id']}/second-opinions",
        headers={"Idempotency-Key": "interrupted"},
    ).json()
    assert result["state"] == "failed"
    assert result["calls"][0]["outcome"] == "unknown"
    assert result["calls"][0]["cost"] is None
    assert result["calls"][0]["usage"] is None
    assert client.get(f"/api/v1/evaluations/{evaluation['id']}").json() == evaluation
