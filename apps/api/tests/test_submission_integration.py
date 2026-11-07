"""Official CLI with the real local API/SQLite; synthetic data, no external AI."""

import argparse
import json
import sqlite3

import httpx
import pytest
from conftest import create_batch, drain, make_settings
from cqa_contracts.models import SafeExport
from cqa_contracts.submission import (
    SubmissionAttempt,
    SubmissionConfig,
    SubmissionManifest,
    SubmissionRun,
)
from cqa_submission.adapter import PreparationError, convert, digest, load_json
from cqa_submission.cli import import_dataset, initialize
from cqa_submission.repository import execution_digest, read_items


def test_import_turn_mapping_pinned_read_snapshot_and_safe_export_unchanged(
    client_factory,
    tmp_path,
    monkeypatch,
):
    client = client_factory(make_settings(tmp_path, seed_original_checklist=True))
    source = tmp_path / "synthetic-source.json"
    records = [
        {
            "conversation_id": f"original-{i}",
            "channel": "agent chat",
            "language": "RU",
            "transcript": [
                {"speaker": s, "text": f"Учебная реплика {n}", "timestamp": f"00:0{n}"}
                for n, s in enumerate(["client", "bot", "system", "operator"], 1)
            ],
        }
        for i in range(10)
    ]
    source.write_text(
        json.dumps({"isSuccess": True, "data": {"records": records}}), encoding="utf-8"
    )

    def transport(request):
        response = client.request(
            request.method,
            request.url.raw_path.decode(),
            content=request.content,
            headers={"Content-Type": "application/json"},
        )
        return httpx.Response(response.status_code, content=response.content, request=request)

    original_client = httpx.Client
    monkeypatch.setattr(
        "cqa_submission.cli.httpx.Client",
        lambda **kwargs: original_client(transport=httpx.MockTransport(transport), **kwargs),
    )
    manifest_path = tmp_path / "manifest.json"
    args = argparse.Namespace(
        source=source, dataset="prod", manifest=manifest_path, api="http://local"
    )
    import_dataset(args)
    manifest = SubmissionManifest.model_validate(load_json(manifest_path))
    assert [e.external_id for e in manifest.entries] == [r["conversation_id"] for r in records]
    assert all(len(e.turn_hashes) == 4 for e in manifest.entries)
    initial = manifest_path.read_bytes()
    import_dataset(args)  # repeat import is harmless and preserves exact pinned revision
    assert manifest_path.read_bytes() == initial

    profile = client.get("/api/v1/evaluator-profiles").json()["items"][0]["profile"]
    config_path = tmp_path / "config.json"
    init_args = argparse.Namespace(
        team_name="Synthetic integration",
        branch="main",
        profile_id=profile["id"],
        profile_version=profile["version"],
        config=config_path,
        api="http://local",
    )
    initialize(init_args)
    pinned_bytes = config_path.read_bytes()
    initialize(init_args)
    assert config_path.read_bytes() == pinned_bytes
    config = SubmissionConfig.model_validate(load_json(config_path))
    attempts = []
    for i, entry in enumerate(manifest.entries):
        batch_response = create_batch(
            client, [entry.conversation_id], config.checklist_version_id, key=f"submission-{i}"
        )
        assert batch_response.status_code == 202, batch_response.text
        batch = batch_response.json()
        attempts.append(
            SubmissionAttempt(
                external_id=entry.external_id,
                idempotency_key=f"submission-{i}",
                batch_id=batch["id"],
            )
        )
    drain(client)
    receipt = SubmissionRun(
        manifest_sha256=digest(manifest.model_dump(mode="json")),
        config_sha256=execution_digest(config),
        attempts=attempts,
    )
    database = tmp_path / "test.sqlite3"
    with sqlite3.connect(database) as sql:
        before = {
            t: sql.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            for t in ("provider_calls", "jobs", "evaluations", "decisions")
        }
    items = read_items(database, manifest, config, receipt)
    assert len(items) == 10 and all(i.state == "succeeded" for i in items)
    assert [m.source_index for m in items[0].conversation.messages] == [0, 1, 2, 3]
    # A test-mode evaluation must never become an official successful submission.
    with pytest.raises(PreparationError, match="test_profile"):
        convert(items[0], config)
    evaluation_id = items[0].evaluation.id
    safe = SafeExport.model_validate(
        client.get(f"/api/v1/evaluations/{evaluation_id}/export").json()
    )
    assert safe.scope == "automatic" and len(safe.items) == 1
    assert "rationale" not in safe.model_dump_json()
    # Read side recovers a batch accepted just before a receipt write was interrupted.
    interrupted = receipt.model_copy(
        update={"attempts": [a.model_copy(update={"batch_id": None}) for a in attempts]}
    )
    assert read_items(database, manifest, config, interrupted) == items
    with sqlite3.connect(database) as sql:
        after = {t: sql.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in before}
    assert before == after


def test_bad_source_count_is_rejected_before_api_request(tmp_path, monkeypatch):
    source = tmp_path / "bad.json"
    source.write_text(
        json.dumps(
            {
                "isSuccess": True,
                "data": {
                    "records": [
                        {
                            "conversation_id": "only-one",
                            "channel": "agent chat",
                            "language": "RU",
                            "transcript": [
                                {
                                    "speaker": "client",
                                    "timestamp": "00:01",
                                    "text": "Учебный вопрос",
                                }
                            ],
                        }
                    ]
                },
            }
        ),
        encoding="utf-8",
    )

    def unexpected(**kwargs):
        pytest.fail("Invalid source reached the HTTP client")

    monkeypatch.setattr("cqa_submission.cli.httpx.Client", unexpected)
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        import_dataset(
            argparse.Namespace(
                source=source,
                dataset="prod",
                manifest=tmp_path / "manifest.json",
                api="http://local",
            )
        )
    assert not (tmp_path / "manifest.json").exists()
