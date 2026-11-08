from cqa_api import conversation_questions
from cqa_contracts.http_models import ConversationAnswer, ConversationQuestionRequest
from cqa_contracts.interfaces import ConfigurationError
from cqa_contracts.models import APIError, ErrorCode
from test_api_appeals import decide, evaluated, open_appeal, replacement


def test_answer_refusal_and_idempotency_never_change_the_saved_assessment(client):
    before = evaluated(client)
    endpoint = f"/api/v1/evaluations/{before['id']}/questions"
    body = {"question": "Что ответил оператор?", "scope": "effective", "expected_revision": 1}
    response = client.post(endpoint, json=body, headers={"Idempotency-Key": "question-one"})
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["state"] == "succeeded", result
    assert result["answer"]["message_ids"] == ["m0002"]
    assert result["mode"] == "test"
    assert len(result["calls"]) == 1
    assert result["calls"][0]["actual"]["model"] == "test-conversation-assistant"
    assert result["calls"][0]["cost"] == "0"
    assert (
        client.post(endpoint, json=body, headers={"Idempotency-Key": "question-one"}).json()
        == result
    )
    off = client.post(
        endpoint,
        json={**body, "question": "Какая завтра погода?"},
        headers={"Idempotency-Key": "off-topic"},
    ).json()
    assert off["answer"]["status"] == "off_topic"
    assert off["answer"]["message_ids"] == []
    assert len(off["calls"]) == 1
    assert client.get(endpoint).json()["total"] == 2
    assert client.get(f"/api/v1/evaluations/{before['id']}").json() == before
    assert (
        client.post(
            endpoint,
            json={**body, "question": "Different"},
            headers={"Idempotency-Key": "question-one"},
        ).status_code
        == 409
    )


def test_question_context_is_pinned_to_requested_scope_and_current_revision(client, monkeypatch):
    evaluation = evaluated(client)
    appeal = open_appeal(client, evaluation).json()
    assert (
        decide(
            client, appeal["id"], 1, replacement_value=replacement(answer_choice_id="no")
        ).status_code
        == 200
    )
    seen = []

    async def capture(body, conversation, checklist, proposals, score, *args):
        seen.append(
            (
                body.scope,
                next(p.answer_choice_id for p in proposals if p.criterion_id == "c1"),
                score.total_score,
            )
        )
        return ConversationAnswer(status="answered", text="Тестовая ссылка", message_ids=["m0002"])

    monkeypatch.setattr(conversation_questions, "answer_question", capture)
    endpoint = f"/api/v1/evaluations/{evaluation['id']}/questions"
    body = {"question": "Почему такой ответ?", "scope": "effective", "expected_revision": 1}
    assert (
        client.post(endpoint, json=body, headers={"Idempotency-Key": "stale-q"}).status_code == 409
    )
    assert seen == []
    body["expected_revision"] = 2
    assert (
        client.post(endpoint, json=body, headers={"Idempotency-Key": "effective-q"}).json()["state"]
        == "succeeded"
    )
    body["scope"] = "automatic"
    assert (
        client.post(endpoint, json=body, headers={"Idempotency-Key": "automatic-q"}).json()["state"]
        == "succeeded"
    )
    assert [(s, a) for s, a, _ in seen] == [("effective", "no"), ("automatic", "yes")]


def test_unavailable_key_and_restart_keep_question_history_without_retry(client, monkeypatch):
    evaluation = evaluated(client)
    eid = evaluation["id"]

    async def missing(*args, **kwargs):
        raise ConfigurationError(
            APIError(
                code=ErrorCode.CONFIGURATION_ERROR,
                message="Missing credential",
                retryable=False,
                correlation_id="test",
            )
        )

    monkeypatch.setattr(conversation_questions, "answer_question", missing)
    body = ConversationQuestionRequest(question="Что произошло?", expected_revision=1)
    result = client.post(
        f"/api/v1/evaluations/{eid}/questions",
        json=body.model_dump(mode="json"),
        headers={"Idempotency-Key": "missing-q"},
    ).json()
    assert result["state"] == "failed"
    assert "Ключ" in result["error"]["message"]
    services = client.app.state.services
    record, _ = conversation_questions._prepare(services, eid, body, "interrupted-q")
    conversation_questions.recover(services)
    replay = client.post(
        f"/api/v1/evaluations/{eid}/questions",
        json=body.model_dump(mode="json"),
        headers={"Idempotency-Key": "interrupted-q"},
    ).json()
    assert replay["id"] == record.id
    assert replay["state"] == "failed"
    assert replay["calls"] == []
    assert client.get(f"/api/v1/evaluations/{eid}").json() == evaluation
