"""The evaluation's job ledger agrees with exports and never rewrites the AI artifact."""

from decimal import Decimal

import pytest
from audit_scenarios import PricedRetry
from conftest import (
    chat_record,
    create_batch,
    create_checklist,
    drain,
    import_records,
    make_settings,
)
from cqa_api.db import row


@pytest.mark.parametrize("first_cost", [Decimal("0.50"), None])
def test_card_counts_every_attempt_and_reuse_has_its_own_zero_cost(
    client_factory, tmp_path, first_cost
):
    client = client_factory(make_settings(tmp_path), evaluator=PricedRetry(first_cost))
    cid = import_records(client, chat_record())["items"][0]["conversation_id"]
    version = create_checklist(client)["version_id"]
    batch = create_batch(client, [cid], version).json()
    drain(client)
    job = client.get(f"/api/v1/jobs/{batch['jobs'][0]['id']}").json()
    assert job["state"] == "succeeded"
    eid = job["evaluation_id"]

    def stored_artifact():
        with client.app.state.services.db.read() as conn:
            return row(conn, "SELECT artifact_json FROM evaluations WHERE id=:id", {"id": eid})[
                "artifact_json"
            ]

    before = stored_artifact()
    view = client.get(f"/api/v1/evaluations/{eid}").json()
    exported = client.get(f"/api/v1/evaluations/{eid}/export").json()["items"][0]
    run = view["run"]
    assert run["job"]["id"] == job["id"]
    assert [a["state"] for a in run["job"]["attempts"]] == ["failed", "succeeded"]
    assert len(run["calls"]) == 2
    assert {c["attempt_id"] for c in run["calls"]} == {
        a["attempt_id"] for a in run["job"]["attempts"]
    }
    assert len(view["artifact"]["calls"]) == 1
    assert view["artifact"]["calls"][0]["cost"] == "0.25"
    assert Decimal(run["cost"]) == (Decimal("0.75") if first_cost is not None else Decimal("0.25"))
    assert run["cost_complete"] is (first_cost is not None)
    assert (run["cost"], run["cost_complete"]) == (exported["cost"], exported["cost_complete"])

    reused = create_batch(client, [cid], version, key="reuse", mode="reuse_if_compatible").json()
    drain(client)
    reused_job = client.get(f"/api/v1/jobs/{reused['jobs'][0]['id']}").json()
    reused_view = client.get(f"/api/v1/evaluations/{reused_job['evaluation_id']}").json()
    assert reused_view["reuse"]["reused_from_evaluation_id"] == eid
    assert reused_view["artifact"] == view["artifact"]
    assert reused_view["run"]["job"]["id"] != run["job"]["id"]
    assert reused_view["run"]["calls"] == []
    assert reused_view["run"]["cost"] == "0"
    assert reused_view["run"]["cost_complete"] is True
    assert stored_artifact() == before
