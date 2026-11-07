"""Reuse rules, migrations, production gating and the profile registry."""

import json
import sqlite3

import cqa_ai
import pytest
from conftest import (
    ROOT,
    chat_record,
    checklist_draft,
    create_batch,
    create_checklist,
    criterion,
    drain,
    import_records,
    make_settings,
)
from cqa_api.db import Database
from cqa_api.main import create_app
from cqa_api.services import build_services
from cqa_api.settings import Settings
from cqa_api.testmode import build_test_domain, synthetic_profile
from cqa_contracts.interfaces import ConfigurationError
from cqa_contracts.models import CorpusSnapshot
from fastapi.testclient import TestClient
from helpers import ScriptedEvaluator, SpyDomain, add_profile

KEYS = ("GEMINI_API_KEY", "DEEPSEEK_API_KEY", "OPENROUTER_API_KEY")


def evaluated(client, conversation_id, version_id, key, mode):
    response = create_batch(client, [conversation_id], version_id, key=key, mode=mode)
    assert response.status_code == 202, response.text
    drain(client)
    job = client.get(f"/api/v1/jobs/{response.json()['jobs'][0]['id']}").json()
    assert job["state"] == "succeeded", job
    return client.get(f"/api/v1/evaluations/{job['evaluation_id']}").json()


@pytest.fixture
def reuse_env(client_factory, tmp_path):
    spy = SpyDomain()
    evaluator = ScriptedEvaluator()
    client = client_factory(make_settings(tmp_path), domain=spy.port, evaluator=evaluator)
    conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
    version = create_checklist(client)
    first = evaluated(client, conversation_id, version["version_id"], "first", "fresh")
    assert evaluator.calls == 1
    return client, spy, evaluator, conversation_id, version, first


def new_version(client, version, *criteria):
    response = client.post(
        f"/api/v1/checklists/{version['checklist_id']}/versions",
        json={
            "expected_latest_version_id": version["version_id"],
            "config": checklist_draft(*criteria),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_weight_change_reuses_without_ai_and_calls_score_with_new_config(reuse_env):
    client, spy, evaluator, conversation_id, version, first = reuse_env
    reweighted = new_version(client, version, criterion("c1", weight="55"))
    assert reweighted["semantic_hash"] == version["semantic_hash"]
    assert reweighted["scoring_config_hash"] != version["scoring_config_hash"]
    scores_before = len(spy.score_calls)

    second = evaluated(
        client, conversation_id, reweighted["version_id"], "second", "reuse_if_compatible"
    )
    assert evaluator.calls == 1  # no new AI call
    assert len(spy.score_calls) == scores_before + 1
    assert spy.score_calls[-1][0].version_id == reweighted["version_id"]
    assert second["id"] != first["id"]
    assert second["reuse"]["mode"] == "reuse_if_compatible"
    assert second["reuse"]["reused_from_evaluation_id"] == first["id"]
    assert second["reuse"]["reuse_key"] == first["reuse"]["reuse_key"]
    assert second["artifact"] == first["artifact"]
    assert second["checklist_version_id"] == reweighted["version_id"]
    # The reusing job spent nothing of its own.
    with client.app.state.services.db.read() as conn:
        from cqa_api.db import row

        reused_calls = row(
            conn,
            "SELECT COUNT(*) AS n FROM provider_calls WHERE job_id = "
            "(SELECT job_id FROM evaluations WHERE id = :id)",
            {"id": second["id"]},
        )
    assert reused_calls["n"] == 0


def test_fresh_always_calls_the_evaluator(reuse_env):
    client, _, evaluator, conversation_id, version, first = reuse_env
    again = evaluated(client, conversation_id, version["version_id"], "again", "fresh")
    assert evaluator.calls == 2
    assert again["reuse"]["reused_from_evaluation_id"] is None
    assert again["id"] != first["id"]


def test_semantic_change_prevents_reuse(reuse_env):
    client, _, evaluator, conversation_id, version, _ = reuse_env
    renamed = new_version(client, version, criterion("c1", definition="Другое определение"))
    assert renamed["semantic_hash"] != version["semantic_hash"]
    result = evaluated(client, conversation_id, renamed["version_id"], "s", "reuse_if_compatible")
    assert evaluator.calls == 2
    assert result["reuse"]["reused_from_evaluation_id"] is None


def test_new_text_prevents_reuse_new_external_name_does_not(reuse_env):
    client, _, evaluator, conversation_id, version, first = reuse_env
    # The same text under a different external name is the same content hash.
    other = import_records(client, chat_record("renamed-record"))["items"][0]
    reused = evaluated(
        client, other["conversation_id"], version["version_id"], "name", "reuse_if_compatible"
    )
    assert evaluator.calls == 1
    assert reused["reuse"]["reused_from_evaluation_id"] == first["id"]

    changed = chat_record()
    changed["messages"][1]["text"] = "Изменённый ответ"
    assert import_records(client, changed)["items"][0]["revision"] == 2
    fresh = evaluated(client, conversation_id, version["version_id"], "text", "reuse_if_compatible")
    assert evaluator.calls == 2
    assert fresh["conversation_revision"] == 2
    assert fresh["reuse"]["reused_from_evaluation_id"] is None


def test_profile_change_prevents_reuse(reuse_env):
    client, _, evaluator, conversation_id, version, _ = reuse_env
    add_profile(client, max_provider_calls=4)
    result = evaluated(
        client, conversation_id, version["version_id"], "profile", "reuse_if_compatible"
    )
    assert evaluator.calls == 2
    assert result["profile_version"] == "v2"
    assert result["reuse"]["reused_from_evaluation_id"] is None


def test_corpus_change_prevents_reuse(reuse_env):
    from cqa_api.registry import register_corpus, register_profile

    client, _, evaluator, conversation_id, version, _ = reuse_env
    services = client.app.state.services
    corpus = CorpusSnapshot(
        id="another-corpus",
        content_hash="0" * 64,
        sources=[],
        chunks=[],
        applicability_policy="Другая политика",
        priority_policy="Другая политика",
    )
    corpus = corpus.model_copy(
        update={"content_hash": services.domain.corpus_snapshot_hash(corpus)}
    )
    profile = synthetic_profile().model_copy(
        update={"version": "corpus-2", "corpus_snapshot_id": corpus.id}
    )
    with services.db.write() as conn:
        register_corpus(conn, services, corpus)
        register_profile(conn, services, profile)
    result = evaluated(
        client, conversation_id, version["version_id"], "corpus", "reuse_if_compatible"
    )
    assert evaluator.calls == 2
    assert result["corpus_snapshot_id"] == corpus.id


def test_failed_and_partial_rules_for_reuse(client_factory, tmp_path):
    client = client_factory(make_settings(tmp_path, test_scenario="failed"))
    conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
    version = create_checklist(client)
    create_batch(client, [conversation_id], version["version_id"], key="a")
    drain(client)
    # A failed artifact is not reuse material: the next run evaluates again and fails again.
    create_batch(client, [conversation_id], version["version_id"], key="b", mode="reuse_if_compatible")
    drain(client)
    listed = client.get("/api/v1/evaluations").json()
    assert listed["total"] == 2
    assert all(e["reuse"]["reused_from_evaluation_id"] is None for e in listed["items"])


def test_incompatible_cached_artifact_falls_back_to_a_fresh_call(reuse_env):
    from cqa_contracts.interfaces import DomainValidationError
    from helpers import contract_error

    client, spy, evaluator, conversation_id, version, _ = reuse_env
    calls = {"n": 0}
    original = spy.validation_error

    def fail_once(*args):
        calls["n"] += 1
        if calls["n"] == 1:
            raise contract_error(DomainValidationError, "validation_error", False)

    import dataclasses

    services = client.app.state.services
    services.domain = dataclasses.replace(services.domain, validate_artifact=fail_once)
    result = evaluated(client, conversation_id, version["version_id"], "x", "reuse_if_compatible")
    assert evaluator.calls == 2
    assert result["reuse"]["reused_from_evaluation_id"] is None
    assert original is None


# --- Migrations ---------------------------------------------------------------------


def test_empty_database_migrates_to_head(tmp_path):
    db = Database(
        f"sqlite:///{(tmp_path / 'fresh.sqlite3').as_posix()}",
        busy_timeout_ms=1000,
        synchronous="FULL",
    )
    assert db.current_revision() is None
    db.migrate()
    assert db.current_revision() is not None
    db.migrate()  # idempotent
    with db.read() as conn:
        assert conn.exec_driver_sql("PRAGMA journal_mode").scalar() == "wal"
        assert conn.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
        assert conn.exec_driver_sql("PRAGMA synchronous").scalar() == 2  # FULL
        assert conn.exec_driver_sql("PRAGMA busy_timeout").scalar() == 1000
    db.dispose()


def _populate_v1(path):
    connection = sqlite3.connect(path)
    connection.execute("PRAGMA foreign_keys=ON")
    now = "2026-11-07T00:00:00.000000Z"
    hash_value = "a" * 64
    statements = [
        ("INSERT INTO conversations (id, external_id, latest_revision, created_at) "
         "VALUES ('c', 'e', 1, ?)", (now,)),
        ("INSERT INTO conversation_revisions VALUES ('c', 1, ?, 'agent_chat', 'RU', '{}', NULL, ?)",
         (hash_value, now)),
        ("INSERT INTO checklists (id, created_at) VALUES ('cl', ?)", (now,)),
        ("INSERT INTO checklist_versions (version_id, checklist_id, title, semantic_hash, "
         "scoring_config_hash, document_json, created_at) VALUES ('v', 'cl', 't', ?, ?, '{}', ?)",
         (hash_value, hash_value, now)),
        ("INSERT INTO corpus_snapshots VALUES ('corp', ?, '{}', ?)", (hash_value, now)),
        ("INSERT INTO evaluator_profiles (profile_id, version, corpus_snapshot_id, profile_hash, "
         "document_json, registered_at) VALUES ('p', '1', 'corp', ?, '{}', ?)", (hash_value, now)),
        ("INSERT INTO jobs (id, conversation_id, conversation_revision, checklist_version_id, "
         "profile_id, profile_version, corpus_snapshot_id, mode, state, max_attempts, stage, "
         "created_at, updated_at) VALUES ('j', 'c', 1, 'v', 'p', '1', 'corp', 'fresh', "
         "'succeeded', 3, 'done', ?, ?)", (now, now)),
        ("INSERT INTO job_attempts (attempt_id, job_id, number, lease_id, started_at, state) "
         "VALUES ('a', 'j', 1, 'l', ?, 'succeeded')", (now,)),
        ("INSERT INTO evaluations (id, job_id, conversation_id, conversation_revision, "
         "checklist_version_id, profile_id, profile_version, corpus_snapshot_id, status, revision, "
         "artifact_json, automatic_score_json, effective_proposals_json, effective_score_json, "
         "reuse_mode, reuse_key, created_at) VALUES ('ev', 'j', 'c', 1, 'v', 'p', '1', 'corp', "
         "'complete', 1, 'ARTIFACT', 'SCORE', '[]', 'SCORE', 'fresh', ?, ?)", (hash_value, now)),
    ]
    for sql, params in statements:
        connection.execute(sql, params)
    connection.commit()
    connection.close()


def test_previous_schema_upgrades_without_losing_data(tmp_path):
    path = tmp_path / "old.sqlite3"
    db = Database(f"sqlite:///{path.as_posix()}", busy_timeout_ms=1000, synchronous="FULL")
    db.migrate("0001")
    assert db.current_revision() == "0001"
    db.dispose()
    _populate_v1(path)

    db = Database(f"sqlite:///{path.as_posix()}", busy_timeout_ms=1000, synchronous="FULL")
    db.migrate()
    with db.read() as conn:
        evaluation = conn.exec_driver_sql(
            "SELECT artifact_json, reuse_mode, seq FROM evaluations WHERE id = 'ev'"
        ).one()
        assert evaluation[0] == "ARTIFACT"
        assert evaluation[1] == "fresh"
        assert conn.exec_driver_sql("SELECT state FROM jobs WHERE id = 'j'").scalar() == "succeeded"
    # The immutability guard and the one-result rule survive the table rebuild.
    with pytest.raises(Exception, match="immutable"), db.write() as conn:
        conn.exec_driver_sql("UPDATE evaluations SET artifact_json = 'x'")
    db.dispose()


# --- Production gating --------------------------------------------------------------


def production_profile_json() -> str:
    data = synthetic_profile().model_dump(mode="json")
    data.update(
        {
            "id": "prod",
            "mode": "production",
            "primary": {
                "provider": "gemini",
                "model": "explicit-unconfigured-model",
                "configuration_ref": "GEMINI_API_KEY",
            },
        }
    )
    return json.dumps(data)


def production_settings(tmp_path, domain_port):
    corpus_dir = tmp_path / "config" / "corpora"
    profile_dir = tmp_path / "config" / "profiles"
    corpus_dir.mkdir(parents=True)
    profile_dir.mkdir(parents=True)
    corpus = CorpusSnapshot(
        id="test-empty-corpus",
        content_hash="0" * 64,
        sources=[],
        chunks=[],
        applicability_policy="Синтетическая политика",
        priority_policy="Синтетическая политика",
    )
    corpus = corpus.model_copy(
        update={"content_hash": domain_port.corpus_snapshot_hash(corpus)}
    )
    (corpus_dir / "corpus.json").write_text(corpus.model_dump_json(), encoding="utf-8")
    (profile_dir / "prod.json").write_text(production_profile_json(), encoding="utf-8")
    return make_settings(tmp_path, mode="production", evaluator="production")


def test_mixed_mode_refuses_to_start(tmp_path):
    with pytest.raises(ConfigurationError):
        build_services(make_settings(tmp_path, mode="production", evaluator="test"))
    with pytest.raises(ConfigurationError):
        build_services(make_settings(tmp_path, mode="test", evaluator="production"))


def test_production_binds_the_real_evaluator_not_the_synthetic(tmp_path):
    services = build_services(make_settings(tmp_path, mode="production", evaluator="production"))
    assert services.evaluator is cqa_ai.evaluate
    services.db.dispose()


def test_no_keys_means_unconfigured_profile_and_explicit_refusal(tmp_path, monkeypatch):
    for key in KEYS:
        monkeypatch.delenv(key, raising=False)
    domain = build_test_domain()
    settings = production_settings(tmp_path, domain)
    with TestClient(create_app(settings, domain=domain)) as client:
        assert client.get("/api/v1/health").json()["business_ready"] is False
        listed = client.get("/api/v1/evaluator-profiles").json()
        assert listed["items"][0]["configured"] is False
        assert listed["items"][0]["configuration_error"]["code"] == "configuration_error"
        assert "test-synthetic" not in json.dumps(listed)
        conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
        version = create_checklist(client)
        refused = create_batch(client, [conversation_id], version["version_id"], profile_id="prod")
        assert refused.status_code == 503
        assert refused.json()["code"] == "configuration_error"
        # The synthetic profile does not exist in production: no fixture fallback.
        synthetic = create_batch(client, [conversation_id], version["version_id"], key="other")
        assert synthetic.status_code == 404
        with client.app.state.services.db.read() as conn:
            assert conn.exec_driver_sql("SELECT COUNT(*) FROM jobs").scalar() == 0


def test_key_removed_after_queueing_fails_the_job_without_fallback(tmp_path, monkeypatch):
    for key in KEYS:
        monkeypatch.delenv(key, raising=False)
    domain = build_test_domain()
    settings = production_settings(tmp_path, domain)
    with TestClient(create_app(settings, domain=domain)) as client:
        conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
        version = create_checklist(client)
        monkeypatch.setenv("GEMINI_API_KEY", "placeholder-for-the-gate")
        accepted = create_batch(client, [conversation_id], version["version_id"], profile_id="prod")
        assert accepted.status_code == 202
        assert "placeholder-for-the-gate" not in accepted.text
        monkeypatch.delenv("GEMINI_API_KEY")
        drain(client)  # the real cqa_ai.evaluate: its gate refuses before any network
        job = client.get(f"/api/v1/jobs/{accepted.json()['jobs'][0]['id']}").json()
        assert job["state"] == "failed"
        assert job["error"]["code"] == "configuration_error"
        assert client.get("/api/v1/evaluations").json()["total"] == 0


def test_unavailable_domain_in_production_is_explicit_not_silent(tmp_path, monkeypatch):
    import dataclasses

    def missing(*args):
        raise NotImplementedError("private detail")

    base = build_test_domain()
    settings = production_settings(tmp_path, base)
    port = dataclasses.replace(base, conversation_content_hash=missing)
    with TestClient(create_app(settings, domain=port)) as client:
        response = client.post(
            "/api/v1/imports", json={"source": "json", "records": [chat_record()]}
        )
        assert response.status_code == 503
        assert response.json()["code"] == "configuration_error"
        assert "private detail" not in response.text


def test_changed_registered_profile_version_is_refused(tmp_path, monkeypatch, caplog):
    for key in KEYS:
        monkeypatch.delenv(key, raising=False)
    domain = build_test_domain()
    settings = production_settings(tmp_path, domain)
    with TestClient(create_app(settings, domain=domain)):
        pass
    tampered = json.loads(production_profile_json())
    tampered["prompt_version"] = "changed"
    (tmp_path / "config/profiles/prod.json").write_text(json.dumps(tampered), encoding="utf-8")
    (tmp_path / "config/profiles/broken.json").write_text("{not json", encoding="utf-8")
    with TestClient(create_app(settings, domain=domain)) as client:
        listed = client.get("/api/v1/evaluator-profiles").json()
        assert listed["total"] == 1
        assert listed["items"][0]["profile"]["prompt_version"] == "synthetic-v1"
        errors = client.app.state.services.registry_errors
        assert any("prod.json" in e for e in errors)
        assert any("broken.json" in e for e in errors)


def test_test_mode_cannot_load_a_production_profile_file(tmp_path):
    domain = build_test_domain()
    production_settings(tmp_path, domain)
    settings = make_settings(tmp_path)
    with TestClient(create_app(settings)) as client:
        ids = [
            item["profile"]["id"] for item in client.get("/api/v1/evaluator-profiles").json()["items"]
        ]
        assert ids == ["test-synthetic"]


def test_knowledge_sources_expose_only_source_metadata(client_factory, tmp_path):
    corpus_text = (ROOT / "fixtures/contracts/corpus-synthetic.json").read_text(encoding="utf-8")
    corpus = CorpusSnapshot.model_validate_json(corpus_text)
    client = client_factory(make_settings(tmp_path))
    services = client.app.state.services
    corpus = corpus.model_copy(
        update={"content_hash": services.domain.corpus_snapshot_hash(corpus)}
    )
    from cqa_api.registry import register_corpus

    with services.db.write() as conn:
        register_corpus(conn, services, corpus)
    all_sources = client.get("/api/v1/knowledge-sources").json()
    assert all_sources["total"] == len(corpus.sources)
    assert corpus.chunks[0].text not in json.dumps(all_sources)
    empty = client.get(
        "/api/v1/knowledge-sources", params={"corpus_snapshot_id": "test-empty-corpus"}
    ).json()
    assert empty["total"] == 0
    assert (
        client.get("/api/v1/knowledge-sources", params={"corpus_snapshot_id": "absent"}).status_code
        == 404
    )


def test_settings_never_print_the_dataset_url(tmp_path):
    settings = make_settings(tmp_path, dataset_url="https://organizer.invalid/?token=SECRET")
    assert "SECRET" not in repr(settings)
    assert Settings.model_fields["dataset_url"].default is None
