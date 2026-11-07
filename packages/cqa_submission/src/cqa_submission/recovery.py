"""Explicit control-chat recovery, retaining successful primary results and provenance.

No automatic provider switch, semantic retry, voting or edits to model answers.
Stop the primary CLI before using this module; queued/running jobs block recovery.
Both full receipts remain immutable in identity and resumable in their own profile.
"""

import argparse
import hashlib
import json
from dataclasses import replace
from pathlib import Path

import httpx
from cqa_api.errors import ApiFailure
from cqa_contracts.interfaces import ContractError
from cqa_contracts.submission import (
    OfficialResults,
    SubmissionConfig,
    SubmissionManifest,
    SubmissionRun,
)
from pydantic import ValidationError

from .adapter import (
    PreparationError,
    SavedItem,
    build_results,
    load_json,
    validate_results,
    write_results,
)
from .cli import evaluate
from .repository import read_items

ACTIVE = {"queued", "running", "retry_wait"}
RECOVERABLE = {"not_started", "failed", "cancelled"}


def recovery_ids(items: list[SavedItem], manifest: SubmissionManifest) -> set[str]:
    if manifest.dataset != "prod" or [i.entry for i in items] != manifest.entries:
        raise PreparationError("recovery_requires_full_control_chat_manifest")
    if any(i.state in ACTIVE for i in items):
        raise PreparationError("stop_primary_cli_and_wait_for_active_jobs")
    # succeeded+partial is semantic uncertainty, not a technical failure to retry.
    return {i.entry.external_id for i in items if i.state in RECOVERABLE}


def combine(
    primary: list[SavedItem],
    recovery: list[SavedItem],
    config: SubmissionConfig,
    recovery_config: SubmissionConfig,
    manifest: SubmissionManifest,
    *,
    allow_unfinished: bool = False,
) -> OfficialResults:
    eligible = recovery_ids(primary, manifest)
    if [i.entry for i in recovery] != manifest.entries:
        raise PreparationError("recovery_items_do_not_match_manifest")
    chosen, configs = [], []
    for first, second in zip(primary, recovery, strict=True):
        if first.entry.external_id not in eligible:
            if second.state != "not_started" or second.calls or second.evaluation is not None:
                raise PreparationError("recovery_attempt_for_protected_success_or_partial")
            chosen.append(first)
            configs.append(config)
        elif second.state != "not_started":
            # read_items already verified each artifact against its own persisted call log.
            # Include spent/failed primary calls in the model attribution, never requested aliases.
            chosen.append(replace(second, calls=[*first.calls, *second.calls]))
            configs.append(recovery_config)
        else:
            chosen.append(first)
            configs.append(config)
    return build_results(
        chosen, config, manifest, item_configs=configs, allow_unfinished=allow_unfinished
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["plan", "evaluate", "export", "validate"])
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--recovery-config", type=Path, required=True)
    parser.add_argument("--recovery-run", type=Path, required=True)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--timeout-seconds", type=float, default=900)
    parser.add_argument("--poll-seconds", type=float, default=1)
    parser.add_argument("--interval-seconds", type=float, default=6)
    parser.add_argument("--continue-on-failure", action="store_true")
    parser.add_argument("--max-consecutive-failures", type=int, default=2)
    parser.add_argument("--allow-unfinished", action="store_true")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--file", type=Path)
    parser.add_argument("--reviewed-sha256")
    args = parser.parse_args()
    config = SubmissionConfig.model_validate(load_json(args.config))
    backup_config = SubmissionConfig.model_validate(load_json(args.recovery_config))
    if (
        (config.team_name, config.submission_branch, config.checklist_version_id)
        != (
            backup_config.team_name,
            backup_config.submission_branch,
            backup_config.checklist_version_id,
        )
        or (config.profile_id, config.profile_version)
        == (backup_config.profile_id, backup_config.profile_version)
        or args.run.resolve() == args.recovery_run.resolve()
    ):
        raise PreparationError("recovery_requires_separate_profile_and_receipt_same_pinned_rubric")
    # Both exports apply the union; no primary redaction is lost by switching provider.
    redactions = sorted(set(config.redactions + backup_config.redactions))
    config = config.model_copy(update={"redactions": redactions})
    backup_config = backup_config.model_copy(update={"redactions": redactions})
    manifest = SubmissionManifest.model_validate(load_json(args.manifest))
    receipt = SubmissionRun.model_validate(load_json(args.run))
    primary = read_items(args.database, manifest, config, receipt)
    eligible = recovery_ids(primary, manifest)
    print(
        json.dumps(
            {"eligible_ids": sorted(eligible), "protected_results": len(primary) - len(eligible)}
        )
    )
    if args.command == "plan":
        return
    if args.command == "evaluate":
        # A new full receipt has stable keys for all IDs; only eligible IDs are submitted.
        # Reusing the same file resumes its existing jobs rather than scheduling replacements.
        args.run = args.recovery_run
        evaluate(args, manifest, backup_config, only_ids=eligible)
        return
    backup_receipt = SubmissionRun.model_validate(load_json(args.recovery_run))
    backup = read_items(args.database, manifest, backup_config, backup_receipt)
    result = combine(
        primary, backup, config, backup_config, manifest, allow_unfinished=args.allow_unfinished
    )
    if args.command == "export":
        if args.output is None:
            parser.error("export requires --output")
        fingerprint = write_results(
            args.output, result, manifest, reviewed_sha256=args.reviewed_sha256
        )
    else:
        if args.file is None:
            parser.error("validate requires --file")
        saved = OfficialResults.model_validate(load_json(args.file))
        validate_results(saved, manifest)
        if saved != result:
            raise PreparationError("file_does_not_match_both_saved_provider_runs")
        fingerprint = hashlib.sha256(args.file.read_bytes()).hexdigest()
    print(
        json.dumps(
            {
                "total": len(result.results),
                "ok": sum(r.status == "ok" for r in result.results),
                "error": sum(r.status == "error" for r in result.results),
                "actual_model": result.model.name,
                "sha256": fingerprint,
                "saved_provenance_checked": True,
            }
        )
    )


if __name__ == "__main__":
    try:
        main()
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
        print(json.dumps({"completed": False, "error": message}))
        raise SystemExit(1) from None
