"""A's real Evaluator pipeline through B's worker, with a scripted transport.

Skipped until A's work is integrated. No network and no provider: this proves the
observer, the shared budget and the stored records agree across the package boundary.
"""

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
from cqa_ai.evaluator import Evaluator  # noqa: E402
from cqa_ai.testing import ScriptedTransport, answer_all, ok  # noqa: E402
from cqa_ai.transport import ProviderFailure  # noqa: E402
from cqa_api.main import create_app  # noqa: E402
from cqa_contracts.models import ChecklistVersion, Conversation  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from helpers import add_profile, spend  # noqa: E402


class Scenario:
    def __init__(self, tmp_path, *steps, **limits):
        self.state = {}
        self.transport = ScriptedTransport(list(steps))
        self.settings = make_settings(tmp_path, seed_original_checklist=False)
        self.limits = limits

    def answer(self, usage=None):
        def respond(_request):
            return ok(answer_all(self.state["checklist"], self.state["conversation"]), usage=usage)

        return respond

    def run(self):
        app = create_app(self.settings, evaluator=Evaluator({"test": self.transport}))
        with TestClient(app) as client:
            add_profile(client, **self.limits)
            imported = import_records(client, chat_record())["items"][0]
            conversation = client.get(
                f"/api/v1/conversations/{imported['conversation_id']}"
            ).json()
            version = create_checklist(client, criterion("c1"), criterion("c2"))
            self.state["conversation"] = Conversation.model_validate(conversation)
            self.state["checklist"] = ChecklistVersion.model_validate(version)
            batch = create_batch(client, [conversation["id"]], version["version_id"]).json()
            drain(client)
            job = client.get(f"/api/v1/jobs/{batch['jobs'][0]['id']}").json()
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
