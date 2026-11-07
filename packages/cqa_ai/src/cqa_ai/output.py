"""Strict parsing of model output into shared CriterionProposal objects.

Anything not structurally valid for the rubric/conversation/corpus is reported
as a problem list (for bounded format repair). Partial data from an invalid
answer is diagnostics only; it never becomes a partial evaluation.
"""

import json
import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Literal

from cqa_contracts.models import (
    ChecklistDraft,
    Conversation,
    CorpusSnapshot,
    CriterionProposal,
)
from cqa_domain import REVIEW_TRIGGER_CODES, automatic_proposal_problems
from pydantic import ValidationError

from .prompts import MODEL_LIMITATION_CODES

_FENCE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.DOTALL)

DiagnosticCode = Literal[
    "empty_output",
    "truncated_output",
    "invalid_json",
    "invalid_structure",
    "invalid_proposal",
    "missing_criterion",
    "unknown_criterion",
    "invalid_reference",
]


@dataclass(frozen=True)
class ParseResult:
    proposals: list[CriterionProposal] | None
    problems: list[str]
    diagnostics: list[DiagnosticCode]

    @property
    def ok(self) -> bool:
        return self.proposals is not None


def _strip_fence(text: str) -> str:
    match = _FENCE.match(text)
    return match.group(1) if match else text


def parse_proposals(
    text: str,
    *,
    finish_reason: str,
    conversation: Conversation,
    checklist: ChecklistDraft,
    corpus: CorpusSnapshot,
    requested_ids: Sequence[str],
    allowed_chunk_ids: set[str],
    origin: Literal["ai", "test"],
) -> ParseResult:
    if finish_reason == "length":
        return ParseResult(
            None,
            ["The answer was truncated; return a shorter complete JSON."],
            ["truncated_output"],
        )
    if not text or not text.strip():
        # e.g. DeepSeek json_object can return blank content with finish_reason=stop.
        return ParseResult(
            None, ["The answer was empty; return the JSON object."], ["empty_output"]
        )
    try:
        data: Any = json.loads(_strip_fence(text))
    except json.JSONDecodeError:
        return ParseResult(None, ["The answer is not valid JSON."], ["invalid_json"])
    items = data.get("criteria") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return ParseResult(
            None, ['Top level must be an object with a "criteria" array.'], ["invalid_structure"]
        )

    problems: list[str] = []
    diagnostics: list[DiagnosticCode] = []
    proposals: list[CriterionProposal] = []
    requested = list(requested_ids)
    for n, item in enumerate(items):
        if not isinstance(item, dict):
            problems.append(f"criteria[{n}] must be an object.")
            diagnostics.append("invalid_structure")
            continue
        cid = item.get("criterion_id")
        label = f"criterion {cid!s}" if isinstance(cid, str) else f"criteria[{n}]"
        if cid not in requested:
            problems.append(f"{label}: not a requested criterion id.")
            diagnostics.append("unknown_criterion")
            continue
        flags = item.get("review_flags") or []
        limitations = item.get("limitations") or []
        if not isinstance(flags, list) or not isinstance(limitations, list):
            problems.append(f"{label}: review_flags and limitations must be arrays.")
            diagnostics.append("invalid_proposal")
            continue
        candidate = {
            "criterion_id": cid,
            "applicability": item.get("applicability"),
            "answer_choice_id": item.get("answer_choice_id"),
            "rationale": item.get("rationale"),
            "reason_codes": item.get("reason_codes"),
            "evidence": item.get("evidence"),
            # Selection hints and limitation codes are filtered to allowlists.
            "limitations": sorted({x for x in limitations if x in MODEL_LIMITATION_CODES}),
            "review_reasons": [x for x in REVIEW_TRIGGER_CODES if x in flags],
            "origin": origin,
        }
        try:
            proposals.append(CriterionProposal.model_validate(candidate))
        except ValidationError as exc:
            fields = sorted({".".join(str(p) for p in e["loc"]) or "item" for e in exc.errors()})
            problems.append(f"{label}: invalid fields {', '.join(fields)}.")
            diagnostics.append("invalid_proposal")

    subset = checklist.model_copy(
        update={"criteria": [c for c in checklist.criteria if c.id in set(requested)]}
    )
    domain = automatic_proposal_problems(
        conversation,
        subset,
        corpus,
        proposals,
        origin=origin,
        allowed_chunk_ids=allowed_chunk_ids,
    )
    for detail in domain.details:
        field = detail.field or "proposals"
        if (
            detail.index is not None
            and field.startswith("proposals[")
            and detail.index < len(proposals)
        ):
            who = f"criterion {proposals[detail.index].criterion_id}"
            field = field.split(".", 1)[1] if "." in field else "item"
        elif field.startswith("criteria[") and detail.index is not None:
            who = f"criterion {subset.criteria[detail.index].id}"
            field = "missing from the answer" if detail.reason == "missing" else field
        else:
            who = "answer"
        problems.append(f"{who}: {field} ({detail.reason}).")
        if "source_chunk_id" in field or "message" in field:
            diagnostics.append("invalid_reference")
        elif "missing from the answer" in field:
            diagnostics.append("missing_criterion")
        else:
            diagnostics.append("invalid_proposal")

    if problems:
        return ParseResult(None, problems, sorted(set(diagnostics)))
    order = {cid: i for i, cid in enumerate(requested)}
    return ParseResult(sorted(proposals, key=lambda p: order[p.criterion_id]), [], [])
