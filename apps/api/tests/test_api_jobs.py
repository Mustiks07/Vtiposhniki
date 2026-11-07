"""Durable queue: idempotency, retries, recovery, leases, budget and call records."""

import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest
from conftest import (
    chat_record,
    checklist_draft,
    create_batch,
    create_checklist,
    criterion,
    drain,
    import_records,
    make_settings,
)
from cqa_api.db import row, rows
from cqa_api.jobs import build_queue
from cqa_api.main import create_app
from cqa_contracts.interfaces import (
    BudgetExceeded,
    ConfigurationError,
    DomainValidationError,
    EvaluationTimeout,
    LeaseLost,
    ObserverPersistenceError,
)
from cqa_contracts.models import Job
from fastapi.testclient import TestClient
from helpers import (
    MutableClock,
    ScriptedEvaluator,
    SpyDomain,
    add_profile,
    call_event,
    contract_error,
    spend,
)


def setup_job(client, external_id="job-1", **batch_args):
    conversation_id = import_records(client, chat_record(external_id))["items"][0][
        "conversation_id"
    ]
    version = create_checklist(client)
    response = create_batch(client, [conversation_id], version["version_id"], **batch_args)
    assert response.status_code == 202, response.text
    return response.json()["jobs"][0]["id"], conversation_id, version


def read_job(client, job_id) -> Job:
    return Job.model_validate(client.get(f"/api/v1/jobs/{job_id}").json())


def queue_of(client):
    return build_queue(client.app.state.services)


def call_rows(client, job_id):
    with client.app.state.services.db.read() as conn:
        return rows(
            conn, "SELECT * FROM provider_calls WHERE job_id = :id ORDER BY seq", {"id": job_id}
        )


# --- Idempotent batch creation ------------------------------------------------------


def test_same_key_same_request_returns_same_batch(client):
    conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
    version = create_checklist(client)
    first = create_batch(client, [conversation_id], version["version_id"], key="k")
    second = create_batch(client, [conversation_id, conversation_id], version["version_id"], key="k")
    assert first.status_code == second.status_code == 202
    assert first.json()["id"] == second.json()["id"]
    assert len(second.json()["jobs"]) == 1


def test_same_key_different_request_conflicts(client):
    conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
    version = create_checklist(client)
    create_batch(client, [conversation_id], version["version_id"], key="k")
    other = create_batch(
        client, [conversation_id], version["version_id"], key="k", mode="reuse_if_compatible"
    )
    assert other.status_code == 409
    assert other.json()["code"] == "idempotency_conflict"


def test_concurrent_same_key_creates_one_batch(client):
    conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
    version = create_checklist(client)

    def attempt(_):
        return create_batch(client, [conversation_id], version["version_id"], key="race")

    with ThreadPoolExecutor(max_workers=8) as pool:
        responses = list(pool.map(attempt, range(8)))
    assert {r.status_code for r in responses} == {202}
    assert len({r.json()["id"] for r in responses}) == 1
    with client.app.state.services.db.read() as conn:
        assert row(conn, "SELECT COUNT(*) AS n FROM batches")["n"] == 1
        assert row(conn, "SELECT COUNT(*) AS n FROM jobs")["n"] == 1


def test_batch_rejects_unknown_targets_without_side_effects(client):
    conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
    version = create_checklist(client)
    assert create_batch(client, ["absent"], version["version_id"]).status_code == 404
    assert create_batch(client, [conversation_id], "absent").status_code == 404
    assert (
        create_batch(client, [conversation_id], version["version_id"], profile_id="absent").status_code
        == 404
    )
    with client.app.state.services.db.read() as conn:
        assert row(conn, "SELECT COUNT(*) AS n FROM batches")["n"] == 0


# --- Pinned versions ----------------------------------------------------------------


def test_editing_a_checklist_does_not_change_a_pinned_job(client_factory, tmp_path):
    spy = SpyDomain()
    client = client_factory(make_settings(tmp_path), domain=spy.port)
    conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
    version = create_checklist(client)
    created = create_batch(client, [conversation_id], version["version_id"])
    edited = client.post(
        f"/api/v1/checklists/{version['checklist_id']}/versions",
        json={
            "expected_latest_version_id": version["version_id"],
            "config": checklist_draft(criterion("c1", title="Изменённый"), criterion("c2")),
        },
    )
    assert edited.status_code == 201
    # New imported content does not move the pinned revision either.
    changed = chat_record()
    changed["messages"][0]["text"] = "Новый текст"
    import_records(client, changed)
    drain(client)
    view = client.get(
        f"/api/v1/evaluations/{read_job(client, created.json()['jobs'][0]['id']).evaluation_id}"
    ).json()
    assert view["checklist_version_id"] == version["version_id"]
    assert view["conversation_revision"] == 1
    assert {p["criterion_id"] for p in view["artifact"]["automatic_final"]} == {"c1"}
    checklist_used = spy.score_calls[0][0]
    assert checklist_used.version_id == version["version_id"]


def test_checklist_conflict_and_validator_is_called(client_factory, tmp_path):
    spy = SpyDomain()
    seen = []

    def validator(config):
        seen.append(config)
        if config.title == "Отклонить":
            raise contract_error(DomainValidationError, "validation_error", False)

    import dataclasses

    port = dataclasses.replace(spy.port, validate_checklist=validator)
    client = client_factory(make_settings(tmp_path), domain=port)
    version = create_checklist(client)
    assert seen[0].version_id == version["version_id"]
    assert version["semantic_hash"] != "0" * 64
    rejected = client.post("/api/v1/checklists", json=checklist_draft(title="Отклонить"))
    assert rejected.status_code == 422
    assert client.get("/api/v1/checklists").json()["total"] == 1
    stale = client.post(
        f"/api/v1/checklists/{version['checklist_id']}/versions",
        json={"expected_latest_version_id": "stale", "config": checklist_draft()},
    )
    assert stale.status_code == 409
    assert stale.json()["code"] == "revision_conflict"
    versions = client.get(f"/api/v1/checklists/{version['checklist_id']}/versions").json()
    assert versions["total"] == 1
    snapshot = client.get(f"/api/v1/checklist-versions/{version['version_id']}").json()
    assert snapshot == version


# --- Retries and terminal errors ----------------------------------------------------


def test_transient_error_waits_then_succeeds(client_factory, tmp_path):
    evaluator = ScriptedEvaluator(contract_error(retryable=True))
    client = client_factory(
        make_settings(tmp_path, retry_base_seconds=30.0, retry_max_seconds=30.0),
        evaluator=evaluator,
    )
    job_id, *_ = setup_job(client)
    assert drain(client) == 1
    waiting = read_job(client, job_id)
    assert waiting.state == "retry_wait"
    assert waiting.next_attempt_at is not None
    assert waiting.error.code == "provider_error"
    assert waiting.lease_id is None
    # Not claimable before its time.
    assert queue_of(client).claim_next() is None
    with client.app.state.services.db.write() as conn:
        conn.exec_driver_sql("UPDATE jobs SET next_attempt_at = '2000-01-01T00:00:00.000000Z'")
    assert drain(client) == 1
    done = read_job(client, job_id)
    assert done.state == "succeeded"
    assert [a.state for a in done.attempts] == ["failed", "succeeded"]
    assert done.error is None


def test_attempt_limit_ends_in_failed_and_keeps_history(client_factory, tmp_path):
    evaluator = ScriptedEvaluator(*[contract_error(retryable=True) for _ in range(9)])
    client = client_factory(make_settings(tmp_path), evaluator=evaluator)
    job_id, *_ = setup_job(client)
    assert drain(client) == 3  # RetryPolicy default: three job attempts
    job = read_job(client, job_id)
    assert job.state == "failed"
    assert [a.state for a in job.attempts] == ["failed"] * 3
    assert job.max_attempts == 3
    assert job.evaluation_id is None


@pytest.mark.parametrize(
    "error",
    [
        contract_error(retryable=False),
        contract_error(ConfigurationError, "configuration_error", False),
        contract_error(BudgetExceeded, "budget_exceeded", False),
    ],
)
def test_permanent_errors_do_not_retry(client_factory, tmp_path, error):
    evaluator = ScriptedEvaluator(error)
    client = client_factory(make_settings(tmp_path), evaluator=evaluator)
    job_id, *_ = setup_job(client)
    assert drain(client) == 1
    job = read_job(client, job_id)
    assert job.state == "failed"
    assert job.error.code == error.error.code
    assert evaluator.calls == 1


def test_evaluation_timeout_follows_its_retryable_flag(client_factory, tmp_path):
    evaluator = ScriptedEvaluator(contract_error(EvaluationTimeout, "timeout", True))
    client = client_factory(make_settings(tmp_path), evaluator=evaluator)
    job_id, *_ = setup_job(client)
    assert drain(client) == 2
    job = read_job(client, job_id)
    assert job.state == "succeeded"
    assert job.attempts[0].error.code == "timeout"


def test_job_deadline_stops_a_hanging_evaluator(client_factory, tmp_path):
    release = asyncio.Event()

    async def hang(budget, observer):
        await release.wait()

    evaluator = ScriptedEvaluator(hang)
    client = client_factory(make_settings(tmp_path, deadline_grace_seconds=0.1), evaluator=evaluator)
    add_profile(client, job_deadline_seconds=1)
    job_id, *_ = setup_job(client)
    assert drain(client) == 1
    job = read_job(client, job_id)
    assert job.state == "failed"
    assert job.error.code == "timeout"


def test_invalid_artifact_fails_without_a_result(client_factory, tmp_path):
    spy = SpyDomain()
    spy.validation_error = contract_error(DomainValidationError, "validation_error", False)
    client = client_factory(make_settings(tmp_path), domain=spy.port)
    job_id, *_ = setup_job(client)
    assert drain(client) == 1
    job = read_job(client, job_id)
    assert job.state == "failed"
    assert job.error.code == "validation_error"
    assert job.evaluation_id is None
    assert spy.score_calls == []
    assert len(spy.validated) == 1
    assert client.get("/api/v1/evaluations").json()["total"] == 0
    # Kept privately for diagnosis, not exposed as an evaluation.
    with client.app.state.services.db.read() as conn:
        assert row(conn, "SELECT diagnostic_json FROM job_attempts")["diagnostic_json"]


def test_validator_receives_pinned_inputs_with_the_corpus(client_factory, tmp_path):
    spy = SpyDomain()
    client = client_factory(make_settings(tmp_path), domain=spy.port)
    _, conversation_id, version = setup_job(client)
    drain(client)
    conversation, checklist, corpus, artifact = spy.validated[0]
    assert conversation.id == conversation_id
    assert checklist.version_id == version["version_id"]
    assert corpus.id == "test-empty-corpus"
    proposals = spy.score_calls[0][1]
    assert proposals == artifact.automatic_final


def test_expected_unknown_failure_retries_with_safe_error(client_factory, tmp_path):
    evaluator = ScriptedEvaluator(RuntimeError("PRIVATE TEXT"), RuntimeError("PRIVATE TEXT"))
    client = client_factory(make_settings(tmp_path), evaluator=evaluator)
    job_id, *_ = setup_job(client)
    drain(client)
    job = read_job(client, job_id)
    assert job.state == "succeeded"
    assert job.attempts[0].error.code == "internal_error"
    assert "PRIVATE TEXT" not in client.get(f"/api/v1/jobs/{job_id}").text


def test_partial_failed_artifact_retry_then_terminal_result_visible(client_factory, tmp_path):
    client = client_factory(make_settings(tmp_path, test_scenario="failed"))
    job_id, *_ = setup_job(client)
    drain(client)
    job = read_job(client, job_id)
    assert job.state == "failed"
    assert job.attempts[0].state == "failed"
    assert client.get("/api/v1/evaluations", params={"status": "failed"}).json()["total"] == 1


# --- Manual retry -------------------------------------------------------------------


def test_manual_retry_only_from_allowed_states_and_keeps_history(client_factory, tmp_path):
    evaluator = ScriptedEvaluator(contract_error(retryable=False))
    client = client_factory(make_settings(tmp_path), evaluator=evaluator)
    job_id, *_ = setup_job(client)
    assert client.post(f"/api/v1/jobs/{job_id}/retry").status_code == 409  # queued
    assert client.post("/api/v1/jobs/absent/retry").status_code == 404
    drain(client)
    assert read_job(client, job_id).state == "failed"
    retried = client.post(f"/api/v1/jobs/{job_id}/retry")
    assert retried.status_code == 202
    assert retried.json()["state"] == "queued"
    assert len(retried.json()["attempts"]) == 1
    drain(client)
    done = read_job(client, job_id)
    assert done.state == "succeeded"
    assert [a.state for a in done.attempts] == ["failed", "succeeded"]
    # A finished evaluation is repeated by a new run, never by erasing the result.
    assert client.post(f"/api/v1/jobs/{job_id}/retry").status_code == 409


def test_manual_retry_rejected_while_running(client):
    job_id, *_ = setup_job(client)
    queue_of(client).claim_next()
    response = client.post(f"/api/v1/jobs/{job_id}/retry")
    assert response.status_code == 409
    assert response.json()["code"] == "invalid_state"


def test_manual_retry_after_failed_result_keeps_it_and_binds_the_new_one(tmp_path):
    settings = make_settings(tmp_path, test_scenario="failed")
    with TestClient(create_app(settings)) as client:
        job_id, conversation_id, _ = setup_job(client)
        drain(client)
        failed_evaluation = read_job(client, job_id).evaluation_id
        assert failed_evaluation
        assert client.post(f"/api/v1/jobs/{job_id}/retry").status_code == 202
    healthy = make_settings(tmp_path, test_scenario="complete")
    with TestClient(create_app(healthy)) as client:
        drain(client)
        job = read_job(client, job_id)
        assert job.state == "succeeded"
        assert job.evaluation_id != failed_evaluation
        assert client.get(f"/api/v1/evaluations/{failed_evaluation}").status_code == 200
        assert client.get("/api/v1/evaluations").json()["total"] == 2


def test_manual_retry_does_not_reset_budget(client_factory, tmp_path):
    async def spend_all_then_fail(budget, observer):
        for _ in range(3):
            started = call_event(budget)
            await observer(started)
            await observer(
                call_event(budget, "call_finished", call_id=started.call_id, usage=spend())
            )
        raise contract_error(retryable=False)

    evaluator = ScriptedEvaluator(spend_all_then_fail)
    client = client_factory(make_settings(tmp_path), evaluator=evaluator)
    add_profile(client, max_provider_calls=3, max_total_tokens=None)
    job_id, *_ = setup_job(client)
    drain(client)
    first = read_job(client, job_id)
    assert first.state == "failed"
    deadline = first.budget.deadline_at
    assert first.budget.consumed_calls == 3
    response = client.post(f"/api/v1/jobs/{job_id}/retry")
    assert response.status_code == 409
    assert response.json()["code"] == "budget_exceeded"
    assert read_job(client, job_id).budget.deadline_at == deadline


# --- Recovery and leases ------------------------------------------------------------


def test_running_job_with_expired_lease_is_recovered_after_restart(tmp_path):
    clock = MutableClock()
    settings = make_settings(tmp_path, lease_seconds=30.0)
    with TestClient(create_app(settings, clock=clock)) as client:
        job_id, *_ = setup_job(client)
        claim = queue_of(client).claim_next()
        assert read_job(client, job_id).state == "running"
        assert claim.number == 1
    # The process died mid-attempt. After restart the lease is still valid, so it waits.
    clock.advance(10)
    with TestClient(create_app(settings, clock=clock)) as client:
        assert queue_of(client).claim_next() is None
        clock.advance(25)
        assert drain(client) == 1
        job = read_job(client, job_id)
        assert job.state == "succeeded"
        assert [a.state for a in job.attempts] == ["expired", "succeeded"]
        assert job.attempts[0].error.code == "lease_lost"


def test_queued_and_retry_wait_resume_after_restart_finished_do_not_rerun(tmp_path):
    evaluator = ScriptedEvaluator(contract_error(retryable=True))
    settings = make_settings(tmp_path)
    with TestClient(create_app(settings, evaluator=evaluator)) as client:
        waiting, *_ = setup_job(client, "retry-wait", key="a")
        drain_one = queue_of(client).claim_next()
        asyncio.run(client.app.state.worker.execute(drain_one))
        assert read_job(client, waiting).state == "retry_wait"
        queued, *_ = setup_job(client, "queued", key="b")
    spy = ScriptedEvaluator()
    with TestClient(create_app(settings, evaluator=spy)) as client:
        assert drain(client) == 2
        assert read_job(client, waiting).state == "succeeded"
        assert read_job(client, queued).state == "succeeded"
    calls_before = spy.calls
    with TestClient(create_app(settings, evaluator=spy)) as client:
        assert drain(client) == 0
    assert spy.calls == calls_before


def test_stale_attempt_cannot_replace_the_newer_result(tmp_path):
    clock = MutableClock()
    with TestClient(create_app(make_settings(tmp_path, lease_seconds=30.0), clock=clock)) as client:
        job_id, *_ = setup_job(client)
        queue = queue_of(client)
        old = queue.claim_next()
        old_inputs = queue.load_inputs(old)
        started = call_event(old_inputs.budget, now=clock())
        queue.record_call_started(old, started)
        clock.advance(31)
        new = queue.claim_next()
        assert new.number == 2
        assert read_job(client, job_id).attempts[0].state == "expired"
        # The expired attempt's open call became unknown, not zero and not deleted.
        assert call_rows(client, job_id)[0]["outcome"] == "unknown"

        # Late finish: its spend is kept in its own attempt, and it learns it lost the lease.
        with pytest.raises(LeaseLost):
            queue.record_call_finished(
                old,
                call_event(
                    old_inputs.budget,
                    "call_finished",
                    call_id=started.call_id,
                    usage=spend(),
                    cost=Decimal("0.5"),
                    now=clock(),
                ),
            )
        stored = call_rows(client, job_id)[0]
        assert stored["outcome"] == "succeeded"
        assert stored["attempt_id"] == old.attempt_id

        # A new call cannot start on the stale attempt.
        with pytest.raises(LeaseLost):
            queue.record_call_started(old, call_event(old_inputs.budget, now=clock()))

        from helpers import illustrative_score

        artifact = _artifact_for(client, new, queue)
        from cqa_contracts.models import ReuseProvenance

        reuse = ReuseProvenance(mode="fresh", reused_from_evaluation_id=None, reuse_key="a" * 64)
        winner = queue.commit_success(new, artifact, illustrative_score(), reuse)
        with pytest.raises(LeaseLost):
            queue.commit_success(old, artifact, illustrative_score(), reuse)
        state = queue.commit_failure(
            old, contract_error().error, retryable=True
        )
        assert state == "succeeded"
        job = read_job(client, job_id)
        assert job.evaluation_id == winner
        assert client.get("/api/v1/evaluations").json()["total"] == 1


def _artifact_for(client, claim, queue):
    from cqa_contracts.testing import SyntheticEvaluator

    inputs = queue.load_inputs(claim)

    async def observer(event):
        if event.event == "call_started":
            return queue.record_call_started(claim, event)
        return queue.record_call_finished(claim, event)

    return asyncio.run(
        SyntheticEvaluator(app_mode="test")(
            inputs.conversation,
            inputs.checklist,
            inputs.profile,
            inputs.corpus,
            inputs.budget,
            observer,
        )
    )


def test_heartbeat_extends_lease_only_for_the_owner(tmp_path):
    clock = MutableClock()
    with TestClient(create_app(make_settings(tmp_path, lease_seconds=30.0), clock=clock)) as client:
        job_id, *_ = setup_job(client)
        queue = queue_of(client)
        claim = queue.claim_next()
        before = read_job(client, job_id).lease_expires_at
        clock.advance(10)
        assert queue.extend_lease(claim) is True
        assert read_job(client, job_id).lease_expires_at > before
        clock.advance(31)
        assert queue.extend_lease(claim) is False


def test_lost_lease_stops_the_running_evaluator(tmp_path):
    settings = make_settings(tmp_path, lease_seconds=0.03)
    stopped = []

    async def run():
        evaluator_started = asyncio.Event()

        async def hang(budget, observer):
            evaluator_started.set()
            try:
                await asyncio.sleep(30)
            except asyncio.CancelledError:
                stopped.append(True)
                raise

        with TestClient(
            create_app(settings, evaluator=ScriptedEvaluator(hang))
        ) as client:
            job_id, *_ = setup_job(client)
            queue = queue_of(client)
            worker = client.app.state.worker
            claim = queue.claim_next()
            task = asyncio.create_task(worker.execute(claim))
            await evaluator_started.wait()
            # Another owner takes over behind this attempt's back.
            with client.app.state.services.db.write() as conn:
                conn.exec_driver_sql("UPDATE jobs SET lease_id = 'someone-else'")
            await asyncio.wait_for(task, 10)
            return read_job(client, job_id)

    job = asyncio.run(run())
    assert stopped == [True]
    assert job.attempts[0].state == "expired"


def test_graceful_shutdown_releases_the_attempt_for_resumption(tmp_path):
    settings = make_settings(tmp_path)

    async def scenario():
        started = asyncio.Event()

        async def hang(budget, observer):
            started.set()
            await asyncio.sleep(30)

        with TestClient(create_app(settings, evaluator=ScriptedEvaluator(hang))) as client:
            job_id, *_ = setup_job(client)
            worker = client.app.state.worker
            claim = queue_of(client).claim_next()
            task = asyncio.create_task(worker.execute(claim))
            await started.wait()
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            return read_job(client, job_id)

    job = asyncio.run(scenario())
    assert job.state == "retry_wait"
    assert job.attempts[0].state == "cancelled"
    with TestClient(create_app(settings)) as client:
        assert drain(client) == 1
        assert read_job(client, job.id).state == "succeeded"


# --- Atomic completion --------------------------------------------------------------


def test_crash_before_commit_leaves_no_succeeded_job_without_result(
    client_factory, tmp_path, monkeypatch
):
    client = client_factory(make_settings(tmp_path))
    job_id, *_ = setup_job(client)
    from cqa_api.jobs import JobQueue

    original = JobQueue._mark_succeeded

    def explode(self, conn, claim, evaluation_id):
        raise RuntimeError("crash between result and state")

    monkeypatch.setattr(JobQueue, "_mark_succeeded", explode)
    assert drain(client) >= 1
    job = read_job(client, job_id)
    assert job.state != "succeeded"
    assert job.evaluation_id is None
    with client.app.state.services.db.read() as conn:
        assert row(conn, "SELECT COUNT(*) AS n FROM evaluations")["n"] == 0
    monkeypatch.setattr(JobQueue, "_mark_succeeded", original)
    if job.state == "failed":
        assert client.post(f"/api/v1/jobs/{job_id}/retry").status_code == 202
    drain(client)
    assert read_job(client, job_id).state == "succeeded"
    assert client.get("/api/v1/evaluations").json()["total"] == 1


def test_automatic_result_is_immutable_in_storage(client):
    setup_job(client)
    drain(client)
    with pytest.raises(Exception, match="immutable"):
        with client.app.state.services.db.write() as conn:
            conn.exec_driver_sql("UPDATE evaluations SET artifact_json = '{}'")


# --- Reads and writes during a slow AI call -----------------------------------------


def test_database_is_free_during_a_slow_evaluator(tmp_path):
    entered = threading.Event()
    leave = threading.Event()

    async def slow(budget, observer):
        entered.set()
        while not leave.is_set():
            await asyncio.sleep(0.01)

    settings = make_settings(
        tmp_path, worker_enabled=True, worker_poll_seconds=0.01, sqlite_busy_timeout_ms=200
    )
    with TestClient(create_app(settings, evaluator=ScriptedEvaluator(slow))) as client:
        job_id, *_ = setup_job(client)
        assert entered.wait(10)
        try:
            assert client.get(f"/api/v1/jobs/{job_id}").json()["state"] == "running"
            assert client.get("/api/v1/conversations").status_code == 200
            import_records(client, chat_record("written-during-slow-call"))
            assert client.get("/api/v1/conversations").json()["total"] == 2
        finally:
            leave.set()
        for _ in range(500):
            if client.get(f"/api/v1/jobs/{job_id}").json()["state"] == "succeeded":
                break
            threading.Event().wait(0.01)
        assert client.get(f"/api/v1/jobs/{job_id}").json()["state"] == "succeeded"


# --- Observer: idempotency, persistence failure, unknown spend -----------------------


def claimed(client, **profile_limits):
    if profile_limits:
        add_profile(client, **profile_limits)
    job_id, *_ = setup_job(client)
    queue = queue_of(client)
    claim = queue.claim_next()
    return job_id, queue, claim, queue.load_inputs(claim).budget


def test_duplicate_started_and_finished_are_idempotent(client):
    job_id, queue, claim, budget = claimed(client)
    started = call_event(budget)
    assert queue.record_call_started(claim, started).consumed_calls == 1
    assert queue.record_call_started(claim, started).consumed_calls == 1
    finished = call_event(budget, "call_finished", call_id=started.call_id, usage=spend())
    assert queue.record_call_finished(claim, finished).consumed_calls == 1
    late_duplicate = call_event(budget, "call_finished", call_id=started.call_id, outcome="failed")
    assert queue.record_call_finished(claim, late_duplicate).consumed_calls == 1
    stored = call_rows(client, job_id)
    assert len(stored) == 1
    assert stored[0]["outcome"] == "succeeded"
    another = queue.record_call_started(claim, call_event(budget))
    assert another.consumed_calls == 2


def test_review_call_is_visible_as_an_observed_stage(client):
    job_id, queue, claim, budget = claimed(client)
    assert read_job(client, job_id).progress.stage == "evaluating"
    event = call_event(budget)
    review = event.record.model_copy(update={"purpose": "review"})
    queue.record_call_started(claim, event.model_copy(update={"record": review}))
    assert read_job(client, job_id).progress.stage == "reviewing"


def test_finished_without_started_and_foreign_identity_are_refused(client):
    _, queue, claim, budget = claimed(client)
    with pytest.raises(ObserverPersistenceError):
        queue.record_call_finished(claim, call_event(budget, "call_finished"))
    foreign = call_event(budget.model_copy(update={"logical_job_id": "other"}))
    with pytest.raises(ObserverPersistenceError):
        queue.record_call_started(claim, foreign)


def test_started_persistence_failure_means_no_request(client_factory, tmp_path, monkeypatch):
    sent = []

    async def careful(budget, observer):
        await observer(call_event(budget))
        sent.append(True)

    client = client_factory(make_settings(tmp_path), evaluator=ScriptedEvaluator(careful))
    job_id, *_ = setup_job(client)
    from cqa_api.jobs import JobQueue
    from sqlalchemy.exc import OperationalError

    def broken(self, claim, event):
        raise OperationalError("stmt", {}, Exception("disk"))

    monkeypatch.setattr(JobQueue, "record_call_started", broken)
    claim = queue_of(client).claim_next()
    asyncio.run(client.app.state.worker.execute(claim))
    assert sent == []
    job = read_job(client, job_id)
    assert job.attempts[0].error.code == "persistence_error"
    assert job.state == "retry_wait"


def test_finished_persistence_failure_forbids_a_successful_commit(
    client_factory, tmp_path, monkeypatch
):
    client = client_factory(make_settings(tmp_path))
    job_id, *_ = setup_job(client)
    from cqa_api.jobs import JobQueue
    from sqlalchemy.exc import OperationalError

    def broken(self, claim, event):
        raise OperationalError("stmt", {}, Exception("disk"))

    monkeypatch.setattr(JobQueue, "record_call_finished", broken)
    claim = queue_of(client).claim_next()
    asyncio.run(client.app.state.worker.execute(claim))
    job = read_job(client, job_id)
    assert job.state != "succeeded"
    assert job.evaluation_id is None
    assert client.get("/api/v1/evaluations").json()["total"] == 0
    # The started call is retained with unknown spend, not erased or zeroed.
    stored = call_rows(client, job_id)
    assert stored[0]["outcome"] == "unknown"
    assert '"cost":null' in stored[0]["record_json"]


def test_failed_attempt_spend_survives_and_unknown_is_not_zero(client_factory, tmp_path):
    async def known_then_fail(budget, observer):
        started = call_event(budget)
        await observer(started)
        await observer(
            call_event(
                budget,
                "call_finished",
                call_id=started.call_id,
                usage=spend(),
                cost=Decimal("0.25"),
                outcome="failed",
            )
        )
        raise contract_error(retryable=True)

    async def unknown_spend(budget, observer):
        started = call_event(budget)
        await observer(started)
        await observer(call_event(budget, "call_finished", call_id=started.call_id))

    client = client_factory(
        make_settings(tmp_path), evaluator=ScriptedEvaluator(known_then_fail, unknown_spend)
    )
    add_profile(client, max_total_tokens=None)
    job_id, *_ = setup_job(client)
    drain(client)
    job = read_job(client, job_id)
    assert job.state == "succeeded"
    assert len(job.attempts) == 2
    # known + unknown + the synthetic call: the known part stays, completeness is false.
    assert job.budget.consumed_calls == 3
    assert job.budget.consumed_cost == Decimal("0.25")
    assert job.budget.consumed_tokens == 15
    assert job.budget.usage_complete is False
    assert {r["attempt_id"] for r in call_rows(client, job_id)} == {
        job.attempts[0].attempt_id,
        job.attempts[1].attempt_id,
    }


# --- Shared budget ------------------------------------------------------------------


def test_concurrent_reservations_never_exceed_the_limit(client):
    job_id, queue, claim, budget = claimed(client, max_provider_calls=5, max_total_tokens=None)
    results = []

    def reserve(_):
        try:
            queue.record_call_started(claim, call_event(budget))
            results.append("reserved")
        except BudgetExceeded:
            results.append("refused")

    with ThreadPoolExecutor(max_workers=12) as pool:
        list(pool.map(reserve, range(20)))
    assert results.count("reserved") == 5
    assert results.count("refused") == 15
    assert len(call_rows(client, job_id)) == 5
    assert read_job(client, job_id).budget.consumed_calls == 5


def test_budget_survives_recovery_and_is_not_retried_when_exhausted(tmp_path):
    clock = MutableClock()
    settings = make_settings(tmp_path, lease_seconds=30.0)
    with TestClient(create_app(settings, clock=clock)) as client:
        add_profile(client, max_provider_calls=2, max_total_tokens=None, job_deadline_seconds=900)
        job_id, *_ = setup_job(client)
        queue = queue_of(client)
        claim = queue.claim_next()
        budget = queue.load_inputs(claim).budget
        deadline = budget.deadline_at
        queue.record_call_started(claim, call_event(budget, now=clock()))
    clock.advance(31)
    with TestClient(create_app(settings, clock=clock)) as client:
        queue = queue_of(client)
        second = queue.claim_next()
        resumed = queue.load_inputs(second).budget
        assert resumed.consumed_calls == 1
        assert resumed.deadline_at == deadline
        assert resumed.attempt_id == second.attempt_id
        queue.record_call_started(second, call_event(resumed, now=clock()))
        with pytest.raises(BudgetExceeded):
            queue.record_call_started(second, call_event(resumed, now=clock()))
        clock.advance(31)
        # Exhausted: expiry ends the job. It is not retried automatically.
        assert queue.claim_next() is None
        job = read_job(client, job_id)
        assert job.state == "failed"
        assert job.budget.deadline_at == deadline


def test_deadline_is_fixed_and_blocks_new_calls_after_it_passes(tmp_path):
    clock = MutableClock()
    with TestClient(create_app(make_settings(tmp_path), clock=clock)) as client:
        job_id, queue, claim, budget = claimed(client, job_deadline_seconds=10)
        clock.advance(11)
        with pytest.raises(BudgetExceeded):
            queue.record_call_started(claim, call_event(budget, now=clock()))
        assert read_job(client, job_id).budget.consumed_calls == 0


def test_token_cap_fails_closed_when_usage_is_unknown(client):
    _, queue, claim, budget = claimed(client, max_total_tokens=100)
    first = call_event(budget)
    queue.record_call_started(claim, first)
    queue.record_call_finished(claim, call_event(budget, "call_finished", call_id=first.call_id))
    with pytest.raises(BudgetExceeded):
        queue.record_call_started(claim, call_event(budget))


def test_token_and_cost_caps_stop_at_the_known_limit(client):
    _, queue, claim, budget = claimed(client, max_total_tokens=20, max_cost=Decimal("1"))
    first = call_event(budget)
    queue.record_call_started(claim, first)
    queue.record_call_finished(
        claim,
        call_event(
            budget, "call_finished", call_id=first.call_id, usage=spend(), cost=Decimal("0.5")
        ),
    )
    second = call_event(budget)
    assert queue.record_call_started(claim, second).consumed_tokens == 15
    queue.record_call_finished(
        claim,
        call_event(
            budget, "call_finished", call_id=second.call_id, usage=spend(), cost=Decimal("0.5")
        ),
    )
    with pytest.raises(BudgetExceeded):
        queue.record_call_started(claim, call_event(budget))


def test_call_id_from_another_attempt_is_refused(tmp_path):
    clock = MutableClock()
    with TestClient(create_app(make_settings(tmp_path, lease_seconds=5.0), clock=clock)) as client:
        _, queue, first, budget = claimed(client)
        shared = call_event(budget, now=clock())
        queue.record_call_started(first, shared)
        clock.advance(6)
        second = queue.claim_next()
        resumed = queue.load_inputs(second).budget
        duplicate = call_event(resumed, call_id=shared.call_id, now=clock())
        with pytest.raises(ObserverPersistenceError):
            queue.record_call_started(second, duplicate)


def test_concurrent_claims_give_one_owner(client):
    setup_job(client)
    queue = queue_of(client)
    with ThreadPoolExecutor(max_workers=8) as pool:
        claims = list(pool.map(lambda _: queue.claim_next(), range(8)))
    assert len([c for c in claims if c is not None]) == 1
