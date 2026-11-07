"""Resumable preparation/evaluation and validated, atomic official submission."""

import argparse
import hashlib
import json
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
from cqa_api.errors import ApiFailure
from cqa_api.organizer import adapt_organizer_payload
from cqa_contracts.http_models import EvaluationBatch, ImportResult
from cqa_contracts.interfaces import ContractError
from cqa_contracts.models import ChecklistVersion, Conversation
from cqa_contracts.submission import (
    OfficialResults,
    SubmissionAttempt,
    SubmissionConfig,
    SubmissionEntry,
    SubmissionManifest,
    SubmissionRun,
)
from cqa_domain import sectioned_original_checklist_draft
from pydantic import ValidationError

from .adapter import (
    PreparationError,
    atomic_write,
    build_results,
    check_conversation,
    check_rubric,
    digest,
    json_bytes,
    load_json,
    turn_hash,
    validate_results,
    write_results,
)
from .repository import check_run, execution_digest, read_items


def api(client: httpx.Client, method: str, path: str, **kwargs: Any) -> Any:
    response = client.request(method, path, **kwargs)
    if not response.is_success:
        raise PreparationError(f"api_http_{response.status_code}")
    return response.json()


def initialize(args: argparse.Namespace) -> None:
    """Pin a separate immutable official rubric; never pick a user's latest version."""
    with httpx.Client(base_url=args.api.rstrip("/") + "/api/v1/", timeout=60) as client:
        if args.config.exists():
            config = SubmissionConfig.model_validate(load_json(args.config))
            if (
                config.team_name,
                config.submission_branch,
                config.profile_id,
                config.profile_version,
            ) != (
                args.team_name,
                args.branch,
                args.profile_id,
                args.profile_version,
            ):
                raise PreparationError("existing_submission_config_differs_use_another_path")
            checklist = ChecklistVersion.model_validate(
                api(client, "GET", f"checklist-versions/{config.checklist_version_id}")
            )
        else:
            draft = sectioned_original_checklist_draft().model_copy(
                update={
                    "title": "CQA — официальный чек-лист сдачи 1.0",
                }
            )
            checklist = ChecklistVersion.model_validate(
                api(client, "POST", "checklists", json=draft.model_dump(mode="json"))
            )
            config = SubmissionConfig(
                team_name=args.team_name,
                submission_branch=args.branch,
                checklist_version_id=checklist.version_id,
                profile_id=args.profile_id,
                profile_version=args.profile_version,
            )
        check_rubric(checklist, config.checklist_version_id)
    atomic_write(args.config, json_bytes(config.model_dump(mode="json")))
    print(
        json.dumps(
            {
                "configured": True,
                "checklist_version_id": config.checklist_version_id,
                "team_name": config.team_name,
                "submission_branch": config.submission_branch,
            }
        )
    )


def import_dataset(args: argparse.Namespace) -> None:
    source = load_json(args.source)
    adapted = adapt_organizer_payload(json_bytes(source), 1000)
    originals = source["data"]["records"]
    ids = [r.get("conversation_id") for r in originals]
    if any(not isinstance(i, str) or not i for i in ids) or len(ids) != len(set(ids)):
        raise PreparationError("source_conversation_ids_not_unique_strings")
    if ids != [a.record.external_id for a in adapted]:
        raise PreparationError("ambiguous_original_id_mapping")
    # Validate coverage BEFORE the API mutates anything.
    proposed = SubmissionManifest(
        dataset=args.dataset,
        source_sha256=digest(source),
        entries=[
            SubmissionEntry(
                external_id=a.record.external_id,
                channel=a.record.channel,
                language=a.record.language,
                turn_hashes=[
                    turn_hash(m.speaker, m.text, m.timestamp_original) for m in a.record.messages
                ],
                conversation_id=f"not-imported-{a.index}",
                revision=1,
            )
            for a in adapted
        ],
    )
    if args.manifest.exists():
        old = SubmissionManifest.model_validate(load_json(args.manifest))
        if old.dataset != proposed.dataset or old.source_sha256 != proposed.source_sha256:
            raise PreparationError("existing_manifest_belongs_to_different_source")
    with httpx.Client(base_url=args.api.rstrip("/") + "/api/v1/", timeout=60) as client:
        imported = ImportResult.model_validate(
            api(
                client,
                "POST",
                "imports",
                json={
                    "source": "json",
                    "records": [a.record.model_dump(mode="json") for a in adapted],
                },
            )
        )
        if imported.received_count != len(ids) or imported.deduplicated_count:
            raise PreparationError("import_receipt_count_mismatch")
        indexed = {index: item for item in imported.items for index in item.source_indices}
        if set(indexed) != set(range(len(ids))):
            raise PreparationError("import_receipt_source_indices_mismatch")
        manifest = proposed.model_copy(
            update={
                "entries": [
                    e.model_copy(
                        update={
                            "conversation_id": indexed[i].conversation_id,
                            "revision": indexed[i].revision,
                        }
                    )
                    for i, e in enumerate(proposed.entries)
                ]
            }
        )
        manifest = SubmissionManifest.model_validate(manifest.model_dump(mode="json"))
        for entry in manifest.entries:
            conversation = Conversation.model_validate(
                api(
                    client,
                    "GET",
                    f"conversations/{entry.conversation_id}",
                    params={"revision": entry.revision},
                )
            )
            check_conversation(entry, conversation)
    atomic_write(args.manifest, json_bytes(manifest.model_dump(mode="json")))
    print(
        json.dumps(
            {
                "dataset": manifest.dataset,
                "imported": len(ids),
                "manifest": str(args.manifest),
                "ai_calls": 0,
            },
            ensure_ascii=False,
        )
    )


def evaluate(
    args: argparse.Namespace,
    manifest: SubmissionManifest,
    config: SubmissionConfig,
    *,
    only_ids: set[str] | None = None,
) -> None:
    if only_ids is not None and not only_ids <= {e.external_id for e in manifest.entries}:
        raise PreparationError("selection_contains_unknown_original_ids")
    if args.run.exists():
        receipt = SubmissionRun.model_validate(load_json(args.run))
        check_run(receipt, manifest, config)
    else:
        receipt = SubmissionRun(
            manifest_sha256=digest(manifest.model_dump(mode="json")),
            config_sha256=execution_digest(config),
            attempts=[
                SubmissionAttempt(
                    external_id=e.external_id, idempotency_key=f"submission-{uuid4().hex}"
                )
                for e in manifest.entries
            ],
        )
        atomic_write(args.run, json_bytes(receipt.model_dump(mode="json")))
    deadline = time.monotonic() + args.timeout_seconds
    with httpx.Client(base_url=args.api.rstrip("/") + "/api/v1/", timeout=60) as client:
        health = api(client, "GET", "health")
        if health["evaluator_mode"] != "production":
            raise PreparationError("submission_requires_production_api")
        checklist = ChecklistVersion.model_validate(
            api(client, "GET", f"checklist-versions/{config.checklist_version_id}")
        )
        check_rubric(checklist, config.checklist_version_id)
        profiles = api(client, "GET", "evaluator-profiles", params={"limit": 200})["items"]
        selected = [
            p
            for p in profiles
            if p["profile"]["id"] == config.profile_id
            and p["profile"]["version"] == config.profile_version
            and p["profile"]["mode"] == "production"
            and p["configured"]
        ]
        if len(selected) != 1:
            raise PreparationError("configured_production_profile_not_found")
        consecutive_failures = 0
        for index, (entry, attempt) in enumerate(
            zip(manifest.entries, receipt.attempts, strict=True)
        ):
            if only_ids is not None and entry.external_id not in only_ids:
                continue
            if time.monotonic() >= deadline:
                raise PreparationError("evaluation_wait_deadline_reached_resume_same_run")
            conversation = Conversation.model_validate(
                api(client, "GET", f"conversations/{entry.conversation_id}")
            )
            check_conversation(entry, conversation)
            already_recorded = attempt.batch_id is not None
            if attempt.batch_id is None:
                batch = EvaluationBatch.model_validate(
                    api(
                        client,
                        "POST",
                        "evaluation-batches",
                        headers={"Idempotency-Key": attempt.idempotency_key},
                        json={
                            "conversation_ids": [entry.conversation_id],
                            "checklist_version_id": config.checklist_version_id,
                            "profile_id": config.profile_id,
                            "mode": "fresh",
                        },
                    )
                )
                attempt = attempt.model_copy(update={"batch_id": batch.id})
                updated = list(receipt.attempts)
                updated[index] = attempt
                receipt = receipt.model_copy(update={"attempts": updated})
                atomic_write(args.run, json_bytes(receipt.model_dump(mode="json")))
            else:
                batch = EvaluationBatch.model_validate(
                    api(client, "GET", f"evaluation-batches/{attempt.batch_id}")
                )
            if (
                batch.profile_version != config.profile_version
                or len(batch.jobs) != 1
                or batch.jobs[0].conversation_revision != entry.revision
                or batch.jobs[0].conversation_id != entry.conversation_id
            ):
                raise PreparationError("created_batch_does_not_match_pinned_input")
            while batch.jobs[0].state not in {"succeeded", "failed", "cancelled"}:
                if time.monotonic() >= deadline:
                    raise PreparationError("evaluation_wait_deadline_reached_resume_same_run")
                time.sleep(args.poll_seconds)
                batch = EvaluationBatch.model_validate(
                    api(client, "GET", f"evaluation-batches/{attempt.batch_id}")
                )
            job = batch.jobs[0]
            print(
                json.dumps(
                    {
                        "completed": index + 1,
                        "total": len(manifest.entries),
                        "state": job.state,
                        "evaluation_id": job.evaluation_id,
                    }
                ),
                flush=True,
            )
            if job.state == "failed" and not args.continue_on_failure:
                raise PreparationError("provider_job_failed_run_saved_no_more_calls_scheduled")
            if not already_recorded:
                consecutive_failures = consecutive_failures + 1 if job.state == "failed" else 0
            if consecutive_failures >= args.max_consecutive_failures:
                raise PreparationError(
                    "consecutive_provider_failures_run_saved_stop_and_check_provider"
                )
            if not already_recorded and index + 1 < len(manifest.entries):
                time.sleep(args.interval_seconds)


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    init = commands.add_parser("init", help="Pin a separate original rubric and agreed team/branch")
    init.add_argument("--team-name", required=True)
    init.add_argument("--branch", required=True)
    init.add_argument("--profile-id", required=True)
    init.add_argument("--profile-version", required=True)
    init.add_argument("--config", type=Path, required=True)
    init.add_argument("--api", default="http://127.0.0.1:8000")
    imp = commands.add_parser(
        "import", help="Import a supplied organizer JSON; never discover PROD"
    )
    imp.add_argument("--source", type=Path, required=True)
    imp.add_argument("--dataset", choices=["dev", "prod"], required=True)
    imp.add_argument("--manifest", type=Path, required=True)
    imp.add_argument("--api", default="http://127.0.0.1:8000")
    for name in ("evaluate", "export", "validate"):
        sub = commands.add_parser(name)
        sub.add_argument("--manifest", type=Path, required=True)
        sub.add_argument("--config", type=Path, required=name != "validate")
        sub.add_argument("--run", type=Path, required=name != "validate")
        if name == "evaluate":
            sub.add_argument("--api", default="http://127.0.0.1:8000")
            sub.add_argument("--timeout-seconds", type=float, default=3600)
            sub.add_argument("--poll-seconds", type=float, default=1)
            sub.add_argument("--interval-seconds", type=float, default=6)
            sub.add_argument("--continue-on-failure", action="store_true")
            sub.add_argument("--max-consecutive-failures", type=int, default=3)
        else:
            sub.add_argument("--database", type=Path, required=name == "export")
            sub.add_argument("--allow-unfinished", action="store_true")
            if name == "export":
                sub.add_argument("--output", type=Path, required=True)
                sub.add_argument("--reviewed-sha256")
            else:
                sub.add_argument("--file", type=Path, required=True)
    return root


def main() -> None:
    args = parser().parse_args()
    try:
        if args.command == "init":
            initialize(args)
            return
        if args.command == "import":
            import_dataset(args)
            return
        manifest = SubmissionManifest.model_validate(load_json(args.manifest))
        config = SubmissionConfig.model_validate(load_json(args.config)) if args.config else None
        if args.command == "evaluate":
            assert config is not None
            if (
                min(args.timeout_seconds, args.poll_seconds) <= 0
                or args.interval_seconds < 0
                or args.max_consecutive_failures < 1
            ):
                raise PreparationError("timing_arguments_must_be_positive")
            evaluate(args, manifest, config)
            return
        if args.command == "export" or args.database is not None:
            if config is None or args.run is None:
                raise PreparationError("provenance_validation_requires_config_run_database")
            receipt = SubmissionRun.model_validate(load_json(args.run))
            items = read_items(args.database, manifest, config, receipt)
            expected = build_results(
                items, config, manifest, allow_unfinished=args.allow_unfinished
            )
        else:
            expected = None
        if args.command == "export":
            assert expected is not None
            result = expected
            sha = write_results(args.output, result, manifest, reviewed_sha256=args.reviewed_sha256)
        else:
            result = OfficialResults.model_validate(load_json(args.file))
            validate_results(result, manifest)
            if expected is not None and result != expected:
                raise PreparationError("file_does_not_match_saved_automatic_evaluations")
            sha = hashlib.sha256(args.file.read_bytes()).hexdigest()
        print(
            json.dumps(
                {
                    "dataset": manifest.dataset,
                    "total": len(result.results),
                    "ok": sum(r.status == "ok" for r in result.results),
                    "error": sum(r.status == "error" for r in result.results),
                    "sha256": sha,
                    "saved_provenance_checked": expected is not None,
                },
                ensure_ascii=False,
            )
        )
    except (
        PreparationError,
        ValidationError,
        ContractError,
        ApiFailure,
        OSError,
        httpx.HTTPError,
        ValueError,
        KeyError,
        StopIteration,
    ) as exc:
        message = str(exc) if isinstance(exc, PreparationError) else type(exc).__name__
        # Pydantic/HTTP exceptions may contain full transcripts, paths or URLs.
        print(json.dumps({"exported": False, "error": message}, ensure_ascii=False))
        raise SystemExit(2) from None
