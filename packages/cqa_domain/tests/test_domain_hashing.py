import json
import unicodedata
from collections.abc import Callable
from decimal import Decimal
from typing import Any

import pytest
from _cqa_domain_helpers import load_json, rehash
from cqa_contracts.models import (
    ChecklistVersion,
    Conversation,
    CorpusSnapshot,
    EvaluationIdentity,
    EvaluatorProfile,
)
from cqa_domain import (
    canonical_decimal,
    canonical_json,
    checklist_scoring_hash,
    checklist_semantic_hash,
    content_projection,
    conversation_content_hash,
    corpus_projection,
    corpus_snapshot_hash,
    evaluation_reuse_key,
    profile_hash,
    scoring_projection,
    semantic_projection,
)

VECTORS = {v["kind"]: v for v in load_json("fixtures/hashing/vectors.json")["vectors"]}

KINDS: dict[str, tuple[Any, Callable[[Any], str], Callable[[Any], Any] | None]] = {
    "content": (Conversation, conversation_content_hash, content_projection),
    "semantic": (ChecklistVersion, checklist_semantic_hash, semantic_projection),
    "scoring": (ChecklistVersion, checklist_scoring_hash, scoring_projection),
    "profile": (EvaluatorProfile, profile_hash, None),
    "corpus": (CorpusSnapshot, corpus_snapshot_hash, corpus_projection),
    "reuse": (EvaluationIdentity, evaluation_reuse_key, None),
}


@pytest.mark.parametrize("kind", sorted(KINDS))
def test_foundation_vectors(kind: str) -> None:
    vector = VECTORS[kind]
    model, hash_fn, projection_fn = KINDS[kind]
    value = model.model_validate(vector["input"])
    projected = value if projection_fn is None else projection_fn(value)
    assert canonical_json(projected) == vector["canonical_json"]
    assert hash_fn(value) == vector["sha256"]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("40", "40"),
        ("40.0", "40"),
        ("0.50", "0.5"),
        ("0.00", "0"),
        ("-0", "0"),
        ("100", "100"),
        ("1E+2", "100"),
        ("0.000001", "0.000001"),
        ("10.50", "10.5"),
    ],
)
def test_decimal_canonical_form(text: str, expected: str) -> None:
    assert canonical_decimal(Decimal(text)) == expected


def test_equivalent_decimal_spellings_hash_identically() -> None:
    base = VECTORS["scoring"]["input"]
    variant = json.loads(json.dumps(base))
    for c in variant["criteria"]:
        c["weight"] = c["weight"] + ".000"
    a = ChecklistVersion.model_validate(base)
    b = ChecklistVersion.model_validate(variant)
    assert checklist_scoring_hash(a) == checklist_scoring_hash(b)


# --- Semantic hash mutations --------------------------------------------------


def checklist() -> dict[str, Any]:
    return json.loads(json.dumps(VECTORS["semantic"]["input"]))


def semantic(data: dict[str, Any]) -> str:
    return checklist_semantic_hash(ChecklistVersion.model_validate(data))


def scoring(data: dict[str, Any]) -> str:
    return checklist_scoring_hash(ChecklistVersion.model_validate(data))


def _crit(data: dict[str, Any], cid: str) -> dict[str, Any]:
    return next(c for c in data["criteria"] if c["id"] == cid)


SCORING_ONLY: dict[str, Callable[[dict[str, Any]], None]] = {
    "weight": lambda d: _crit(d, "synthetic-binary").update(weight="41"),
    "fraction": lambda d: _crit(d, "synthetic-scale")["choices"][1].update(score_fraction="0.4"),
    "section_assignment": lambda d: _crit(d, "synthetic-scale").update(section_id=None),
    "section_title": lambda d: d["sections"][0].update(title="Renamed section"),
}
DISPLAY_ONLY: dict[str, Callable[[dict[str, Any]], None]] = {
    "criteria_order": lambda d: d["criteria"].reverse(),
    "choice_order": lambda d: _crit(d, "synthetic-scale")["choices"].reverse(),
    "checklist_title": lambda d: d.update(title="Another display title"),
}
SEMANTIC: dict[str, Callable[[dict[str, Any]], None]] = {
    "title": lambda d: _crit(d, "synthetic-binary").update(title="Changed"),
    "definition": lambda d: _crit(d, "synthetic-binary").update(definition="Changed."),
    "label": lambda d: _crit(d, "synthetic-scale")["choices"][0].update(label="Changed"),
    "anchor": lambda d: _crit(d, "synthetic-scale")["choices"][0].update(anchor="Changed"),
    "raw_value": lambda d: _crit(d, "synthetic-scale")["choices"][0].update(raw_value=3),
    "response_type": lambda d: _crit(d, "synthetic-scale").update(response_type="binary"),
    "allow_na": lambda d: _crit(d, "synthetic-scale").update(allow_na=False),
    "na_condition": lambda d: _crit(d, "synthetic-scale").update(na_condition="Other."),
    "channel": lambda d: _crit(d, "synthetic-binary")["channel_instructions"].update(
        voice_call="Spoken guidance."
    ),
    "voice_policy": lambda d: _crit(d, "synthetic-binary")["channel_instructions"].update(
        voice_policy_version="text-observable-v2"
    ),
    "evidence_policy": lambda d: _crit(d, "synthetic-binary")["evidence_policy"].update(
        allow_source=False
    ),
    "requires_reference": lambda d: _crit(d, "synthetic-binary").update(requires_reference=True),
    "flag_when": lambda d: _crit(d, "synthetic-flag").update(flag_when_choice_ids=["no"]),
    "new_criterion": lambda d: d["criteria"].append(
        {**_crit(d, "synthetic-binary"), "id": "synthetic-new"}
    ),
    "new_choice": lambda d: _crit(d, "synthetic-scale")["choices"].append(
        {
            "id": "extra",
            "label": "extra",
            "raw_value": 5,
            "anchor": "Extra anchor.",
            "score_fraction": "0.2",
        }
    ),
}


@pytest.mark.parametrize("name", sorted(SCORING_ONLY))
def test_scoring_changes_keep_semantic_and_change_scoring(name: str) -> None:
    before = checklist()
    after = checklist()
    SCORING_ONLY[name](after)
    assert semantic(before) == semantic(after)
    assert scoring(before) != scoring(after)


@pytest.mark.parametrize("name", sorted(DISPLAY_ONLY))
def test_display_changes_keep_both_hashes(name: str) -> None:
    before = checklist()
    after = checklist()
    DISPLAY_ONLY[name](after)
    assert semantic(before) == semantic(after)
    assert scoring(before) == scoring(after)


@pytest.mark.parametrize("name", sorted(SEMANTIC))
def test_meaning_changes_invalidate_semantic(name: str) -> None:
    before = checklist()
    after = checklist()
    SEMANTIC[name](after)
    assert semantic(before) != semantic(after)


def test_flag_choice_order_does_not_matter() -> None:
    a = checklist()
    b = checklist()
    _crit(a, "synthetic-flag")["flag_when_choice_ids"] = ["no", "yes"]
    _crit(b, "synthetic-flag")["flag_when_choice_ids"] = ["yes", "no"]
    assert semantic(a) == semantic(b)


def test_rounding_policy_is_part_of_scoring_projection() -> None:
    projected = json.loads(
        canonical_json(scoring_projection(ChecklistVersion.model_validate(checklist())))
    )
    assert projected["rounding"]["mode"] == "ROUND_HALF_UP"
    assert projected["rounding"]["decimal_places"] == 2


def test_semantic_projection_excludes_scoring_fields() -> None:
    text = canonical_json(semantic_projection(ChecklistVersion.model_validate(checklist())))
    for forbidden in ("weight", "score_fraction", "section_id", "sections"):
        assert f'"{forbidden}"' not in text


def test_semantic_hash_ignores_rehash_of_same_draft() -> None:
    data = checklist()
    assert rehash(data).semantic_hash == semantic(data)


# --- Content hash mutations ---------------------------------------------------


def conversation() -> dict[str, Any]:
    return json.loads(json.dumps(VECTORS["content"]["input"]))


def content(data: dict[str, Any]) -> str:
    return conversation_content_hash(Conversation.model_validate(data))


CONTENT_STABLE: dict[str, Callable[[dict[str, Any]], None]] = {
    "external_id": lambda d: d.update(external_id="another-external"),
    "id": lambda d: d.update(id="another-id"),
    "revision": lambda d: d.update(revision=7),
    "stored_hash": lambda d: d.update(content_hash="2" * 64),
    "warnings": lambda d: d.update(warnings=["synthetic warning"]),
    "audio": lambda d: d.update(
        audio={
            "availability": "available",
            "access_path": "/api/v1/conversations/x/audio",
            "content_hash": "3" * 64,
            "alignment_status": "unverified",
            "mapping": None,
            "media_type": "audio/mpeg",
        }
    ),
    "message_ids": lambda d: [m.update(id=f"m{9000 + i}") for i, m in enumerate(d["messages"])],
    "source_index": lambda d: [
        m.update(source_index=m["source_index"] + 10) for m in d["messages"]
    ],
    "parsed_time": lambda d: d["messages"][0].update(parsed_time="2026-01-01T00:00:01Z"),
}
CONTENT_CHANGES: dict[str, Callable[[dict[str, Any]], None]] = {
    "text": lambda d: d["messages"][1].update(text=d["messages"][1]["text"] + "!"),
    "trailing_space": lambda d: d["messages"][1].update(text=d["messages"][1]["text"] + " "),
    "role": lambda d: d["messages"][1].update(speaker="bot"),
    "time": lambda d: d["messages"][1].update(timestamp_original="00:06"),
    "time_format": lambda d: d["messages"][1].update(timestamp_original="0:05"),
    "order": lambda d: d["messages"].reverse(),
    "channel": lambda d: d.update(channel="voice_call"),
    "language": lambda d: d.update(language="KZ"),
    "date": lambda d: d.update(occurred_at="2026-03-01T10:00:00Z"),
    "unicode_form": lambda d: d["messages"][0].update(
        text=unicodedata.normalize("NFD", d["messages"][0]["text"])
    ),
}


@pytest.mark.parametrize("name", sorted(CONTENT_STABLE))
def test_content_hash_ignores_identity_and_annotations(name: str) -> None:
    after = conversation()
    CONTENT_STABLE[name](after)
    assert content(conversation()) == content(after)


@pytest.mark.parametrize("name", sorted(CONTENT_CHANGES))
def test_content_hash_tracks_meaningful_changes(name: str) -> None:
    after = conversation()
    CONTENT_CHANGES[name](after)
    assert content(conversation()) != content(after)


# --- Profile, corpus and reuse ------------------------------------------------


def test_profile_changes_invalidate_profile_hash() -> None:
    base = VECTORS["profile"]["input"]
    for path, value in [
        (("prompt_version",), "synthetic-v2"),
        (("preprocessing_version",), "identity-v2"),
        (("generation", "temperature"), "0.2"),
        (("retries", "max_format_repairs"), 2),
        (("reviewer_policy", "max_criteria"), 1),
        (("primary", "model"), "another-test-model"),
        (("corpus_snapshot_id",), "another-corpus"),
    ]:
        data = json.loads(json.dumps(base))
        target = data
        for key in path[:-1]:
            target = target[key]
        target[path[-1]] = value
        assert profile_hash(EvaluatorProfile.model_validate(data)) != VECTORS["profile"]["sha256"]


def test_corpus_hash_excludes_own_hash_and_is_order_insensitive() -> None:
    base = VECTORS["corpus"]["input"]
    data = json.loads(json.dumps(base))
    data["content_hash"] = "9" * 64
    assert corpus_snapshot_hash(CorpusSnapshot.model_validate(data)) == VECTORS["corpus"]["sha256"]
    changed = json.loads(json.dumps(base))
    changed["chunks"][0]["text"] += " Updated."
    assert (
        corpus_snapshot_hash(CorpusSnapshot.model_validate(changed)) != VECTORS["corpus"]["sha256"]
    )
    two = json.loads(json.dumps(base))
    extra = dict(two["chunks"][0], chunk_id="a-first-chunk")
    two["chunks"].append(extra)
    reversed_ = json.loads(json.dumps(two))
    reversed_["chunks"].reverse()
    assert corpus_snapshot_hash(CorpusSnapshot.model_validate(two)) == corpus_snapshot_hash(
        CorpusSnapshot.model_validate(reversed_)
    )


@pytest.mark.parametrize(
    "field",
    [
        "conversation_content_hash",
        "checklist_semantic_hash",
        "profile_hash",
        "corpus_snapshot_hash",
        "audio_content_hash",
    ],
)
def test_every_identity_component_changes_reuse_key(field: str) -> None:
    data = dict(VECTORS["reuse"]["input"])
    data[field] = "a" * 64
    assert (
        evaluation_reuse_key(EvaluationIdentity.model_validate(data)) != VECTORS["reuse"]["sha256"]
    )


def test_canonical_json_rejects_non_finite_numbers() -> None:
    with pytest.raises(ValueError):
        canonical_json({"x": float("nan")})
    with pytest.raises(ValueError):
        canonical_json({"x": Decimal("Infinity")})
