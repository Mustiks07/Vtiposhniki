"""Business validation of checklist rules (no network, no mutation)."""

import math
from datetime import datetime
from decimal import Decimal

from cqa_contracts.models import ChecklistDraft, ChecklistVersion, Criterion

from .errors import Problems
from .hashing import checklist_scoring_hash, checklist_semantic_hash

_ZERO = Decimal(0)
_ONE = Decimal(1)


def _raw_key(value: object) -> tuple[str, object]:
    # bool is an int subclass; keep True distinct from 1 and 1.0 distinct from "1".
    if isinstance(value, bool):
        return ("bool", value)
    if isinstance(value, (int, float)):
        return ("number", value)
    return ("string", value)


def _finite_decimal(value: object) -> bool:
    return isinstance(value, Decimal) and value.is_finite()


def _check_criterion(index: int, c: Criterion, section_ids: set[str], problems: Problems) -> None:
    path = f"criteria[{index}]"
    choice_ids = [ch.id for ch in c.choices]
    if len(c.choices) < 2:
        problems.add(f"{path}.choices", "missing", index)
    if len(set(choice_ids)) != len(choice_ids):
        problems.add(f"{path}.choices.id", "duplicate", index)
    labels = [ch.label for ch in c.choices]
    if len(set(labels)) != len(labels):
        problems.add(f"{path}.choices.label", "duplicate", index)
    raw = [_raw_key(ch.raw_value) for ch in c.choices]
    if len(set(raw)) != len(raw):
        problems.add(f"{path}.choices.raw_value", "duplicate", index)
    for j, ch in enumerate(c.choices):
        if isinstance(ch.raw_value, float) and not math.isfinite(ch.raw_value):
            problems.add(f"{path}.choices[{j}].raw_value", "invalid", index)

    if not _finite_decimal(c.weight) or c.weight < _ZERO:
        problems.add(f"{path}.weight", "invalid", index)

    if c.response_type == "binary" and len(c.choices) != 2:
        problems.add(f"{path}.choices", "unsupported", index)

    if c.response_type == "flag":
        if _finite_decimal(c.weight) and c.weight != _ZERO:
            problems.add(f"{path}.weight", "invalid", index)
        if any(ch.score_fraction is not None for ch in c.choices):
            problems.add(f"{path}.choices.score_fraction", "invalid", index)
        if not c.flag_when_choice_ids:
            problems.add(f"{path}.flag_when_choice_ids", "missing", index)
        if len(set(c.flag_when_choice_ids)) != len(c.flag_when_choice_ids):
            problems.add(f"{path}.flag_when_choice_ids", "duplicate", index)
        if not set(c.flag_when_choice_ids) <= set(choice_ids):
            problems.add(f"{path}.flag_when_choice_ids", "invalid", index)
        if set(c.flag_when_choice_ids) >= set(choice_ids):
            # A flag that every answer raises carries no information.
            problems.add(f"{path}.flag_when_choice_ids", "invalid", index)
        if c.section_id is not None:
            problems.add(f"{path}.section_id", "unsupported", index)
    else:
        if c.flag_when_choice_ids:
            problems.add(f"{path}.flag_when_choice_ids", "unsupported", index)
        for j, ch in enumerate(c.choices):
            fraction = ch.score_fraction
            if fraction is None:
                problems.add(f"{path}.choices[{j}].score_fraction", "missing", index)
            elif not _finite_decimal(fraction) or not (_ZERO <= fraction <= _ONE):
                problems.add(f"{path}.choices[{j}].score_fraction", "invalid", index)

    if c.allow_na:
        if c.na_condition is None or not c.na_condition.strip():
            problems.add(f"{path}.na_condition", "missing", index)
    elif c.na_condition is not None and c.na_condition.strip():
        problems.add(f"{path}.na_condition", "unsupported", index)

    if c.section_id is not None and c.section_id not in section_ids:
        problems.add(f"{path}.section_id", "invalid", index)


def checklist_rule_problems(config: ChecklistDraft) -> Problems:
    problems = Problems()
    criterion_ids = [c.id for c in config.criteria]
    if not criterion_ids:
        problems.add("criteria", "missing")
    seen: set[str] = set()
    for i, cid in enumerate(criterion_ids):
        if cid in seen:
            problems.add(f"criteria[{i}].id", "duplicate", i)
        seen.add(cid)
    section_ids = [s.id for s in config.sections]
    if len(set(section_ids)) != len(section_ids):
        problems.add("sections.id", "duplicate")
    for i, c in enumerate(config.criteria):
        _check_criterion(i, c, set(section_ids), problems)
    return problems


def validate_checklist_draft(config: ChecklistDraft) -> None:
    """Rule validation for an editor draft before a version is created."""
    checklist_rule_problems(config).raise_if_any("Checklist rules are invalid")


def validate_checklist(config: ChecklistVersion) -> None:
    """Rules plus integrity of the stored semantic/scoring hashes."""
    problems = checklist_rule_problems(config)
    if not problems:
        if config.semantic_hash != checklist_semantic_hash(config):
            problems.add("semantic_hash", "invalid")
        if config.scoring_config_hash != checklist_scoring_hash(config):
            problems.add("scoring_config_hash", "invalid")
    problems.raise_if_any("Checklist version is invalid")


def build_checklist_version(
    draft: ChecklistDraft, *, checklist_id: str, version_id: str, created_at: datetime
) -> ChecklistVersion:
    """Validate a draft and pin it as an immutable version with computed hashes."""
    validate_checklist_draft(draft)
    data = draft.model_dump(mode="python")
    data.update(
        checklist_id=checklist_id,
        version_id=version_id,
        created_at=created_at,
        semantic_hash=checklist_semantic_hash(draft),
        scoring_config_hash=checklist_scoring_hash(draft),
    )
    version = ChecklistVersion.model_validate(data)
    validate_checklist(version)
    return version
