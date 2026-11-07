import json
from collections.abc import Callable
from typing import Any

import pytest
from _cqa_domain_helpers import contract_fixture, rehash
from cqa_contracts.interfaces import DomainValidationError
from cqa_contracts.models import ChecklistDraft, ChecklistVersion
from cqa_domain import (
    build_checklist_version,
    original_checklist,
    validate_checklist,
    validate_checklist_draft,
)


def base() -> dict[str, Any]:
    return json.loads(json.dumps(contract_fixture("checklist-custom")))


def crit(d: dict[str, Any], cid: str) -> dict[str, Any]:
    return next(c for c in d["criteria"] if c["id"] == cid)


def draft(d: dict[str, Any]) -> ChecklistDraft:
    return ChecklistDraft.model_validate(
        {k: d[k] for k in ("title", "criteria", "sections", "rounding")}
    )


INVALID: dict[str, Callable[[dict[str, Any]], None]] = {
    "duplicate_criterion": lambda d: d["criteria"].append(dict(crit(d, "synthetic-binary"))),
    "duplicate_choice_id": lambda d: crit(d, "synthetic-scale")["choices"].append(
        dict(crit(d, "synthetic-scale")["choices"][0], label="other", raw_value=9)
    ),
    "duplicate_raw_value": lambda d: crit(d, "synthetic-scale")["choices"][0].update(raw_value=1),
    "duplicate_label": lambda d: crit(d, "synthetic-scale")["choices"][0].update(label="low"),
    "flag_with_weight": lambda d: crit(d, "synthetic-flag").update(weight="5"),
    "flag_with_fraction": lambda d: crit(d, "synthetic-flag")["choices"][0].update(
        score_fraction="1"
    ),
    "flag_without_trigger": lambda d: crit(d, "synthetic-flag").update(flag_when_choice_ids=[]),
    "flag_unknown_trigger": lambda d: crit(d, "synthetic-flag").update(
        flag_when_choice_ids=["maybe"]
    ),
    "flag_all_choices_trigger": lambda d: crit(d, "synthetic-flag").update(
        flag_when_choice_ids=["yes", "no"]
    ),
    "flag_unknown_section": lambda d: crit(d, "synthetic-flag").update(section_id="nowhere"),
    "scale_missing_fraction": lambda d: crit(d, "synthetic-scale")["choices"][0].update(
        score_fraction=None
    ),
    "scale_with_flag_trigger": lambda d: crit(d, "synthetic-scale").update(
        flag_when_choice_ids=["high"]
    ),
    "binary_three_choices": lambda d: crit(d, "synthetic-binary")["choices"].append(
        {
            "id": "maybe",
            "label": "maybe",
            "raw_value": "maybe",
            "anchor": "Maybe.",
            "score_fraction": "0.5",
        }
    ),
    "na_without_condition": lambda d: crit(d, "synthetic-scale").update(na_condition=None),
    "na_blank_condition": lambda d: crit(d, "synthetic-scale").update(na_condition="  "),
    "condition_without_na": lambda d: crit(d, "synthetic-binary").update(na_condition="Text."),
    "unknown_section": lambda d: crit(d, "synthetic-binary").update(section_id="nowhere"),
    "duplicate_section": lambda d: d["sections"].append(dict(d["sections"][0])),
}


@pytest.mark.parametrize("name", sorted(INVALID))
def test_invalid_rules_are_rejected_with_safe_details(name: str) -> None:
    data = base()
    INVALID[name](data)
    with pytest.raises(DomainValidationError) as info:
        validate_checklist_draft(draft(data))
    error = info.value.error
    assert error.code == "validation_error"
    assert error.retryable is False
    assert error.details
    rendered = error.model_dump_json()
    for secret in ("Synthetic anchor", "Illustrative contract", "Text."):
        assert secret not in rendered


def test_contract_shape_rejects_non_finite_and_out_of_range_values() -> None:
    from pydantic import ValidationError

    for field, value in (
        ("score_fraction", "1.5"),
        ("score_fraction", "NaN"),
        ("score_fraction", "Infinity"),
        ("raw_value", float("nan")),
    ):
        data = base()
        crit(data, "synthetic-scale")["choices"][0][field] = value
        with pytest.raises(ValidationError):
            draft(data)
    data = base()
    crit(data, "synthetic-binary")["weight"] = "-1"
    with pytest.raises(ValidationError):
        draft(data)


def test_valid_custom_and_unfamiliar_checklists_pass() -> None:
    for name in ("checklist-custom", "checklist-unfamiliar"):
        version = rehash(contract_fixture(name))
        validate_checklist(version)


def test_placeholder_hashes_are_rejected_by_version_validation() -> None:
    # Contract fixtures carry placeholder hashes; a pinned version must carry real ones.
    with pytest.raises(DomainValidationError) as info:
        validate_checklist(ChecklistVersion.model_validate(contract_fixture("checklist-custom")))
    fields = {d.field for d in info.value.error.details}
    assert fields == {"semantic_hash", "scoring_config_hash"}


def test_build_version_pins_hashes_and_identity() -> None:
    version = build_checklist_version(
        draft(base()),
        checklist_id="custom",
        version_id="custom-v2",
        created_at="2026-11-07T12:00:00Z",  # type: ignore[arg-type]
    )
    assert version.checklist_id == "custom"
    assert version.version_id == "custom-v2"
    validate_checklist(version)


def test_unfamiliar_new_criterion_needs_no_code_change() -> None:
    data = base()
    data["criteria"].append(
        {
            "id": "brand-new",
            "title": "Неизвестный ранее критерий",
            "definition": "Новое правило, добавленное через редактор.",
            "response_type": "scale",
            "choices": [
                {
                    "id": "a",
                    "label": "A",
                    "raw_value": "A",
                    "anchor": "Лучший вариант.",
                    "score_fraction": "1",
                },
                {
                    "id": "b",
                    "label": "B",
                    "raw_value": "B",
                    "anchor": "Средний вариант.",
                    "score_fraction": "0.25",
                },
            ],
            "allow_na": False,
            "na_condition": None,
            "channel_instructions": {},
            "evidence_policy": {},
            "requires_reference": False,
            "weight": "7.5",
            "section_id": None,
        }
    )
    version = rehash(data)
    validate_checklist(version)
    assert version.semantic_hash != rehash(base()).semantic_hash


def test_original_checklist_is_valid() -> None:
    validate_checklist(original_checklist())
