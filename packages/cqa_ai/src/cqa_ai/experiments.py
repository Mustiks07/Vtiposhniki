"""Profile comparison runner (baseline vs B-light) with honest metric naming.

Dataset layout (no dataset IDs/sizes are hard-coded):
  <dataset>/scenario-manifest.json  groups -> split (tune/check), frozen before comparison
  <dataset>/cases/*.json            {"case_id","group_id","conversation":{...},"labels":{...}?}
  <dataset>/replay/<profile>/<case_id>.json  {"responses":[...]}  (offline replay only)

Labels carry provenance official|human|rule_synthetic|model_generated. Only
official/human labels yield "accuracy"; model_generated yields "agreement";
rule_synthetic yields "formal_check". MAE uses cqa_domain.score and only
comparable complete pairs, with excluded counts shown. Offline replay checks the
pipeline and metric arithmetic; it is NOT a measurement of model quality.
This runner only replays recorded/synthetic responses. A real run needs keys, an
approved production profile and integrator coordination; no live command is
provided here and nothing starts from tests or imports.
"""

import argparse
import asyncio
import json
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

from cqa_contracts.models import (
    ChecklistVersion,
    Conversation,
    CorpusSnapshot,
    CriterionProposal,
    EvaluationArtifact,
    EvaluatorProfile,
    ExecutionBudget,
    ReasonCode,
)
from cqa_domain import conversation_content_hash, original_checklist, score

from .corpus import empty_corpus, load_corpus_manifest
from .evaluator import Evaluator
from .testing import InMemoryObserver, ScriptedTransport, ok

ACCURACY_PROVENANCE = frozenset({"official", "human"})
PROVENANCES = frozenset({"official", "human", "rule_synthetic", "model_generated"})


@dataclass
class Case:
    case_id: str
    group_id: str
    conversation: Conversation
    labels: dict[str, Any] | None


@dataclass
class ProfileRun:
    name: str
    artifacts: dict[str, EvaluationArtifact | None] = field(default_factory=dict)
    errors: dict[str, str] = field(default_factory=dict)
    seconds: float = 0.0


def load_conversation(data: dict[str, Any]) -> Conversation:
    """Accept a conversation without hash/ids; assign m0001.. and the content hash."""
    messages = [
        {
            "id": f"m{i:04d}",
            "ordinal": i,
            "speaker": m["speaker"],
            "text": m["text"],
            "timestamp_original": m["timestamp_original"],
            "source_index": i - 1,
        }
        for i, m in enumerate(data["messages"], start=1)
    ]
    draft = Conversation.model_validate(
        {
            "id": data.get("id", "case"),
            "external_id": data.get("external_id", "case"),
            "revision": 1,
            "content_hash": "0" * 64,
            "channel": data["channel"],
            "language": data["language"],
            "messages": messages,
            "occurred_at": data.get("occurred_at"),
            "audio": data.get(
                "audio", {"availability": "unknown", "alignment_status": "unavailable"}
            ),
            "warnings": data.get("warnings", []),
        }
    )
    return draft.model_copy(update={"content_hash": conversation_content_hash(draft)})


def load_cases(dataset: Path) -> list[Case]:
    cases = []
    for path in sorted((dataset / "cases").glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        labels = data.get("labels")
        if labels is not None and labels.get("provenance") not in PROVENANCES:
            raise ValueError(f"{path.name}: unknown label provenance")
        cases.append(
            Case(data["case_id"], data["group_id"], load_conversation(data["conversation"]), labels)
        )
    return cases


def check_split(manifest: dict[str, Any], cases: list[Case]) -> list[str]:
    """Problems: unknown groups, groups without split, or a group split across sets."""
    problems = []
    splits = {g["group_id"]: g.get("split") for g in manifest["groups"]}
    members = {g["group_id"]: set(g.get("members", [])) for g in manifest["groups"]}
    for case in cases:
        if case.group_id not in splits:
            problems.append(f"{case.case_id}: group not in manifest")
        elif splits[case.group_id] not in ("tune", "check"):
            problems.append(f"{case.group_id}: missing split")
        elif members[case.group_id] and case.case_id not in members[case.group_id]:
            problems.append(f"{case.case_id}: not listed as a member of its group")
    owner: dict[str, str] = {}
    for g in manifest["groups"]:
        for member in g.get("members", []):
            if member in owner and owner[member] != g["group_id"]:
                problems.append(f"{member}: listed in several groups")
            owner[member] = g["group_id"]
    return problems


def _budget(job: str) -> ExecutionBudget:
    return ExecutionBudget(
        logical_job_id=job,
        attempt_id=f"{job}-a1",
        max_provider_calls=8,
        consumed_calls=0,
        deadline_at=datetime.now(UTC) + timedelta(minutes=5),
        max_total_tokens=None,
    )


async def run_profile(
    name: str,
    profile: EvaluatorProfile,
    cases: list[Case],
    checklist: ChecklistVersion,
    corpus: CorpusSnapshot,
    replay_dir: Path,
) -> ProfileRun:
    result = ProfileRun(name)
    start = time.monotonic()
    for case in cases:
        path = replay_dir / name / f"{case.case_id}.json"
        responses = json.loads(path.read_text(encoding="utf-8"))["responses"]
        transport = ScriptedTransport([ok(r) for r in responses])
        evaluator = Evaluator({"test": transport})
        budget = _budget(f"{name}-{case.case_id}")
        try:
            result.artifacts[case.case_id] = await evaluator(
                case.conversation, checklist, profile, corpus, budget, InMemoryObserver(budget)
            )
        except Exception as exc:  # recorded, never silently dropped
            result.artifacts[case.case_id] = None
            result.errors[case.case_id] = type(exc).__name__
    result.seconds = time.monotonic() - start
    return result


def _label_proposals(
    checklist: ChecklistVersion, answers: dict[str, Any]
) -> list[CriterionProposal] | None:
    if set(answers) != {c.id for c in checklist.criteria}:
        return None
    proposals = []
    for cid, a in answers.items():
        applicability = a["applicability"]
        code = {
            "applicable": ReasonCode.OTHER,
            "not_applicable": ReasonCode.NOT_APPLICABLE,
            "undetermined": ReasonCode.INSUFFICIENT_EVIDENCE,
        }[applicability]
        proposals.append(
            CriterionProposal(
                criterion_id=cid,
                applicability=applicability,
                answer_choice_id=a.get("answer_choice_id"),
                rationale="label",
                reason_codes=[code],
                evidence=[],
                origin="test",
            )
        )
    return proposals


def report(
    runs: list[ProfileRun], cases: list[Case], checklist: ChecklistVersion, mode: str
) -> dict[str, Any]:
    by_case = {c.case_id: c for c in cases}
    criteria = {c.id: c for c in checklist.criteria}
    out: dict[str, Any] = {
        "generated_at": datetime.now(UTC).isoformat(),
        "mode": mode,
        "disclaimer": (
            "Offline replay validates the pipeline and metric arithmetic only; it is not "
            "model quality."
            if mode == "offline_replay"
            else "Live run; see label provenance."
        ),
        "checklist_version_id": checklist.version_id,
        "cases": len(cases),
        "label_provenance": dict(
            Counter((c.labels or {}).get("provenance", "unlabeled") for c in cases)
        ),
        "profiles": {},
    }
    decisions: dict[str, dict[tuple[str, str], tuple[str, str | None]]] = {}
    for run in runs:
        statuses: Counter[str] = Counter()
        per: dict[str, Counter[str]] = {cid: Counter() for cid in criteria}
        step_errors: list[Decimal] = []
        flags = Counter[str]()
        abs_errors: list[Decimal] = []
        excluded = Counter[str]()
        calls = 0
        reviews: Counter[str] = Counter()
        costs: list[Decimal | None] = []
        decisions[run.name] = {}
        for case_id, artifact in run.artifacts.items():
            if artifact is None:
                statuses["error"] += 1
                continue
            statuses[artifact.status] += 1
            calls += len(artifact.calls)
            reviews.update(r.outcome for r in artifact.reviews)
            costs.extend(c.cost for c in artifact.calls)
            labels = by_case[case_id].labels
            final = {p.criterion_id: p for p in artifact.automatic_final}
            for cid, p in final.items():
                decisions[run.name][(case_id, cid)] = (p.applicability, p.answer_choice_id)
            if not labels or artifact.status == "failed":
                excluded["unlabeled_or_failed"] += 1
                continue
            answers = labels["answers"]
            for cid, expected in answers.items():
                got = final.get(cid)
                if got is None:
                    continue
                want = (expected["applicability"], expected.get("answer_choice_id"))
                have = (got.applicability, got.answer_choice_id)
                per[cid]["compared"] += 1
                per[cid]["match"] += int(want == have)
                if want[0] == "not_applicable" or have[0] == "not_applicable":
                    per[cid]["na_involved"] += 1
                    per[cid]["na_match"] += int(want[0] == have[0])
                crit = criteria[cid]
                raw = {ch.id: ch.raw_value for ch in crit.choices}
                wr, hr = raw.get(want[1] or ""), raw.get(have[1] or "")
                if (
                    crit.response_type == "scale"
                    and want[0] == have[0] == "applicable"
                    and isinstance(wr, int)
                    and not isinstance(wr, bool)
                    and isinstance(hr, int)
                    and not isinstance(hr, bool)
                ):
                    step_errors.append(Decimal(abs(wr - hr)))
                if crit.response_type == "flag" and want[0] == have[0] == "applicable":
                    exp = want[1] in crit.flag_when_choice_ids
                    pred = have[1] in crit.flag_when_choice_ids
                    flags["tp" if exp and pred else "fp" if pred else "fn" if exp else "tn"] += 1
            label_set = _label_proposals(checklist, answers)
            if label_set is None:
                excluded["labels_incomplete"] += 1
                continue
            truth = score(checklist, label_set)
            predicted = score(checklist, artifact.automatic_final)
            if truth.total_score is None or predicted.total_score is None:
                excluded["total_not_comparable"] += 1
                continue
            abs_errors.append(abs(truth.total_score - predicted.total_score))
        provenance = {(c.labels or {}).get("provenance") for c in cases if c.labels}
        metric = (
            "accuracy"
            if provenance and provenance <= ACCURACY_PROVENANCE
            else "agreement"
            if provenance == {"model_generated"}
            else "formal_check"
        )
        known_costs = [c for c in costs if c is not None]
        out["profiles"][run.name] = {
            "metric_kind": metric,
            "statuses": dict(statuses),
            "errors": run.errors,
            "complete_coverage": f"{statuses['complete']}/{len(run.artifacts)}",
            "per_criterion": {
                cid: {
                    "compared": c["compared"],
                    "match": c["match"],
                    "na_involved": c["na_involved"],
                    "na_match": c["na_match"],
                }
                for cid, c in per.items()
            },
            "scale_step_mae": None if not step_errors else str(sum(step_errors) / len(step_errors)),
            "flag_counts": dict(flags),
            "total_mae": None if not abs_errors else str(sum(abs_errors) / len(abs_errors)),
            "total_mae_n": len(abs_errors),
            "excluded": dict(excluded),
            "review_outcomes": dict(reviews),
            "provider_calls": calls,
            "cost": None if len(known_costs) != len(costs) else str(sum(known_costs)),
            "cost_complete": len(known_costs) == len(costs),
            "seconds": round(run.seconds, 3),
        }
    if len(runs) == 2:
        a, b = runs[0].name, runs[1].name
        corrected = broken = changed = 0
        for key, first in decisions[a].items():
            second = decisions[b].get(key)
            if second is None or second == first:
                continue
            changed += 1
            labels = by_case[key[0]].labels
            if not labels or key[1] not in labels["answers"]:
                continue
            exp = labels["answers"][key[1]]
            want = (exp["applicability"], exp.get("answer_choice_id"))
            corrected += int(second == want and first != want)
            broken += int(first == want and second != want)
        out["comparison"] = {
            "from": a,
            "to": b,
            "changed_decisions": changed,
            "corrected": corrected,
            "broken": broken,
        }
    return out


def _profile(path: Path) -> EvaluatorProfile:
    return EvaluatorProfile.model_validate_json(path.read_text(encoding="utf-8"))


async def _main(args: argparse.Namespace) -> int:
    dataset: Path = args.dataset
    cases = load_cases(dataset)
    manifest = json.loads((dataset / "scenario-manifest.json").read_text(encoding="utf-8"))
    problems = check_split(manifest, cases)
    if problems:
        print("Scenario split problems:\n- " + "\n- ".join(problems))
        return 2
    if args.split != "all":
        splits = {g["group_id"]: g["split"] for g in manifest["groups"]}
        cases = [c for c in cases if splits[c.group_id] == args.split]
    checklist = original_checklist()
    runs = []
    for spec in args.profile:
        name, _, rest = spec.partition("=")
        file, _, corpus_file = rest.partition(",")
        corpus = load_corpus_manifest(Path(corpus_file)) if corpus_file else empty_corpus()
        profile = _profile(Path(file)).model_copy(update={"corpus_snapshot_id": corpus.id})
        runs.append(await run_profile(name, profile, cases, checklist, corpus, dataset / "replay"))
    result = report(runs, cases, checklist, "offline_replay")
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m cqa_ai.experiments",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument(
        "--profile",
        action="append",
        required=True,
        help="name=profile.json[,corpus-manifest.json]; no manifest = empty corpus",
    )
    parser.add_argument("--split", choices=["tune", "check", "all"], default="all")
    parser.add_argument("--out", type=Path, help="report path, e.g. data/private/reports/x.json")
    return asyncio.run(_main(parser.parse_args(argv)))


if __name__ == "__main__":
    raise SystemExit(main())
