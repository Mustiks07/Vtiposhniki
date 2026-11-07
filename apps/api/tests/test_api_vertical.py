"""B1: import -> durable job -> explicit test evaluator -> stored result -> read via API."""

import json
import time

from conftest import (
    ROOT,
    chat_record,
    create_batch,
    create_checklist,
    drain,
    import_records,
    make_settings,
)
from cqa_api.main import create_app
from cqa_contracts.models import EvaluationView, Job
from fastapi.testclient import TestClient


def test_runtime_openapi_is_the_generated_contract():
    contract = json.loads((ROOT / "contracts/openapi.json").read_text(encoding="utf-8"))
    assert create_app().openapi() == contract


def test_health_reports_application_without_secrets(client):
    body = client.get("/api/v1/health").json()
    assert body["status"] == "ok"
    assert body["phase"] == "application"
    assert body["evaluator_mode"] == "test"
    # Stand-ins are not domain readiness: only the real content hash makes this true.
    assert body["business_ready"] is client.app.state.domain_ready


def test_vertical_path_survives_restart(tmp_path):
    settings = make_settings(tmp_path)
    with TestClient(create_app(settings)) as first:
        imported = import_records(first, chat_record())
        conversation_id = imported["items"][0]["conversation_id"]
        version = create_checklist(first)
        created = create_batch(first, [conversation_id], version["version_id"])
        assert created.status_code == 202
        batch = created.json()
        job_id = batch["jobs"][0]["id"]
        assert batch["progress"] == {
            "schema_version": "1.0",
            "total": 1,
            "queued": 1,
            "running": 0,
            "retry_wait": 0,
            "succeeded": 0,
            "failed": 0,
            "cancelled": 0,
        }
        assert batch["jobs"][0]["budget"] is None  # limits are pinned by the first claim

    # The queued job outlives the process that created it.
    with TestClient(create_app(settings)) as second:
        assert second.get(f"/api/v1/jobs/{job_id}").json()["state"] == "queued"
        assert drain(second) == 1

    with TestClient(create_app(settings)) as third:
        job = Job.model_validate(third.get(f"/api/v1/jobs/{job_id}").json())
        assert job.state == "succeeded"
        assert job.progress.stage == "done"
        assert job.progress.completed_calls == 1
        assert [a.state for a in job.attempts] == ["succeeded"]
        assert job.budget.consumed_calls == 1
        assert job.budget.usage_complete is False  # the test evaluator reports no usage

        response = third.get(f"/api/v1/evaluations/{job.evaluation_id}")
        assert response.status_code == 200
        view = EvaluationView.model_validate(response.json())
        assert view.artifact.evaluator_mode == "test"
        assert {p.origin for p in view.artifact.automatic_final} == {"test"}
        assert "test_evaluator" in view.artifact.limitations
        assert view.conversation_revision == 1
        assert view.checklist_version_id == version["version_id"]
        assert view.revision == 1
        assert view.artifact.calls[0].cost is None  # unknown is not zero
        if third.app.state.domain_ready:
            assert view.automatic_score.status == "complete"
        else:
            # Without cqa_domain.score there is no total at all, not a false one.
            assert view.automatic_score.total_score is None

        listed = third.get(
            "/api/v1/conversations", params={"status": "complete"}
        ).json()
        assert listed["total"] == 1
        assert listed["items"][0]["latest_evaluation_id"] == job.evaluation_id
        evaluations = third.get(
            "/api/v1/evaluations", params={"conversation_id": conversation_id}
        ).json()
        assert [e["id"] for e in evaluations["items"]] == [job.evaluation_id]


def test_managed_worker_processes_a_job_in_the_background(tmp_path):
    settings = make_settings(tmp_path, worker_enabled=True, worker_poll_seconds=0.02)
    with TestClient(create_app(settings)) as client:
        conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
        version = create_checklist(client)
        job_id = create_batch(client, [conversation_id], version["version_id"]).json()["jobs"][0][
            "id"
        ]
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            job = client.get(f"/api/v1/jobs/{job_id}").json()
            if job["state"] == "succeeded":
                break
            time.sleep(0.02)
        assert job["state"] == "succeeded"
        assert job["evaluation_id"]


def test_partial_is_a_finished_job_without_total(tmp_path):
    settings = make_settings(tmp_path, test_scenario="partial")
    with TestClient(create_app(settings)) as client:
        conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
        version = create_checklist(client)
        job_id = create_batch(client, [conversation_id], version["version_id"]).json()["jobs"][0][
            "id"
        ]
        drain(client)
        job = client.get(f"/api/v1/jobs/{job_id}").json()
        assert job["state"] == "succeeded"
        view = client.get(f"/api/v1/evaluations/{job['evaluation_id']}").json()
        assert view["artifact"]["status"] == "partial"
        assert view["automatic_score"]["total_score"] is None
        assert {p["applicability"] for p in view["artifact"]["automatic_final"]} == {
            "undetermined"
        }


def test_failed_artifact_keeps_a_failed_result_and_no_score(tmp_path):
    settings = make_settings(tmp_path, test_scenario="failed")
    with TestClient(create_app(settings)) as client:
        conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
        version = create_checklist(client)
        job_id = create_batch(client, [conversation_id], version["version_id"]).json()["jobs"][0][
            "id"
        ]
        drain(client)
        job = client.get(f"/api/v1/jobs/{job_id}").json()
        assert job["state"] == "failed"
        assert job["error"]["code"] == "provider_error"
        view = client.get(f"/api/v1/evaluations/{job['evaluation_id']}").json()
        assert view["artifact"]["status"] == "failed"
        assert view["automatic_score"]["contributions"] == []
        listed = client.get("/api/v1/conversations", params={"status": "failed"}).json()
        assert listed["total"] == 1


def test_contract_errors_use_the_common_shape(client):
    missing = client.get("/api/v1/conversations/absent")
    assert missing.status_code == 404
    assert missing.json()["code"] == "not_found"
    unknown_route = client.get("/api/v1/not-a-route")
    assert unknown_route.status_code == 404
    assert unknown_route.json()["correlation_id"]
    no_key = client.post(
        "/api/v1/evaluation-batches",
        json={
            "conversation_ids": ["c"],
            "checklist_version_id": "v",
            "profile_id": "p",
            "mode": "fresh",
        },
    )
    assert no_key.status_code == 422
    assert "Idempotency-Key" in no_key.text
