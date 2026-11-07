"""Appeals: one open per criterion, expected_revision, immutable automatic result."""

import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from conftest import (
    chat_record,
    create_batch,
    create_checklist,
    criterion,
    drain,
    import_records,
    make_settings,
)
from cqa_api.main import create_app
from cqa_contracts.interfaces import DomainValidationError
from fastapi.testclient import TestClient
from helpers import ScriptedEvaluator, SpyDomain, contract_error, illustrative_score


def evaluated(client, *criteria, external_id="appeal-1", key="k"):
    conversation_id = import_records(client, chat_record(external_id))["items"][0][
        "conversation_id"
    ]
    version = create_checklist(client, *(criteria or (criterion("c1"), criterion("c2"))))
    job = create_batch(client, [conversation_id], version["version_id"], key=key).json()["jobs"][0]
    drain(client)
    job = client.get(f"/api/v1/jobs/{job['id']}").json()
    assert job["state"] == "succeeded"
    return client.get(f"/api/v1/evaluations/{job['evaluation_id']}").json()


def open_appeal(client, evaluation, criterion_id="c1", revision=None):
    return client.post(
        f"/api/v1/evaluations/{evaluation['id']}/appeals",
        json={
            "criterion_id": criterion_id,
            "comment": "Синтетический комментарий",
            "expected_revision": revision if revision is not None else evaluation["revision"],
        },
    )


def replacement(criterion_id="c1", **overrides):
    value = {
        "criterion_id": criterion_id,
        "applicability": "applicable",
        "answer_choice_id": "no",
        "rationale": "Синтетическое обоснование проверяющего",
        "reason_codes": ["human_changed"],
        "evidence": [
            {
                "kind": "message",
                "message_ids": ["m0002"],
                "relation": "support",
                "explanation": "Синтетическое пояснение",
            }
        ],
        "origin": "human",
    }
    value.update(overrides)
    return value


def decide(client, appeal_id, expected_revision, decision="changed", replacement_value=None):
    body = {
        "expected_revision": expected_revision,
        "decision": decision,
        "reason": "Синтетическая причина",
    }
    if decision == "changed":
        body["replacement"] = replacement_value or replacement()
    return client.post(f"/api/v1/appeals/{appeal_id}/decision", json=body)


def test_changed_decision_recalculates_and_never_touches_automatic(client_factory, tmp_path):
    spy = SpyDomain()
    client = client_factory(make_settings(tmp_path), domain=spy.port)
    before = evaluated(client)
    assert len(spy.score_calls) == 1
    appeal = open_appeal(client, before)
    assert appeal.status_code == 201
    assert appeal.json()["state"] == "open"
    assert appeal.json()["effective_revision"] == 1

    spy.result = illustrative_score("score-human-effective")
    response = decide(client, appeal.json()["id"], 1)
    assert response.status_code == 200, response.text
    decision = response.json()
    assert decision["decision"] == "changed"
    assert decision["revision"] == 2
    assert decision["reason_codes"] == ["human_changed"]

    # The same score function, given the merged set against the pinned checklist.
    checklist, proposals = spy.score_calls[-1]
    assert checklist.version_id == before["checklist_version_id"]
    merged = {p.criterion_id: p for p in proposals}
    assert merged["c1"].origin == "human"
    assert merged["c1"].answer_choice_id == "no"
    assert merged["c2"].origin == "test"

    after = client.get(f"/api/v1/evaluations/{before['id']}").json()
    assert after["revision"] == 2
    assert after["artifact"] == before["artifact"]
    assert after["automatic_score"] == before["automatic_score"]
    assert after["effective_score"] == illustrative_score("score-human-effective").model_dump(
        mode="json"
    )
    assert after["human_decisions"][0]["id"] == decision["id"]
    assert after["human_decisions"][0]["reason"] == "Синтетическая причина"
    effective = {p["criterion_id"]: p for p in after["effective_proposals"]}
    assert effective["c1"]["reason_codes"] == ["human_changed"]
    assert {p["origin"] for p in after["artifact"]["automatic_final"]} == {"test"}
    assert client.get(
        "/api/v1/appeals", params={"evaluation_id": before["id"]}
    ).json()["items"][0]["state"] == "resolved"


def test_confirmed_keeps_the_current_value_and_is_recorded(client_factory, tmp_path):
    spy = SpyDomain()
    client = client_factory(make_settings(tmp_path), domain=spy.port)
    before = evaluated(client)
    appeal = open_appeal(client, before).json()
    response = decide(client, appeal["id"], 1, "confirmed")
    assert response.status_code == 200
    assert response.json()["reason_codes"] == ["human_confirmed"]
    assert response.json()["replacement"] is None
    after = client.get(f"/api/v1/evaluations/{before['id']}").json()
    assert after["revision"] == 2
    assert after["effective_proposals"] == before["effective_proposals"]
    assert len(after["human_decisions"]) == 1


def test_confirmed_does_not_close_undetermined_but_changed_does(client_factory, tmp_path):
    spy = SpyDomain()
    client = client_factory(
        make_settings(tmp_path, test_scenario="partial"), domain=spy.port
    )
    before = evaluated(client, criterion("c1"))
    assert before["artifact"]["status"] == "partial"
    first = open_appeal(client, before).json()
    assert decide(client, first["id"], 1, "confirmed").status_code == 200
    middle = client.get(f"/api/v1/evaluations/{before['id']}").json()
    assert middle["effective_proposals"][0]["applicability"] == "undetermined"

    # After a decision, a further appeal is allowed and refers to the current revision.
    second = open_appeal(client, middle)
    assert second.status_code == 201
    assert second.json()["effective_revision"] == 2
    assert decide(client, second.json()["id"], 2).status_code == 200
    final = client.get(f"/api/v1/evaluations/{before['id']}").json()
    assert final["revision"] == 3
    assert final["effective_proposals"][0]["applicability"] == "applicable"
    # The automatic artifact stays partial with its original proposals.
    assert final["artifact"]["status"] == "partial"
    assert final["artifact"]["automatic_final"][0]["applicability"] == "undetermined"
    assert len(final["human_decisions"]) == 2
    assert [p.applicability for p in spy.score_calls[-1][1]] == ["applicable"]


def test_one_open_appeal_per_criterion_even_concurrently(client):
    evaluation = evaluated(client)

    def attempt(_):
        return open_appeal(client, evaluation).status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        codes = list(pool.map(attempt, range(8)))
    assert sorted(codes) == [201] + [409] * 7
    conflict = open_appeal(client, evaluation)
    assert conflict.json()["code"] == "open_appeal_exists"
    # Another criterion of the same evaluation is independent.
    assert open_appeal(client, evaluation, "c2").status_code == 201
    assert client.get("/api/v1/appeals", params={"state": "open"}).json()["total"] == 2


def test_stale_revision_conflicts_and_writes_nothing(client):
    evaluation = evaluated(client)
    first = open_appeal(client, evaluation).json()
    second = open_appeal(client, evaluation, "c2").json()
    assert decide(client, first["id"], 1).status_code == 200
    stale = decide(client, second["id"], 1, "confirmed")
    assert stale.status_code == 409
    assert stale.json()["code"] == "revision_conflict"
    after = client.get(f"/api/v1/evaluations/{evaluation['id']}").json()
    assert after["revision"] == 2
    assert len(after["human_decisions"]) == 1
    assert decide(client, second["id"], 2, "confirmed").status_code == 200
    repeated = decide(client, second["id"], 3, "confirmed")
    assert repeated.status_code == 409
    assert repeated.json()["code"] == "invalid_state"
    assert open_appeal(client, after, "c1", revision=1).status_code == 409


def test_concurrent_decisions_have_a_single_winner(client):
    evaluation = evaluated(client)
    appeal = open_appeal(client, evaluation).json()

    def attempt(index):
        return decide(client, appeal["id"], 1, "changed" if index % 2 else "confirmed").status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        codes = list(pool.map(attempt, range(8)))
    assert sorted(codes) == [200] + [409] * 7
    after = client.get(f"/api/v1/evaluations/{evaluation['id']}").json()
    assert after["revision"] == 2
    assert len(after["human_decisions"]) == 1


@pytest.mark.parametrize(
    "bad",
    [
        replacement("c2"),
        replacement(answer_choice_id="absent"),
        replacement(applicability="undetermined", answer_choice_id=None),
        replacement(evidence=[]),
        replacement(
            evidence=[
                {
                    "kind": "message",
                    "message_ids": ["m9999"],
                    "relation": "support",
                    "explanation": "x",
                }
            ]
        ),
        replacement(
            evidence=[
                {
                    "kind": "range",
                    "start_message_id": "m0002",
                    "end_message_id": "m0001",
                    "relation": "support",
                    "explanation": "x",
                }
            ]
        ),
        replacement(
            evidence=[
                {
                    "kind": "source",
                    "source_chunk_id": "absent",
                    "relation": "support",
                    "explanation": "x",
                }
            ]
        ),
    ],
)
def test_invalid_replacement_is_rejected_and_nothing_changes(client, bad):
    evaluation = evaluated(client)
    appeal = open_appeal(client, evaluation).json()
    response = decide(client, appeal["id"], 1, replacement_value=bad)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "validation_error"
    after = client.get(f"/api/v1/evaluations/{evaluation['id']}").json()
    assert after["revision"] == 1
    assert after["human_decisions"] == []
    assert client.get("/api/v1/appeals", params={"state": "open"}).json()["total"] == 1


def test_forbidden_na_and_contract_shape_rules(client):
    evaluation = evaluated(client, criterion("c1", allow_na=False, na_condition=None))
    appeal = open_appeal(client, evaluation).json()
    forbidden = decide(
        client,
        appeal["id"],
        1,
        replacement_value=replacement(applicability="not_applicable", answer_choice_id=None),
    )
    assert forbidden.status_code == 422
    not_human = decide(client, appeal["id"], 1, replacement_value=replacement(origin="ai"))
    assert not_human.status_code == 422
    no_reason = client.post(
        f"/api/v1/appeals/{appeal['id']}/decision",
        json={"expected_revision": 1, "decision": "confirmed", "reason": " "},
    )
    assert no_reason.status_code == 422
    missing_replacement = client.post(
        f"/api/v1/appeals/{appeal['id']}/decision",
        json={"expected_revision": 1, "decision": "changed", "reason": "Причина"},
    )
    assert missing_replacement.status_code == 422
    assert decide(client, "absent", 1, "confirmed").status_code == 404


def test_scorer_rejection_rolls_the_decision_back(client_factory, tmp_path):
    spy = SpyDomain()
    client = client_factory(make_settings(tmp_path), domain=spy.port)
    evaluation = evaluated(client)
    appeal = open_appeal(client, evaluation).json()
    spy.score_error = contract_error(DomainValidationError, "validation_error", False)
    response = decide(client, appeal["id"], 1)
    assert response.status_code == 422
    after = client.get(f"/api/v1/evaluations/{evaluation['id']}").json()
    assert after["revision"] == 1
    assert after["human_decisions"] == []
    assert client.get("/api/v1/appeals", params={"state": "open"}).json()["total"] == 1


def test_appeal_validation(client_factory, tmp_path):
    client = client_factory(make_settings(tmp_path))
    evaluation = evaluated(client)
    assert open_appeal(client, evaluation, "unknown-criterion").status_code == 422
    assert open_appeal(client, {"id": "absent", "revision": 1}).status_code == 404
    empty = client.post(
        f"/api/v1/evaluations/{evaluation['id']}/appeals",
        json={"criterion_id": "c1", "comment": "", "expected_revision": 1},
    )
    assert empty.status_code == 422
    assert open_appeal(client, evaluation, revision=7).json()["code"] == "revision_conflict"


def test_failed_evaluation_cannot_be_appealed(tmp_path):
    settings = make_settings(tmp_path, test_scenario="failed")
    with TestClient(create_app(settings)) as client:
        conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
        version = create_checklist(client)
        job = create_batch(client, [conversation_id], version["version_id"]).json()["jobs"][0]
        drain(client)
        evaluation_id = client.get(f"/api/v1/jobs/{job['id']}").json()["evaluation_id"]
        response = client.post(
            f"/api/v1/evaluations/{evaluation_id}/appeals",
            json={"criterion_id": "c1", "comment": "Комментарий", "expected_revision": 1},
        )
        assert response.status_code == 409
        assert response.json()["code"] == "invalid_state"


def test_appeals_and_decisions_survive_restart(tmp_path):
    settings = make_settings(tmp_path)
    with TestClient(create_app(settings)) as client:
        evaluation = evaluated(client)
        appeal = open_appeal(client, evaluation).json()
        decide(client, appeal["id"], 1)
        comment_holder = open_appeal(client, evaluation, "c2", revision=2).json()
    with TestClient(create_app(settings)) as client:
        after = client.get(f"/api/v1/evaluations/{evaluation['id']}").json()
        assert after["revision"] == 2
        assert after["human_decisions"][0]["decision"] == "changed"
        queue = client.get("/api/v1/appeals", params={"state": "open"}).json()
        assert queue["items"][0]["id"] == comment_holder["id"]
        assert queue["items"][0]["comment"] == "Синтетический комментарий"


def test_new_evaluation_does_not_inherit_old_decisions(client):
    evaluation = evaluated(client)
    appeal = open_appeal(client, evaluation).json()
    decide(client, appeal["id"], 1)
    conversation_id = evaluation["conversation_id"]
    reused = create_batch(
        client,
        [conversation_id],
        evaluation["checklist_version_id"],
        key="reuse",
        mode="reuse_if_compatible",
    ).json()
    drain(client)
    job = client.get(f"/api/v1/jobs/{reused['jobs'][0]['id']}").json()
    view = client.get(f"/api/v1/evaluations/{job['evaluation_id']}").json()
    assert view["reuse"]["reused_from_evaluation_id"] == evaluation["id"]
    assert view["human_decisions"] == []
    assert view["revision"] == 1
    # Human decisions are not raw material for the automatic cache.
    assert {p["origin"] for p in view["effective_proposals"]} == {"test"}


def test_decision_history_is_append_only(client):
    evaluation = evaluated(client)
    appeal = open_appeal(client, evaluation).json()
    decide(client, appeal["id"], 1)
    with (
        pytest.raises(Exception, match="append-only"),
        client.app.state.services.db.write() as conn,
    ):
        conn.exec_driver_sql("DELETE FROM decisions")


def test_appeal_can_be_saved_during_a_slow_evaluator(tmp_path):
    entered = threading.Event()
    leave = threading.Event()

    async def slow(budget, observer):
        entered.set()
        while not leave.is_set():
            await asyncio.sleep(0.01)

    # One normal result first; the next job hangs in the background worker.
    evaluator = ScriptedEvaluator(None, slow)
    prepared = make_settings(tmp_path, sqlite_busy_timeout_ms=200)
    with TestClient(create_app(prepared, evaluator=evaluator)) as client:
        evaluation = evaluated(client)
    background = make_settings(
        tmp_path, worker_enabled=True, worker_poll_seconds=0.01, sqlite_busy_timeout_ms=200
    )
    with TestClient(create_app(background, evaluator=evaluator)) as client:
        conversation_id = import_records(client, chat_record("slow"))["items"][0]["conversation_id"]
        version = create_checklist(client)
        create_batch(client, [conversation_id], version["version_id"], key="slow")
        assert entered.wait(10)
        try:
            appeal = open_appeal(client, evaluation)
            assert appeal.status_code == 201
            assert decide(client, appeal.json()["id"], 1, "confirmed").status_code == 200
        finally:
            leave.set()
