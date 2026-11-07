"""Resuming a receipt never silently repeats completed provider work."""

import argparse

import pytest
from cqa_contracts.submission import SubmissionAttempt, SubmissionRun
from cqa_submission.adapter import PreparationError, atomic_write, digest, json_bytes, load_json
from cqa_submission.cli import evaluate
from cqa_submission.repository import execution_digest
from test_submission import CONFIG, NOW, dataset


def test_resume_skips_old_batches_and_stops_after_three_new_failures(tmp_path, monkeypatch):
    items, manifest = dataset()
    attempts = [
        SubmissionAttempt(
            external_id=e.external_id,
            idempotency_key=f"key-{i}",
            batch_id=f"batch-{i}" if i < 3 else None,
        )
        for i, e in enumerate(manifest.entries)
    ]
    receipt = SubmissionRun(
        manifest_sha256=digest(manifest.model_dump(mode="json")),
        config_sha256=execution_digest(CONFIG),
        attempts=attempts,
    )
    run = tmp_path / "run.json"
    atomic_write(run, json_bytes(receipt.model_dump(mode="json")))
    posted = []

    def fake_api(client, method, path, **kwargs):
        if path == "health":
            return {"evaluator_mode": "production"}
        if path.startswith("checklist-versions/"):
            return items[0].checklist.model_dump(mode="json")
        if path == "evaluator-profiles":
            return {
                "items": [{"configured": True, "profile": items[0].profile.model_dump(mode="json")}]
            }
        if path.startswith("conversations/"):
            return next(
                i.conversation.model_dump(mode="json")
                for i in items
                if path.endswith(i.conversation.id)
            )
        if method == "POST":
            key = kwargs["headers"]["Idempotency-Key"]
            posted.append(key)
            index = int(key.split("-")[-1])
        else:
            index = int(path.rsplit("-", 1)[1])
        return {
            "id": f"batch-{index}",
            "checklist_version_id": CONFIG.checklist_version_id,
            "profile_id": CONFIG.profile_id,
            "profile_version": "1",
            "corpus_snapshot_id": items[0].corpus.id,
            "mode": "fresh",
            "created_at": NOW,
            "progress": {
                "total": 1,
                "queued": 0,
                "running": 0,
                "retry_wait": 0,
                "succeeded": 0,
                "failed": 1,
                "cancelled": 0,
            },
            "jobs": [
                {
                    "id": f"job-{index}",
                    "batch_id": f"batch-{index}",
                    "conversation_id": items[index].conversation.id,
                    "conversation_revision": 1,
                    "state": "failed",
                    "attempts": [],
                    "max_attempts": 1,
                    "next_attempt_at": None,
                    "attempt_id": None,
                    "lease_id": None,
                    "lease_expires_at": None,
                    "budget": None,
                    "progress": {"stage": "done", "completed_calls": 0},
                    "evaluation_id": None,
                    "error": None,
                }
            ],
        }

    monkeypatch.setattr("cqa_submission.cli.api", fake_api)
    monkeypatch.setattr("cqa_submission.cli.time.sleep", lambda seconds: None)
    args = argparse.Namespace(
        run=run,
        api="http://unused",
        timeout_seconds=30,
        poll_seconds=1,
        interval_seconds=0,
        continue_on_failure=True,
        max_consecutive_failures=3,
    )
    with pytest.raises(PreparationError, match="consecutive_provider_failures"):
        evaluate(args, manifest, CONFIG)
    assert posted == ["key-3", "key-4", "key-5"]
    stored = SubmissionRun.model_validate(load_json(run))
    assert [a.batch_id is not None for a in stored.attempts] == [True] * 6 + [False] * 4
    posted.clear()
    with pytest.raises(PreparationError, match="consecutive_provider_failures"):
        evaluate(args, manifest, CONFIG)
    assert posted == ["key-6", "key-7", "key-8"]
