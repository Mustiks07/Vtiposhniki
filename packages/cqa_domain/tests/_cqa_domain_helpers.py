"""Synthetic builders for domain tests (no real conversations)."""

import json
from decimal import Decimal
from pathlib import Path
from typing import Any

from cqa_contracts.models import (
    ChecklistDraft,
    ChecklistVersion,
    CriterionProposal,
    Evidence,
    ReasonCode,
)
from cqa_domain import build_checklist_version, original_checklist

ROOT = Path(__file__).resolve().parents[3]
CREATED = "2026-11-07T00:00:00Z"


def load_json(relative: str) -> Any:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def contract_fixture(name: str) -> Any:
    return load_json(f"fixtures/contracts/{name}.json")


def rehash(data: dict[str, Any]) -> ChecklistVersion:
    """Pin a checklist payload with real hashes (contract fixtures use placeholders)."""
    draft = ChecklistDraft.model_validate(
        {k: data[k] for k in ("title", "criteria", "sections", "rounding") if k in data}
    )
    return build_checklist_version(
        draft,
        checklist_id=data.get("checklist_id", "test-checklist"),
        version_id=data.get("version_id", "test-v1"),
        created_at=data.get("created_at", CREATED),  # type: ignore[arg-type]
    )


def proposal(
    criterion_id: str,
    choice: str | None,
    applicability: str = "applicable",
    *,
    origin: str = "ai",
    codes: list[ReasonCode] | None = None,
) -> CriterionProposal:
    if codes is None:
        codes = {
            "applicable": [ReasonCode.CRITERIA_MET],
            "not_applicable": [ReasonCode.NOT_APPLICABLE],
            "undetermined": [ReasonCode.INSUFFICIENT_EVIDENCE],
        }[applicability]
        if origin == "human":
            codes = [ReasonCode.HUMAN_CHANGED]
    return CriterionProposal.model_validate(
        {
            "criterion_id": criterion_id,
            "applicability": applicability,
            "answer_choice_id": choice,
            "rationale": "Synthetic rationale.",
            "reason_codes": codes,
            "evidence": [
                Evidence(
                    kind="range",
                    start_message_id="m0001",
                    end_message_id="m0002",
                    relation="context",
                    explanation="Synthetic range.",
                )
            ],
            "origin": origin,
        }
    )


ORIGINAL_ALL_MET = {
    "c1_contact": "yes",
    "c2_needs": "yes",
    "c3_identification": "yes",
    "c4_consultation": "p20",
    "c5_empathy": "yes",
    "c6_dialog_management": "p10",
    "c7_closing": "yes",
    "c8_gross_errors": "no",
}


def original_proposals(
    overrides: dict[str, str | None] | None = None,
    na: tuple[str, ...] = (),
    undetermined: tuple[str, ...] = (),
) -> list[CriterionProposal]:
    answers: dict[str, str | None] = dict(ORIGINAL_ALL_MET) | dict(overrides or {})
    result = []
    for cid, choice in answers.items():
        if cid in na:
            result.append(proposal(cid, None, "not_applicable"))
        elif cid in undetermined:
            result.append(proposal(cid, None, "undetermined"))
        else:
            result.append(proposal(cid, choice))
    return result


def original() -> ChecklistVersion:
    return original_checklist()


def dec(text: str) -> Decimal:
    return Decimal(text)
