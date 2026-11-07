"""A's real Evaluator pipeline through B's worker, with a scripted transport.

Skipped until A's work is integrated. No network and no provider: this proves the
observer, the shared budget and the stored records agree across the package boundary.
"""

import asyncio
from contextlib import contextmanager
from datetime import UTC, datetime

import pytest

pytest.importorskip("cqa_ai.evaluator", reason="cqa_ai from claude/domain-ai is not integrated")
pytest.importorskip("cqa_ai.testing", reason="cqa_ai from claude/domain-ai is not integrated")

from conftest import (  # noqa: E402
    chat_record,
    create_batch,
    create_checklist,
    criterion,
    drain,
    import_records,
    make_settings,
)
from cqa_ai import PREPROCESSING_VERSION, PROMPT_VERSION  # noqa: E402
from cqa_ai.corpus import SourceDocument, build_corpus_snapshot  # noqa: E402
from cqa_ai.evaluator import Evaluator  # noqa: E402
from cqa_ai.testing import ScriptedTransport, answer_all, ok  # noqa: E402
from cqa_ai.transport import ProviderFailure  # noqa: E402
from cqa_api.jobs import JobQueue, build_queue  # noqa: E402
from cqa_api.main import create_app  # noqa: E402
from cqa_api.registry import register_corpus  # noqa: E402
from cqa_contracts.models import (  # noqa: E402
    ChecklistVersion,
    Conversation,
    ProviderSelection,
    ReviewerPolicy,
    TokenUsage,
)
from fastapi.testclient import TestClient  # noqa: E402
from helpers import add_profile, spend  # noqa: E402
from sqlalchemy.exc import OperationalError  # noqa: E402

REVIEW_FLAG = {"c1": ["identification_order"]}
REVIEWER = {
    "reviewer": ProviderSelection(
        provider="test", model="scripted-reviewer", configuration_ref="offline"
    ),
    "reviewer_policy": ReviewerPolicy(enabled=True, max_criteria=2),
}


async def hang(_request):
    await asyncio.sleep(3600)


class Scenario:
    def __init__(self, tmp_path, *steps, fields=None, corpus=None, grace=5.0, lease=60.0, **limits):
        self.state = {}
        self.transport = ScriptedTransport(list(steps))
        self.settings = make_settings(
            tmp_path, deadline_grace_seconds=grace, lease_seconds=lease
        )
        self.fields = fields or {}
        self.corpus = corpus
        self.limits = limits

    def answer(self, usage=None, **options):
        def respond(_request):
            return ok(
                answer_all(self.state["checklist"], self.state["conversation"], **options),
                usage=usage,
            )

        return respond

    def review_answer(self, usage=None):
        def respond(_request):
            full = answer_all(self.state["checklist"], self.state["conversation"])
            kept = [c for c in full["criteria"] if c["criterion_id"] == "c1"]
            return ok({"criteria": kept}, usage=usage)

        return respond

    @contextmanager
    def prepared(self):
        app = create_app(self.settings, evaluator=Evaluator({"test": self.transport}))
        with TestClient(app) as client:
            fields = {
                "prompt_version": PROMPT_VERSION,
                "preprocessing_version": PREPROCESSING_VERSION,
                **self.fields,
            }
            if self.corpus is not None:
                services = client.app.state.services
                with services.db.write() as conn:
                    register_corpus(conn, services, self.corpus)
                fields["corpus_snapshot_id"] = self.corpus.id
            add_profile(client, fields=fields, **self.limits)
            imported = import_records(client, chat_record())["items"][0]
            conversation = client.get(
                f"/api/v1/conversations/{imported['conversation_id']}"
            ).json()
            version = create_checklist(client, criterion("c1"), criterion("c2"))
            self.state["conversation"] = Conversation.model_validate(conversation)
            self.state["checklist"] = ChecklistVersion.model_validate(version)
            batch = create_batch(client, [conversation["id"]], version["version_id"]).json()
            self.state["job_id"] = batch["jobs"][0]["id"]
            yield client

    def job(self, client):
        return client.get(f"/api/v1/jobs/{self.state['job_id']}").json()

    def run(self):
        with self.prepared() as client:
            drain(client)
            job = self.job(client)
            view = (
                client.get(f"/api/v1/evaluations/{job['evaluation_id']}").json()
                if job["evaluation_id"]
                else None
            )
            return job, view


def transient():
    return ProviderFailure("network", "Synthetic transient failure")


def test_success_records_real_call_events_and_scores(tmp_path):
    scenario = Scenario(tmp_path, max_total_tokens=None)
    scenario.transport.steps.append(scenario.answer(spend()))
    job, view = scenario.run()
    assert job["state"] == "succeeded", job
    assert job["budget"]["consumed_calls"] == 1
    assert job["budget"]["consumed_tokens"] == 15
    assert job["progress"]["completed_calls"] == 1
    assert view["artifact"]["status"] == "complete"
    assert view["artifact"]["calls"][0]["outcome"] == "succeeded"
    assert view["automatic_score"]["status"] == "complete"


def test_transport_retry_shares_the_budget_without_a_token_cap(tmp_path):
    scenario = Scenario(tmp_path, transient(), max_total_tokens=None)
    scenario.transport.steps.append(scenario.answer(spend()))
    job, view = scenario.run()
    assert job["state"] == "succeeded", job
    assert job["budget"]["consumed_calls"] == 2
    assert job["budget"]["usage_complete"] is False  # the failed call's usage is unknown
    assert [c["outcome"] for c in view["artifact"]["calls"]] == ["failed", "succeeded"]


def test_token_cap_with_unknown_usage_fails_closed_across_the_boundary(tmp_path):
    """Documents contract behaviour that matters in production: see handoff request R-5."""
    scenario = Scenario(tmp_path, transient(), max_total_tokens=65536)
    scenario.transport.steps.append(scenario.answer(spend()))
    job, _ = scenario.run()
    assert job["state"] == "failed", job
    assert job["budget"]["consumed_calls"] == 1
    assert job["error"]["code"] == "budget_exceeded"


def test_call_limit_stops_the_evaluator_inside_the_shared_budget(tmp_path):
    scenario = Scenario(
        tmp_path,
        transient(),
        transient(),
        transient(),
        max_total_tokens=None,
        max_provider_calls=2,
        max_transport_retries=4,
    )
    job, _ = scenario.run()
    assert job["state"] == "failed", job
    assert job["budget"]["consumed_calls"] == 2
    assert len(scenario.transport.requests) == 2


# --- Deadline during the optional reviewer ------------------------------------------


def test_hanging_reviewer_at_the_deadline_keeps_the_valid_initial(tmp_path):
    scenario = Scenario(tmp_path, fields=REVIEWER, max_total_tokens=None, job_deadline_seconds=1)
    scenario.transport.steps.extend([scenario.answer(spend(), flags=REVIEW_FLAG), hang])
    job, view = scenario.run()
    assert job["state"] == "succeeded", job
    assert job["error"] is None
    assert job["evaluation_id"] is not None
    artifact = view["artifact"]
    assert artifact["status"] == "complete"
    assert artifact["initial"]
    assert "review_unfinished" in artifact["limitations"]
    assert [c["purpose"] for c in artifact["calls"]] == ["primary", "review"]
    assert [c["outcome"] for c in artifact["calls"]] == ["succeeded", "timeout"]
    assert {r["outcome"] for r in artifact["reviews"]} <= {"skipped", "failed"}
    assert view["automatic_score"]["status"] == "complete"
    # What the job recorded through the observer agrees with the artifact.
    assert job["budget"]["consumed_calls"] == 2
    assert job["progress"]["completed_calls"] == 2


def test_hanging_primary_at_the_deadline_has_nothing_to_keep(tmp_path):
    scenario = Scenario(
        tmp_path, hang, max_total_tokens=None, job_deadline_seconds=1, max_transport_retries=0
    )
    job, view = scenario.run()
    assert job["state"] == "failed", job
    assert job["error"]["code"] == "timeout"
    if view is not None:
        assert view["artifact"]["status"] == "failed"
        assert view["artifact"]["automatic_final"] == []


def _blocked_reviewer():
    entered = asyncio.Event()

    async def blocked(_request):
        entered.set()
        await asyncio.sleep(3600)

    return entered, blocked


def test_cancellation_during_the_reviewer_is_not_a_success(tmp_path):
    scenario = Scenario(tmp_path, fields=REVIEWER, max_total_tokens=None)

    async def drive(client):
        entered, blocked = _blocked_reviewer()
        scenario.transport.steps.extend([scenario.answer(spend(), flags=REVIEW_FLAG), blocked])
        worker = client.app.state.worker
        task = asyncio.create_task(worker.execute(worker.queue.claim_next()))
        await entered.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    with scenario.prepared() as client:
        asyncio.run(drive(client))
        job = scenario.job(client)
        assert job["state"] == "retry_wait"
        assert job["evaluation_id"] is None
        assert job["attempts"][0]["state"] == "cancelled"
        assert client.get("/api/v1/evaluations").json()["total"] == 0


def test_lost_lease_during_the_reviewer_is_not_a_success(tmp_path):
    scenario = Scenario(tmp_path, fields=REVIEWER, max_total_tokens=None, lease=0.05)

    async def drive(client):
        entered, blocked = _blocked_reviewer()
        scenario.transport.steps.extend([scenario.answer(spend(), flags=REVIEW_FLAG), blocked])
        worker = client.app.state.worker
        task = asyncio.create_task(worker.execute(worker.queue.claim_next()))
        await entered.wait()
        with client.app.state.services.db.write() as conn:
            conn.exec_driver_sql("UPDATE jobs SET lease_id = 'someone-else'")
        await asyncio.wait_for(task, 10)

    with scenario.prepared() as client:
        asyncio.run(drive(client))
        job = scenario.job(client)
        assert job["evaluation_id"] is None
        assert job["attempts"][0]["state"] == "expired"
        assert client.get("/api/v1/evaluations").json()["total"] == 0


def test_persistence_failure_on_the_reviewer_call_is_not_a_success(tmp_path, monkeypatch):
    scenario = Scenario(tmp_path, fields=REVIEWER, max_total_tokens=None)
    scenario.transport.steps.append(scenario.answer(spend(), flags=REVIEW_FLAG))
    original = JobQueue.record_call_started

    def fail_on_review(self, claim, event):
        if event.record.purpose == "review":
            raise OperationalError("stmt", {}, Exception("disk"))
        return original(self, claim, event)

    monkeypatch.setattr(JobQueue, "record_call_started", fail_on_review)
    with scenario.prepared() as client:
        queue = build_queue(client.app.state.services)
        asyncio.run(client.app.state.worker.execute(queue.claim_next()))
        job = scenario.job(client)
        assert job["state"] == "retry_wait"
        assert job["evaluation_id"] is None
        assert job["attempts"][0]["error"]["code"] == "persistence_error"
        assert len(scenario.transport.requests) == 1  # the review request was never sent


# --- Token accounting agrees across the boundary ------------------------------------


def test_reasoning_tokens_do_not_block_the_reviewer_under_a_cap(tmp_path):
    usage = TokenUsage(input_tokens=100, output_tokens=80, reasoning_tokens=40)
    scenario = Scenario(tmp_path, fields=REVIEWER, max_total_tokens=200)
    scenario.transport.steps.extend(
        [
            scenario.answer(usage, flags=REVIEW_FLAG),
            scenario.review_answer(TokenUsage(input_tokens=5, output_tokens=5)),
        ]
    )
    job, view = scenario.run()
    assert job["state"] == "succeeded", job
    assert [c["purpose"] for c in view["artifact"]["calls"]] == ["primary", "review"]
    assert job["budget"]["consumed_tokens"] == 190
    assert "review_unfinished" not in view["artifact"]["limitations"]


# --- Human source evidence on top of a real artifact --------------------------------


def test_human_source_evidence_with_the_real_evaluator_and_scorer(tmp_path):
    document = SourceDocument(
        source_id="synthetic-other",
        version="v1",
        provenance="synthetic",
        title="Вымышленная справка на другую тему",
        text="НЕИЗВЕСТНЫЙ-ФРАГМЕНТ-ИСТОЧНИКА про вымышленный тариф.",
        retrieved_at=datetime(2026, 11, 7, tzinfo=UTC),
    )
    corpus = build_corpus_snapshot(
        "synthetic-corpus-2",
        [document],
        applicability_policy="Synthetic test corpus only.",
        priority_policy="Single synthetic source.",
    )
    scenario = Scenario(tmp_path, corpus=corpus, max_total_tokens=None)
    scenario.transport.steps.append(scenario.answer(spend()))
    with scenario.prepared() as client:
        drain(client)
        job = scenario.job(client)
        assert job["state"] == "succeeded", job
        url = f"/api/v1/evaluations/{job['evaluation_id']}"
        before = client.get(url).json()
        appeal = client.post(
            f"{url}/appeals",
            json={"criterion_id": "c1", "comment": "Комментарий", "expected_revision": 1},
        ).json()
        decision = client.post(
            f"/api/v1/appeals/{appeal['id']}/decision",
            json={
                "expected_revision": 1,
                "decision": "changed",
                "reason": "Причина",
                "replacement": {
                    "criterion_id": "c1",
                    "applicability": "applicable",
                    "answer_choice_id": "no",
                    "rationale": "Обоснование",
                    "reason_codes": ["human_changed"],
                    "evidence": [
                        {
                            "kind": "source",
                            "source_chunk_id": corpus.chunks[0].chunk_id,
                            "relation": "support",
                            "explanation": "Пояснение",
                        }
                    ],
                    "origin": "human",
                },
            },
        )
        assert decision.status_code == 200, decision.text
        after = client.get(url).json()
        assert after["artifact"] == before["artifact"]
        assert after["effective_score"]["status"] == "complete"
        assert corpus.chunks[0].text in [f["chunk"]["text"] for f in after["source_fragments"]]
        exported = client.get(f"{url}/export", params={"scope": "effective"})
        assert corpus.chunks[0].text not in exported.text
