"""Safe export: allowlisted DTO, partial/failed/pending items, documented CSV shape."""

import csv
import io
import json
from decimal import Decimal

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
from cqa_api import exports
from cqa_api.main import create_app
from cqa_contracts.models import CorpusSnapshot, SafeExport
from cqa_contracts.testing import SyntheticEvaluator
from fastapi.testclient import TestClient
from helpers import (
    ScriptedEvaluator,
    SpyDomain,
    add_profile,
    call_event,
    contract_error,
    illustrative_score,
    spend,
)

PRIVATE_TEXT = "ПРИВАТНЫЙ-ТЕКСТ-РАЗГОВОРА"
EXTERNAL = "PRIVATE-EXTERNAL-ID"


def private_record():
    record = chat_record(EXTERNAL)
    record["messages"][0]["text"] = PRIVATE_TEXT
    return record


def evaluate_one(client, key="k"):
    conversation_id = import_records(client, private_record())["items"][0]["conversation_id"]
    version = create_checklist(client, criterion("c1"), criterion("c2"))
    job = create_batch(client, [conversation_id], version["version_id"], key=key).json()["jobs"][0]
    drain(client)
    job = client.get(f"/api/v1/jobs/{job['id']}").json()
    return job, client.get(f"/api/v1/evaluations/{job['evaluation_id']}").json()


def forbid_free_text(text: str):
    for fragment in (
        PRIVATE_TEXT,
        EXTERNAL,
        "SYNTHETIC TEST OUTPUT",  # the proposal rationale
        "Synthetic test range",  # the evidence explanation
        "Человеческое пояснение",
        "Причина проверяющего",
        "https://",
    ):
        assert fragment not in text, fragment


def test_automatic_and_effective_differ_and_carry_no_free_text(client_factory, tmp_path):
    spy = SpyDomain()
    client = client_factory(make_settings(tmp_path), domain=spy.port)
    job, evaluation = evaluate_one(client)
    automatic = client.get(f"/api/v1/evaluations/{evaluation['id']}/export").json()
    SafeExport.model_validate(automatic)
    assert automatic["scope"] == "automatic"
    item = automatic["items"][0]
    assert item["job_state"] == "succeeded"
    assert item["evaluation_status"] == "complete"
    assert item["total_score"] == illustrative_score().model_dump(mode="json")["total_score"]
    assert item["decisions"] == []
    assert "test_evaluator" in item["limitation_codes"]
    assert "cost_unknown" in item["limitation_codes"]
    assert item["cost"] is None
    assert item["cost_complete"] is False

    appeal = client.post(
        f"/api/v1/evaluations/{evaluation['id']}/appeals",
        json={"criterion_id": "c1", "comment": PRIVATE_TEXT, "expected_revision": 1},
    ).json()
    spy.result = illustrative_score("score-human-effective")
    response = client.post(
        f"/api/v1/appeals/{appeal['id']}/decision",
        json={
            "expected_revision": 1,
            "decision": "changed",
            "reason": "Причина проверяющего",
            "replacement": {
                "criterion_id": "c1",
                "applicability": "applicable",
                "answer_choice_id": "no",
                "rationale": "Человеческое пояснение",
                "reason_codes": ["human_changed"],
                "evidence": [
                    {
                        "kind": "message",
                        "message_ids": ["m0002"],
                        "relation": "support",
                        "explanation": "Человеческое пояснение",
                    }
                ],
                "origin": "human",
            },
        },
    )
    assert response.status_code == 200, response.text

    effective = client.get(
        f"/api/v1/evaluations/{evaluation['id']}/export", params={"scope": "effective"}
    )
    body = effective.json()
    assert body["scope"] == "effective"
    item = body["items"][0]
    assert item["evaluation_revision"] == 2
    assert [d["decision"] for d in item["decisions"]] == ["changed"]
    assert item["decisions"][0]["reason_codes"] == ["human_changed"]
    changed = {c["criterion_id"]: c for c in item["criteria"]}["c1"]
    assert changed["origin"] == "human"
    assert changed["reason_codes"] == ["human_changed"]
    assert changed["evidence"][0]["message_ids"] == ["m0002"]
    forbid_free_text(effective.text)

    # The automatic view still shows the original proposal after the decision.
    again = client.get(f"/api/v1/evaluations/{evaluation['id']}/export").json()
    original = {c["criterion_id"]: c for c in again["items"][0]["criteria"]}["c1"]
    assert original["origin"] == "test"
    assert again["items"][0]["decisions"] == []
    forbid_free_text(json.dumps(again, ensure_ascii=False))


def test_batch_export_keeps_pending_failed_and_partial_items(client_factory, tmp_path):
    evaluator = ScriptedEvaluator(contract_error(retryable=False), None)
    client = client_factory(make_settings(tmp_path), evaluator=evaluator)
    ids = [
        import_records(client, chat_record(f"b{i}"))["items"][0]["conversation_id"]
        for i in range(3)
    ]
    version = create_checklist(client)
    batch = create_batch(client, ids, version["version_id"], key="b").json()
    worker = client.app.state.worker
    import asyncio

    queue = worker.queue
    asyncio.run(worker.execute(queue.claim_next()))  # failed
    asyncio.run(worker.execute(queue.claim_next()))  # succeeded; the third stays queued

    for scope in ("automatic", "effective"):
        body = client.get(
            f"/api/v1/evaluation-batches/{batch['id']}/export", params={"scope": scope}
        ).json()
        SafeExport.model_validate(body)
        assert body["batch_id"] == batch["id"]
        states = [item["job_state"] for item in body["items"]]
        assert states == ["failed", "succeeded", "queued"]
        failed, succeeded, queued = body["items"]
        assert failed["error_code"] == "provider_error"
        assert failed["evaluation_id"] is None
        assert failed["criteria"] == []
        assert succeeded["evaluation_id"] is not None
        assert queued["evaluation_id"] is None
        assert queued["criteria"] == []
        assert queued["cost"] is None
        assert queued["cost_complete"] is False
        assert "test_evaluator" in queued["limitation_codes"]

    assert client.get("/api/v1/evaluation-batches/absent/export").status_code == 404
    assert client.get("/api/v1/evaluations/absent/export").status_code == 404


def test_partial_and_failed_results_are_present(tmp_path):
    for scenario, status in (("partial", "partial"), ("failed", "failed")):
        directory = tmp_path / scenario
        directory.mkdir()
        with TestClient(create_app(make_settings(directory, test_scenario=scenario))) as client:
            conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
            version = create_checklist(client)
            batch = create_batch(client, [conversation_id], version["version_id"]).json()
            drain(client)
            item = client.get(f"/api/v1/evaluation-batches/{batch['id']}/export").json()["items"][0]
            assert item["evaluation_status"] == status
            assert item["total_score"] is None
            assert "incomplete" in item["limitation_codes"] or status == "failed"
            if status == "partial":
                assert item["criteria"][0]["applicability"] == "undetermined"
                assert item["criteria"][0]["reason_codes"] == ["insufficient_evidence"]
            else:
                assert item["criteria"] == []
                assert item["error_code"] == "provider_error"


def test_cost_counts_every_attempt_and_stays_known_only_when_complete(client_factory, tmp_path):
    async def paid(budget, observer):
        started = call_event(budget)
        await observer(started)
        await observer(
            call_event(
                budget,
                "call_finished",
                call_id=started.call_id,
                usage=spend(),
                cost=Decimal("0.5"),
                outcome="failed",
            )
        )
        raise contract_error(retryable=True)

    client = client_factory(
        make_settings(tmp_path), evaluator=ScriptedEvaluator(paid, paid)
    )
    add_profile(client, max_total_tokens=None)
    job, evaluation = evaluate_one(client)
    item = client.get(f"/api/v1/evaluations/{evaluation['id']}/export").json()["items"][0]
    # Two paid failures plus the synthetic success with unknown cost.
    assert Decimal(item["cost"]) == Decimal("1.0")
    assert item["cost_complete"] is False
    assert "cost_unknown" in item["limitation_codes"]


def test_reused_result_does_not_claim_the_original_ai_cost(client_factory, tmp_path):
    client = client_factory(make_settings(tmp_path))
    job, evaluation = evaluate_one(client)
    batch = create_batch(
        client,
        [evaluation["conversation_id"]],
        evaluation["checklist_version_id"],
        key="reuse",
        mode="reuse_if_compatible",
    ).json()
    drain(client)
    item = client.get(f"/api/v1/evaluation-batches/{batch['id']}/export").json()["items"][0]
    assert item["cost"] == "0"
    assert item["cost_complete"] is True


def test_csv_matches_the_documented_format(client_factory, tmp_path):
    client = client_factory(make_settings(tmp_path), domain=SpyDomain().port)
    _, evaluation = evaluate_one(client)
    response = client.get(
        f"/api/v1/evaluations/{evaluation['id']}/export", params={"format": "csv"}
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert b"\r\n" in response.content
    assert response.content.count(b"\n") == response.content.count(b"\r\n")
    response.content.decode("utf-8")
    table = list(csv.reader(io.StringIO(response.text, newline="")))
    expected_header = (
        "schema_version,scope,batch_id,job_id,evaluation_id,conversation_id,conversation_revision,"
        "checklist_version_id,profile_id,profile_version,corpus_snapshot_id,evaluation_revision,"
        "job_state,evaluation_status,score_status,total_score,criterion_id,applicability,"
        "answer_choice_id,origin,reason_codes,evidence,score_fraction,earned_weight,"
        "applicable_weight,normalized_contribution,flag_detected,decisions,error_code,"
        "limitation_codes,cost,cost_complete,currency"
    ).split(",")
    assert table[0] == expected_header
    assert len(table) == 3  # header plus one row per criterion
    row = dict(zip(table[0], table[1], strict=True))
    assert row["schema_version"] == "1.0"
    assert row["scope"] == "automatic"
    assert row["criterion_id"] == "c1"
    assert row["cost"] == ""  # nullable cells stay empty
    assert row["cost_complete"] == "false"
    assert json.loads(row["reason_codes"]) == ["other"]
    assert json.loads(row["evidence"])[0]["relation"] == "context"
    assert ", " not in row["reason_codes"]
    forbid_free_text(response.text)


def test_csv_has_an_empty_criterion_row_for_items_without_proposals(client):
    conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
    version = create_checklist(client)
    batch = create_batch(client, [conversation_id], version["version_id"]).json()
    response = client.get(
        f"/api/v1/evaluation-batches/{batch['id']}/export", params={"format": "csv"}
    )
    table = list(csv.reader(io.StringIO(response.text, newline="")))
    assert len(table) == 2
    row = dict(zip(table[0], table[1], strict=True))
    assert row["job_state"] == "queued"
    assert row["criterion_id"] == ""
    assert row["evaluation_id"] == ""


def test_csv_cells_cannot_become_formulas():
    export = SafeExport.model_validate(
        json.loads((ROOT / "fixtures/contracts/safe-export-automatic.json").read_text("utf-8"))
    )
    for dangerous in ("=1+1", "+1", "-1", "@x", "\tx", "\rx"):
        item = export.items[0].model_copy(update={"job_id": dangerous})
        hostile = export.model_copy(update={"items": [item], "batch_id": dangerous})
        text = exports.to_csv(hostile)
        table = list(csv.reader(io.StringIO(text, newline="")))
        row = dict(zip(table[0], table[1], strict=True))
        assert row["job_id"] == "'" + dangerous
        assert row["batch_id"] == "'" + dangerous


def test_view_keeps_pinned_fragments_after_the_source_updates(client_factory, tmp_path):
    from cqa_api.registry import register_corpus, register_profile
    from cqa_api.testmode import synthetic_profile
    from cqa_contracts.models import SourceFragment

    corpus = CorpusSnapshot.model_validate_json(
        (ROOT / "fixtures/contracts/corpus-synthetic.json").read_text("utf-8")
    )
    fragment = SourceFragment(source=corpus.sources[0], chunk=corpus.chunks[0])

    class WithFragments:
        async def __call__(self, conversation, checklist, profile, used, budget, observer):
            artifact = await SyntheticEvaluator(app_mode="test")(
                conversation, checklist, profile, used, budget, observer
            )
            return artifact.model_copy(update={"source_fragments": [fragment]})

    client = client_factory(
        make_settings(tmp_path), domain=SpyDomain().port, evaluator=WithFragments()
    )
    services = client.app.state.services
    corpus = corpus.model_copy(
        update={"content_hash": services.domain.corpus_snapshot_hash(corpus)}
    )
    with services.db.write() as conn:
        register_corpus(conn, services, corpus)
        register_profile(
            conn,
            services,
            synthetic_profile().model_copy(
                update={"version": "with-source", "corpus_snapshot_id": corpus.id}
            ),
        )
    job, evaluation = evaluate_one(client)
    assert evaluation["source_fragments"][0]["chunk"]["text"] == fragment.chunk.text

    # A later corpus and profile do not disturb the stored evidence.
    updated = corpus.model_copy(update={"id": "corpus-next", "chunks": [], "sources": []})
    updated = updated.model_copy(
        update={"content_hash": services.domain.corpus_snapshot_hash(updated)}
    )
    with services.db.write() as conn:
        register_corpus(conn, services, updated)
    assert (
        client.get(f"/api/v1/evaluations/{evaluation['id']}").json()["source_fragments"]
        == evaluation["source_fragments"]
    )
    exported = client.get(f"/api/v1/evaluations/{evaluation['id']}/export")
    assert fragment.chunk.text not in exported.text
