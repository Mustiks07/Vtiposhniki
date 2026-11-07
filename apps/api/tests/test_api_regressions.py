"""Regressions for defects reproduced during integration of A and B."""

import asyncio
import csv
import io
import json

import pytest
from conftest import (
    ROOT,
    chat_record,
    create_batch,
    create_checklist,
    criterion,
    drain,
    import_records,
    make_settings,
)
from cqa_api.db import row
from cqa_api.jobs import build_queue
from cqa_api.main import create_app
from cqa_api.registry import register_corpus, register_profile
from cqa_api.testmode import synthetic_profile
from cqa_contracts.interfaces import (
    BudgetExceeded,
    EvaluationCancelled,
    LeaseLost,
    ObserverPersistenceError,
)
from cqa_contracts.models import CorpusSnapshot, Evidence, Job, SourceChunk, TokenUsage
from cqa_contracts.testing import SyntheticEvaluator
from fastapi.testclient import TestClient
from helpers import MutableClock, SpyDomain, add_profile, call_event


def setup_jobs(client, count=1):
    ids = [
        import_records(client, chat_record(f"job-{i}"))["items"][0]["conversation_id"]
        for i in range(count)
    ]
    version = create_checklist(client)
    response = create_batch(client, ids, version["version_id"])
    assert response.status_code == 202, response.text
    return [job["id"] for job in response.json()["jobs"]]


def read_job(client, job_id) -> Job:
    return Job.model_validate(client.get(f"/api/v1/jobs/{job_id}").json())


def queue_of(client):
    return build_queue(client.app.state.services)


# --- 1. Deadline: the evaluator owns the soft limit, the worker keeps a hard stop ------


class LateEvaluator:
    """Has a finished artifact, and returns it shortly after the logical deadline."""

    def __init__(self, delay):
        self.delay = delay

    async def __call__(self, conversation, checklist, profile, corpus, budget, observer):
        artifact = await SyntheticEvaluator(app_mode="test")(
            conversation, checklist, profile, corpus, budget, observer
        )
        await asyncio.sleep(self.delay)
        return artifact


def test_result_returned_just_after_the_deadline_is_kept(tmp_path):
    settings = make_settings(tmp_path, deadline_grace_seconds=5.0)
    with TestClient(create_app(settings, evaluator=LateEvaluator(1.2))) as client:
        add_profile(client, job_deadline_seconds=1)
        job_id = setup_jobs(client)[0]
        assert drain(client) == 1
        job = read_job(client, job_id)
        assert job.state == "succeeded"
        assert job.evaluation_id is not None
        assert client.get(f"/api/v1/evaluations/{job.evaluation_id}").status_code == 200


class HangingEvaluator:
    def __init__(self, on_cancel=None):
        self.on_cancel = on_cancel
        self.cancelled = False

    async def __call__(self, conversation, checklist, profile, corpus, budget, observer):
        try:
            await asyncio.sleep(3600)
        except asyncio.CancelledError:
            self.cancelled = True
            if self.on_cancel is not None:
                raise self.on_cancel from None
            raise


@pytest.mark.parametrize("on_cancel", [None, EvaluationCancelled()])
def test_evaluator_ignoring_the_deadline_is_stopped_after_the_grace(tmp_path, on_cancel):
    evaluator = HangingEvaluator(on_cancel)
    settings = make_settings(tmp_path, deadline_grace_seconds=0.1)
    with TestClient(create_app(settings, evaluator=evaluator)) as client:
        add_profile(client, job_deadline_seconds=1)
        job_id = setup_jobs(client)[0]
        assert drain(client) == 1
        job = read_job(client, job_id)
        assert evaluator.cancelled is True
        assert job.state == "failed"
        assert job.error.code == "timeout"
        assert job.evaluation_id is None
        assert client.get("/api/v1/evaluations").json()["total"] == 0


def test_shutdown_during_the_grace_is_still_a_cancellation_not_a_success(tmp_path):
    settings = make_settings(tmp_path, deadline_grace_seconds=30.0)

    async def scenario():
        with TestClient(create_app(settings, evaluator=LateEvaluator(30))) as client:
            add_profile(client, job_deadline_seconds=1)
            job_id = setup_jobs(client)[0]
            task = asyncio.create_task(
                client.app.state.worker.execute(queue_of(client).claim_next())
            )
            await asyncio.sleep(1.2)  # past the logical deadline, inside the grace
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            return read_job(client, job_id)

    job = asyncio.run(scenario())
    assert job.evaluation_id is None
    assert job.state != "succeeded"
    assert job.attempts[0].state == "cancelled"


# --- 2. Reasoning tokens are already part of the output count -----------------------


def usage_with_reasoning():
    return TokenUsage(input_tokens=100, output_tokens=80, reasoning_tokens=40)


def test_reasoning_tokens_are_not_counted_twice(client):
    add_profile(client, max_total_tokens=200)
    job_id = setup_jobs(client)[0]
    queue = queue_of(client)
    claim = queue.claim_next()
    budget = queue.load_inputs(claim).budget
    first = call_event(budget)
    queue.record_call_started(claim, first)
    finished = queue.record_call_finished(
        claim,
        call_event(budget, "call_finished", call_id=first.call_id, usage=usage_with_reasoning()),
    )
    assert finished.consumed_tokens == 180
    # 180 of 200: the next call must still be allowed.
    assert queue.record_call_started(claim, call_event(budget)).consumed_calls == 2
    assert read_job(client, job_id).budget.consumed_tokens == 180


def test_token_cap_still_applies_at_the_correct_total(client):
    add_profile(client, max_total_tokens=180)
    setup_jobs(client)
    queue = queue_of(client)
    claim = queue.claim_next()
    budget = queue.load_inputs(claim).budget
    first = call_event(budget)
    queue.record_call_started(claim, first)
    queue.record_call_finished(
        claim,
        call_event(budget, "call_finished", call_id=first.call_id, usage=usage_with_reasoning()),
    )
    with pytest.raises(BudgetExceeded):
        queue.record_call_started(claim, call_event(budget))


# --- 3. max_attempts holds across shutdowns and recovery ----------------------------


def test_restarts_cannot_exceed_max_attempts(client):
    job_id = setup_jobs(client)[0]
    queue = queue_of(client)
    numbers = []
    for _ in range(5):
        claim = queue.claim_next()
        if claim is None:
            break
        numbers.append(claim.number)
        queue.release(claim)
    job = read_job(client, job_id)
    assert numbers == [1, 2, 3]
    assert job.max_attempts == 3
    assert [a.number for a in job.attempts] == [1, 2, 3]
    assert [a.state for a in job.attempts] == ["cancelled"] * 3
    assert job.state == "failed"
    assert job.next_attempt_at is None
    assert job.error.code == "cancelled"
    assert job.error.retryable is False
    assert queue.claim_next() is None


def test_expired_leases_cannot_exceed_max_attempts(tmp_path):
    clock = MutableClock()
    settings = make_settings(tmp_path, lease_seconds=5.0)
    with TestClient(create_app(settings, clock=clock)) as client:
        job_id = setup_jobs(client)[0]
        queue = queue_of(client)
        numbers = []
        for _ in range(5):
            claim = queue.claim_next()
            if claim is None:
                break
            numbers.append(claim.number)
            clock.advance(6)
        assert numbers == [1, 2, 3]
        job = read_job(client, job_id)
        assert job.state == "failed"
        assert [a.state for a in job.attempts] == ["expired"] * 3
        assert job.error.code == "lease_lost"
        assert job.error.retryable is False


def test_claim_itself_refuses_a_waiting_job_beyond_the_limit(client):
    job_id = setup_jobs(client)[0]
    queue = queue_of(client)
    queue.release(queue.claim_next())
    assert read_job(client, job_id).state == "retry_wait"
    # A row left beyond the limit, for example by an older version of the server.
    with client.app.state.services.db.write() as conn:
        conn.exec_driver_sql("UPDATE jobs SET max_attempts = 1")
    assert queue.claim_next() is None
    job = read_job(client, job_id)
    assert job.state == "failed"
    assert len(job.attempts) == 1
    assert job.error.code == "cancelled"  # the real last cause is kept


def test_shutdowns_keep_budget_and_manual_retry_adds_one_attempt(tmp_path):
    clock = MutableClock()
    with TestClient(create_app(make_settings(tmp_path), clock=clock)) as client:
        add_profile(client, max_total_tokens=None)
        job_id = setup_jobs(client)[0]
        queue = queue_of(client)
        first = queue.claim_next()
        budget = queue.load_inputs(first).budget
        queue.record_call_started(first, call_event(budget, now=clock()))
        deadline = budget.deadline_at
        queue.release(first)
        clock.advance(1)
        queue.release(queue.claim_next())
        clock.advance(1)
        queue.release(queue.claim_next())
        job = read_job(client, job_id)
        assert job.state == "failed"
        assert job.budget.consumed_calls == 1
        assert job.budget.deadline_at == deadline

        retried = client.post(f"/api/v1/jobs/{job_id}/retry")
        assert retried.status_code == 202, retried.text
        assert retried.json()["max_attempts"] == 4
        fourth = queue.claim_next()
        assert fourth.number == 4
        resumed = queue.load_inputs(fourth).budget
        assert resumed.consumed_calls == 1
        assert resumed.deadline_at == deadline
        queue.release(fourth)
        assert queue.claim_next() is None


def test_exhausted_budget_at_shutdown_ends_the_job(tmp_path):
    clock = MutableClock()
    with TestClient(create_app(make_settings(tmp_path), clock=clock)) as client:
        add_profile(client, job_deadline_seconds=10)
        job_id = setup_jobs(client)[0]
        queue = queue_of(client)
        claim = queue.claim_next()
        clock.advance(11)
        assert queue.extend_lease(claim) is True  # lease is 60 seconds, the deadline is gone
        queue.release(claim)
        job = read_job(client, job_id)
        assert job.state == "failed"
        assert job.error.retryable is False


# --- 4. A finished callback can only touch its own attempt --------------------------


def test_finished_event_of_another_job_is_refused_before_any_write(client):
    first_id, second_id = setup_jobs(client, 2)
    queue = queue_of(client)
    first = queue.claim_next()
    second = queue.claim_next()
    assert {first.job_id, second.job_id} == {first_id, second_id}
    second_budget = queue.load_inputs(second).budget
    started = call_event(second_budget)
    queue.record_call_started(second, started)
    foreign = call_event(
        second_budget, "call_finished", call_id=started.call_id, usage=usage_with_reasoning()
    )
    with pytest.raises(ObserverPersistenceError):
        queue.record_call_finished(first, foreign)
    with client.app.state.services.db.read() as conn:
        stored = row(
            conn, "SELECT outcome FROM provider_calls WHERE call_id = :id", {"id": started.call_id}
        )
    assert stored["outcome"] == "started"
    # Its own claim still records it.
    assert queue.record_call_finished(second, foreign).consumed_tokens == 180


def test_finished_event_naming_this_job_but_a_foreign_call_is_refused(client):
    setup_jobs(client, 2)
    queue = queue_of(client)
    first = queue.claim_next()
    second = queue.claim_next()
    first_budget = queue.load_inputs(first).budget
    second_budget = queue.load_inputs(second).budget
    started = call_event(second_budget)
    queue.record_call_started(second, started)
    disguised = call_event(first_budget, "call_finished", call_id=started.call_id)
    with pytest.raises(ObserverPersistenceError):
        queue.record_call_finished(first, disguised)
    with client.app.state.services.db.read() as conn:
        stored = row(
            conn, "SELECT outcome FROM provider_calls WHERE call_id = :id", {"id": started.call_id}
        )
    assert stored["outcome"] == "started"


def test_new_claim_cannot_finish_the_call_of_an_older_attempt(tmp_path):
    clock = MutableClock()
    settings = make_settings(tmp_path, lease_seconds=5.0)
    with TestClient(create_app(settings, clock=clock)) as client:
        job_id = setup_jobs(client)[0]
        queue = queue_of(client)
        old = queue.claim_next()
        old_budget = queue.load_inputs(old).budget
        started = call_event(old_budget, now=clock())
        queue.record_call_started(old, started)
        clock.advance(6)
        new = queue.claim_next()
        finished = call_event(
            old_budget,
            "call_finished",
            call_id=started.call_id,
            usage=usage_with_reasoning(),
            now=clock(),
        )
        with pytest.raises(ObserverPersistenceError):
            queue.record_call_finished(new, finished)
        # The late finish of its own expired attempt, through its original claim, is kept.
        with pytest.raises(LeaseLost):
            queue.record_call_finished(old, finished)
        assert read_job(client, job_id).budget.consumed_tokens == 180


# --- 5. Source text for human and automatic evidence -------------------------------


def corpus_with_two_chunks(services):
    corpus = CorpusSnapshot.model_validate_json(
        (ROOT / "fixtures/contracts/corpus-synthetic.json").read_text("utf-8")
    )
    extra = SourceChunk(
        chunk_id="second-chunk",
        source_id=corpus.chunks[0].source_id,
        source_version=corpus.chunks[0].source_version,
        text="ВТОРОЙ-ФРАГМЕНТ-ИСТОЧНИКА",
        content_hash=corpus.chunks[0].content_hash,
        locator="p2",
    )
    corpus = corpus.model_copy(update={"chunks": [*corpus.chunks, extra]})
    return corpus.model_copy(update={"content_hash": services.domain.corpus_snapshot_hash(corpus)})


def register_source_profile(client):
    services = client.app.state.services
    corpus = corpus_with_two_chunks(services)
    with services.db.write() as conn:
        register_corpus(conn, services, corpus)
        register_profile(
            conn,
            services,
            synthetic_profile().model_copy(
                update={"version": "with-source", "corpus_snapshot_id": corpus.id}
            ),
        )
    return corpus


def human_replacement(chunk_id=None):
    evidence = {"kind": "message", "message_ids": ["m0002"]}
    if chunk_id is not None:
        evidence = {"kind": "source", "source_chunk_id": chunk_id}
    return {
        "criterion_id": "c1",
        "applicability": "applicable",
        "answer_choice_id": "no",
        "rationale": "ЧЕЛОВЕЧЕСКОЕ-ОБОСНОВАНИЕ",
        "reason_codes": ["human_changed"],
        "evidence": [{**evidence, "relation": "support", "explanation": "ПОЯСНЕНИЕ-ЧЕЛОВЕКА"}],
        "origin": "human",
    }


def change_criterion(client, evaluation_id, revision, replacement):
    appeal = client.post(
        f"/api/v1/evaluations/{evaluation_id}/appeals",
        json={"criterion_id": "c1", "comment": "Комментарий", "expected_revision": revision},
    )
    assert appeal.status_code == 201, appeal.text
    decision = client.post(
        f"/api/v1/appeals/{appeal.json()['id']}/decision",
        json={
            "expected_revision": revision,
            "decision": "changed",
            "reason": "Причина",
            "replacement": replacement,
        },
    )
    assert decision.status_code == 200, decision.text


def evaluated_with_corpus(client):
    conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
    version = create_checklist(client, criterion("c1"))
    job = create_batch(client, [conversation_id], version["version_id"]).json()["jobs"][0]
    drain(client)
    job = client.get(f"/api/v1/jobs/{job['id']}").json()
    assert job["state"] == "succeeded", job
    return job["evaluation_id"], job


def texts(view):
    return [fragment["chunk"]["text"] for fragment in view["source_fragments"]]


def test_human_source_evidence_gets_its_text_without_touching_the_artifact(tmp_path):
    settings = make_settings(tmp_path)
    spy = SpyDomain()
    with TestClient(create_app(settings, domain=spy.port)) as client:
        corpus = register_source_profile(client)
        evaluation_id, job = evaluated_with_corpus(client)
        before = client.get(f"/api/v1/evaluations/{evaluation_id}").json()
        assert before["source_fragments"] == []
        change_criterion(client, evaluation_id, 1, human_replacement("second-chunk"))

        after = client.get(f"/api/v1/evaluations/{evaluation_id}").json()
        assert texts(after) == ["ВТОРОЙ-ФРАГМЕНТ-ИСТОЧНИКА"]
        fragment = after["source_fragments"][0]
        assert fragment["chunk"]["chunk_id"] == "second-chunk"
        assert fragment["source"]["source_id"] == corpus.chunks[0].source_id
        assert after["artifact"] == before["artifact"]
        assert after["artifact"]["source_fragments"] == []
        batch_id = job["batch_id"]

    # Everything is derived from pinned data, so a restart shows exactly the same.
    with TestClient(create_app(settings, domain=spy.port)) as client:
        reloaded = client.get(f"/api/v1/evaluations/{evaluation_id}").json()
        assert reloaded["source_fragments"] == after["source_fragments"]
        listed = client.get("/api/v1/evaluations").json()["items"][0]
        assert listed["source_fragments"] == after["source_fragments"]

        for scope in ("automatic", "effective"):
            for output in ("json", "csv"):
                params = {"scope": scope, "format": output}
                for url in (
                    f"/api/v1/evaluations/{evaluation_id}/export",
                    f"/api/v1/evaluation-batches/{batch_id}/export",
                ):
                    exported = client.get(url, params=params)
                    assert exported.status_code == 200
                    for private in (
                        "ВТОРОЙ-ФРАГМЕНТ-ИСТОЧНИКА",
                        "ЧЕЛОВЕЧЕСКОЕ-ОБОСНОВАНИЕ",
                        "ПОЯСНЕНИЕ-ЧЕЛОВЕКА",
                    ):
                        assert private not in exported.text
        # The reference itself stays exportable by ID.
        effective = client.get(
            f"/api/v1/evaluations/{evaluation_id}/export",
            params={"scope": "effective", "format": "csv"},
        )
        table = list(csv.reader(io.StringIO(effective.text, newline="")))
        cell = dict(zip(table[0], table[1], strict=True))["evidence"]
        assert json.loads(cell)[0]["source_chunk_id"] == "second-chunk"


def test_replaced_human_evidence_keeps_its_text_for_the_decision_history(client_factory, tmp_path):
    client = client_factory(make_settings(tmp_path), domain=SpyDomain().port)
    register_source_profile(client)
    evaluation_id, _ = evaluated_with_corpus(client)
    change_criterion(client, evaluation_id, 1, human_replacement("second-chunk"))
    change_criterion(client, evaluation_id, 2, human_replacement())
    view = client.get(f"/api/v1/evaluations/{evaluation_id}").json()
    current = view["effective_proposals"][0]["evidence"][0]
    assert current["kind"] == "message"
    assert view["human_decisions"][0]["replacement"]["evidence"][0]["kind"] == "source"
    assert texts(view) == ["ВТОРОЙ-ФРАГМЕНТ-ИСТОЧНИКА"]


def test_automatic_source_evidence_is_filled_from_the_pinned_corpus(client_factory, tmp_path):
    class CitesWithoutFragment:
        async def __call__(self, conversation, checklist, profile, corpus, budget, observer):
            artifact = await SyntheticEvaluator(app_mode="test")(
                conversation, checklist, profile, corpus, budget, observer
            )
            proposal = artifact.automatic_final[0]
            cited = proposal.model_copy(
                update={
                    "evidence": [
                        Evidence(
                            kind="source",
                            source_chunk_id="second-chunk",
                            relation="support",
                            explanation="Синтетическое пояснение",
                        )
                    ]
                }
            )
            return artifact.model_copy(update={"initial": [cited], "automatic_final": [cited]})

    client = client_factory(
        make_settings(tmp_path), domain=SpyDomain().port, evaluator=CitesWithoutFragment()
    )
    register_source_profile(client)
    evaluation_id, _ = evaluated_with_corpus(client)
    view = client.get(f"/api/v1/evaluations/{evaluation_id}").json()
    assert texts(view) == ["ВТОРОЙ-ФРАГМЕНТ-ИСТОЧНИКА"]
    assert view["artifact"]["source_fragments"] == []


def test_fragments_already_in_the_artifact_are_not_duplicated(client_factory, tmp_path):
    from cqa_contracts.models import SourceFragment

    holder = {}

    class WithFragment:
        async def __call__(self, conversation, checklist, profile, corpus, budget, observer):
            artifact = await SyntheticEvaluator(app_mode="test")(
                conversation, checklist, profile, corpus, budget, observer
            )
            holder["fragment"] = SourceFragment(source=corpus.sources[0], chunk=corpus.chunks[1])
            return artifact.model_copy(update={"source_fragments": [holder["fragment"]]})

    client = client_factory(
        make_settings(tmp_path), domain=SpyDomain().port, evaluator=WithFragment()
    )
    register_source_profile(client)
    evaluation_id, _ = evaluated_with_corpus(client)
    change_criterion(client, evaluation_id, 1, human_replacement("second-chunk"))
    view = client.get(f"/api/v1/evaluations/{evaluation_id}").json()
    assert texts(view) == ["ВТОРОЙ-ФРАГМЕНТ-ИСТОЧНИКА"]
    assert len(view["artifact"]["source_fragments"]) == 1
