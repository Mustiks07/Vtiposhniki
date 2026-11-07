"""Server behaviour against the real cqa_domain. Skipped until A's work is integrated.

No arithmetic is asserted here: exact totals belong to A's tests. These prove the
server calls the real functions and stores what they return.
"""

import cqa_domain
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
from cqa_api.ports import production_domain
from cqa_contracts.models import AudioMetadata, Conversation, Message
from fastapi.testclient import TestClient
from helpers import ScriptedEvaluator


def _domain_available() -> bool:
    probe = Conversation(
        id="probe",
        external_id="probe",
        revision=1,
        content_hash="0" * 64,
        channel="agent_chat",
        language="EN",
        messages=[
            Message(
                id="m0001",
                ordinal=1,
                speaker="client",
                text="",
                timestamp_original="",
                source_index=0,
            )
        ],
        audio=AudioMetadata(availability="unavailable", alignment_status="unavailable"),
    )
    try:
        cqa_domain.conversation_content_hash(probe)
    except NotImplementedError:
        return False
    return True


pytestmark = pytest.mark.skipif(
    not _domain_available(), reason="cqa_domain from claude/domain-ai is not integrated here"
)


def evaluate(client, *criteria, key="k"):
    conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
    version = create_checklist(client, *(criteria or (criterion("c1"),)))
    job = create_batch(client, [conversation_id], version["version_id"], key=key).json()["jobs"][0]
    drain(client)
    return client.get(f"/api/v1/jobs/{job['id']}").json()


def test_real_domain_hashes_and_scores_are_stored(tmp_path):
    with TestClient(create_app(make_settings(tmp_path))) as client:
        assert client.get("/api/v1/health").json()["business_ready"] is True
        job = evaluate(client)
        assert job["state"] == "succeeded"
        view = client.get(f"/api/v1/evaluations/{job['evaluation_id']}").json()
        assert view["automatic_score"]["status"] == "complete"
        assert view["automatic_score"]["total_score"] is not None
        conversation = client.get(f"/api/v1/conversations/{view['conversation_id']}").json()
        expected = production_domain().conversation_content_hash(
            Conversation.model_validate(conversation)
        )
        assert conversation["content_hash"] == expected


def test_original_rubric_is_seeded_once_and_can_be_evaluated(tmp_path):
    settings = make_settings(tmp_path, seed_original_checklist=True)
    with TestClient(create_app(settings)) as client:
        listed = client.get("/api/v1/checklists").json()
        assert listed["total"] == 1
        version = client.get(
            f"/api/v1/checklist-versions/{listed['items'][0]['latest_version_id']}"
        ).json()
        expected = cqa_domain.sectioned_original_checklist_draft()
        assert [c["id"] for c in version["criteria"]] == [c.id for c in expected.criteria]
        assert version["sections"] == [s.model_dump() for s in expected.sections]
        conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
        batch = create_batch(client, [conversation_id], version["version_id"]).json()
        drain(client)
        job = client.get(f"/api/v1/jobs/{batch['jobs'][0]['id']}").json()
        assert job["state"] == "succeeded", job
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/v1/checklists").json()["total"] == 1


def test_legacy_seed_gets_one_new_grouped_version_without_rewriting_history(tmp_path):
    settings = make_settings(tmp_path)
    with TestClient(create_app(settings)) as client:
        old = client.post(
            "/api/v1/checklists",
            json=cqa_domain.original_checklist_draft().model_dump(mode="json"),
        ).json()
    settings = make_settings(tmp_path, seed_original_checklist=True)
    for _ in range(2):
        with TestClient(create_app(settings)) as client:
            assert client.get(f"/api/v1/checklist-versions/{old['version_id']}").json() == old
            listed = client.get("/api/v1/checklists").json()
            assert listed["total"] == 1
            latest = client.get(
                f"/api/v1/checklist-versions/{listed['items'][0]['latest_version_id']}"
            ).json()
            assert latest["version_id"] != old["version_id"]
            assert latest["semantic_hash"] == old["semantic_hash"]
            assert len(latest["sections"]) == 4
            versions = client.get(f"/api/v1/checklists/{old['checklist_id']}/versions").json()
            assert versions["total"] == 2


def test_artifact_missing_a_criterion_fails_instead_of_becoming_partial(tmp_path):
    class DropsCriterion(ScriptedEvaluator):
        async def __call__(self, conversation, checklist, profile, corpus, budget, observer):
            artifact = await super().__call__(
                conversation, checklist, profile, corpus, budget, observer
            )
            kept = artifact.automatic_final[:1]
            return artifact.model_copy(update={"initial": kept, "automatic_final": kept})

    app = create_app(make_settings(tmp_path), evaluator=DropsCriterion())
    with TestClient(app) as client:
        job = evaluate(client, criterion("c1"), criterion("c2"))
        assert job["state"] == "failed"
        assert job["error"]["code"] == "validation_error"
        assert job["evaluation_id"] is None
        assert client.get("/api/v1/evaluations").json()["total"] == 0


def test_decisions_can_complete_effective_while_automatic_stays_partial(tmp_path):
    settings = make_settings(tmp_path, test_scenario="partial")
    with TestClient(create_app(settings)) as client:
        job = evaluate(client)
        evaluation_id = job["evaluation_id"]
        before = client.get(f"/api/v1/evaluations/{evaluation_id}").json()
        assert before["artifact"]["status"] == "partial"
        assert before["automatic_score"]["total_score"] is None
        assert before["effective_score"]["status"] == "incomplete_evaluation"

        appeal = client.post(
            f"/api/v1/evaluations/{evaluation_id}/appeals",
            json={"criterion_id": "c1", "comment": "Комментарий", "expected_revision": 1},
        ).json()
        confirmed = client.post(
            f"/api/v1/appeals/{appeal['id']}/decision",
            json={"expected_revision": 1, "decision": "confirmed", "reason": "Причина"},
        )
        assert confirmed.status_code == 200
        middle = client.get(f"/api/v1/evaluations/{evaluation_id}").json()
        assert middle["effective_score"]["status"] == "incomplete_evaluation"

        second = client.post(
            f"/api/v1/evaluations/{evaluation_id}/appeals",
            json={"criterion_id": "c1", "comment": "Комментарий", "expected_revision": 2},
        ).json()
        changed = client.post(
            f"/api/v1/appeals/{second['id']}/decision",
            json={
                "expected_revision": 2,
                "decision": "changed",
                "reason": "Причина",
                "replacement": {
                    "criterion_id": "c1",
                    "applicability": "applicable",
                    "answer_choice_id": "yes",
                    "rationale": "Обоснование",
                    "reason_codes": ["human_changed"],
                    "evidence": [
                        {
                            "kind": "message",
                            "message_ids": ["m0002"],
                            "relation": "support",
                            "explanation": "Пояснение",
                        }
                    ],
                    "origin": "human",
                },
            },
        )
        assert changed.status_code == 200, changed.text
        final = client.get(f"/api/v1/evaluations/{evaluation_id}").json()
        assert final["effective_score"]["status"] == "complete"
        assert final["effective_score"]["total_score"] is not None
        assert final["artifact"] == before["artifact"]
        assert final["automatic_score"]["total_score"] is None
        automatic = client.get(f"/api/v1/evaluations/{evaluation_id}/export").json()["items"][0]
        effective = client.get(
            f"/api/v1/evaluations/{evaluation_id}/export", params={"scope": "effective"}
        ).json()["items"][0]
        assert automatic["total_score"] is None
        assert effective["total_score"] == final["effective_score"]["total_score"]


def test_weight_only_change_keeps_semantic_hash_under_real_hashing(tmp_path):
    with TestClient(create_app(make_settings(tmp_path))) as client:
        first = create_checklist(client, criterion("c1", weight="10"))
        second = create_checklist(client, criterion("c1", weight="25"))
        assert first["semantic_hash"] == second["semantic_hash"]
        assert first["scoring_config_hash"] != second["scoring_config_hash"]
