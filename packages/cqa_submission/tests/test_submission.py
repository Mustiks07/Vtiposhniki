"""R-EXPORT-01..08: synthetic cases, not DEV/PROD results or measured accuracy."""

from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal

import cqa_domain as domain
import pytest
from cqa_contracts.models import (
    CallRecord,
    Conversation,
    CorpusSnapshot,
    CriterionProposal,
    EvaluationArtifact,
    EvaluationView,
    EvaluatorProfile,
)
from cqa_contracts.submission import (
    OfficialResults,
    OfficialSuccess,
    SubmissionConfig,
    SubmissionManifest,
)
from cqa_submission.adapter import (
    CRITERION_MAP,
    PreparationError,
    SavedItem,
    atomic_write,
    build_results,
    check_conversation,
    convert,
    load_json,
    safe_rationale,
    turn_hash,
    validate_results,
    write_results,
)
from pydantic import ValidationError

NOW = datetime(2026, 11, 7, tzinfo=UTC)
RAW = [True, None, None, 15, True, 7, True, False]
RATIONALES = [
    "Оператор поздоровался и представился.",
    "Клиент сразу ясно изложил вопрос.",
    "Общий вопрос не требует идентификации.",
    "Основной вопрос решён, упущена деталь.",
    "Вежливо признал неудобство клиента.",
    "Есть повтор, но ход диалога понятен.",
    "Предложил дальнейшую помощь и попрощался.",
    "Грубых нарушений в репликах нет.",
]
TURNS = [[4], [1], [1], [5, 6], [4, 5], [5, 6], [8], [4, 5, 6, 8]]
CONFIG = SubmissionConfig(
    team_name="Synthetic team",
    submission_branch="main",
    checklist_version_id="cqa-original-v1",
    profile_id="synthetic-profile",
    profile_version="1",
)


def make_item(index=0, *, critical=False, partial=False, failed=False):
    conversation = Conversation.model_validate(
        {
            "id": f"internal-{index}",
            "external_id": f"synthetic-{index}",
            "revision": 1,
            "content_hash": "0" * 64,
            "channel": "agent_chat",
            "language": "RU",
            "audio": {"availability": "unavailable", "alignment_status": "unavailable"},
            "messages": [
                {
                    "id": f"m{i:04}",
                    "ordinal": i,
                    "source_index": i - 1,
                    "speaker": speaker,
                    "text": f"Синтетическая реплика {i}.",
                    "timestamp_original": f"00:0{i}",
                }
                for i, speaker in enumerate(
                    [
                        "client",
                        "system",
                        "bot",
                        "operator",
                        "operator",
                        "client",
                        "system",
                        "operator",
                    ],
                    1,
                )
            ],
        }
    )
    conversation = conversation.model_copy(
        update={"content_hash": domain.conversation_content_hash(conversation)}
    )
    corpus = CorpusSnapshot(
        id="synthetic-empty",
        content_hash="0" * 64,
        sources=[],
        chunks=[],
        applicability_policy="Synthetic empty corpus",
        priority_policy="No sources",
    )
    corpus = corpus.model_copy(update={"content_hash": domain.corpus_snapshot_hash(corpus)})
    profile = EvaluatorProfile.model_validate(
        {
            "id": CONFIG.profile_id,
            "version": "1",
            "mode": "production",
            "primary": {
                "provider": "gemini",
                "model": "synthetic-model-not-called",
                "configuration_ref": "unused",
            },
            "generation": {},
            "prompt_version": "cqa-eval-v2",
            "preprocessing_version": "identity-v1",
            "reviewer_policy": {},
            "retries": {},
            "corpus_snapshot_id": corpus.id,
        }
    )
    checklist = domain.original_checklist()
    proposals = []
    for i, c in enumerate(checklist.criteria):
        raw = critical if i == 7 else RAW[i]
        choice = (
            None
            if raw is None
            else next(
                ch.id for ch in c.choices if type(ch.raw_value) is type(raw) and ch.raw_value == raw
            )
        )
        applicability = "not_applicable" if raw is None else "applicable"
        if partial and i == 5:
            choice, applicability = None, "undetermined"
        proposals.append(
            CriterionProposal.model_validate(
                {
                    "criterion_id": c.id,
                    "answer_choice_id": choice,
                    "applicability": applicability,
                    "rationale": RATIONALES[i],
                    "origin": "ai",
                    "reason_codes": [
                        "not_applicable" if applicability == "not_applicable" else "other"
                    ],
                    "evidence": [
                        {
                            "kind": "message",
                            "message_ids": [f"m{t:04}" for t in TURNS[i]],
                            "relation": "support",
                            "explanation": "Синтетическое подтверждение.",
                        }
                    ],
                }
            )
        )
    call = CallRecord(
        call_id=f"call-{index}",
        attempt_id=f"attempt-{index}",
        purpose="primary",
        requested=profile.primary,
        actual=profile.primary,
        started_at=NOW,
        finished_at=NOW,
        outcome="succeeded",
        finish_reason="stop",
    )
    artifact = EvaluationArtifact.model_validate(
        {
            "status": "partial" if partial else "complete",
            "initial": proposals,
            "reviews": [],
            "automatic_final": proposals,
            "calls": [call],
            "evaluator_mode": "production",
            "identity": {
                "conversation_content_hash": conversation.content_hash,
                "checklist_semantic_hash": checklist.semantic_hash,
                "profile_hash": domain.profile_hash(profile),
                "corpus_snapshot_hash": corpus.content_hash,
            },
        }
    )
    automatic = domain.score(checklist, proposals)
    view = EvaluationView.model_validate(
        {
            "id": f"eval-{index}",
            "conversation_id": conversation.id,
            "conversation_revision": 1,
            "checklist_version_id": checklist.version_id,
            "profile_id": profile.id,
            "profile_version": "1",
            "corpus_snapshot_id": corpus.id,
            "created_at": NOW,
            "revision": 1,
            "artifact": artifact,
            "automatic_score": automatic,
            "effective_score": automatic,
            "effective_proposals": proposals,
            "human_decisions": [],
            "source_fragments": [],
            "reuse": {"mode": "fresh", "reused_from_evaluation_id": None, "reuse_key": "0" * 64},
        }
    )
    from cqa_contracts.submission import SubmissionEntry

    entry = SubmissionEntry(
        external_id=conversation.external_id,
        channel=conversation.channel,
        language=conversation.language,
        conversation_id=conversation.id,
        revision=1,
        turn_hashes=[
            turn_hash(m.speaker, m.text, m.timestamp_original) for m in conversation.messages
        ],
    )
    return SavedItem(
        entry,
        conversation,
        checklist,
        profile,
        corpus,
        "failed" if failed else "succeeded",
        None if failed else view,
        [call],
    )


def dataset():
    items = [make_item(i) for i in range(10)]
    manifest = SubmissionManifest(
        dataset="prod", source_sha256="0" * 64, entries=[i.entry for i in items]
    )
    return items, manifest


def test_pdf_example_exact_raw_steps_and_domain_arithmetic():
    item = make_item()
    result = convert(item, CONFIG)
    assert isinstance(result, OfficialSuccess)
    assert [c.value for c in result.criteria] == RAW
    assert [c.criterion_id for c in result.criteria] == list(CRITERION_MAP.values())
    assert [c.rationale for c in result.criteria] == RATIONALES
    assert [c.evidence_turns for c in result.criteria] == TURNS
    assert result.score.final_score == 85.38
    assert type(result.criteria[5].value) is int and result.criteria[5].value == 7
    assert sum(
        c.applicable_weight for c in item.evaluation.automatic_score.contributions
    ) == Decimal(65)
    assert sum(c.earned_weight for c in item.evaluation.automatic_score.contributions) == Decimal(
        "55.5"
    )
    assert '"final_score":85.38' in result.model_dump_json()


@pytest.mark.parametrize(
    "index,value",
    [
        (0, 1),
        (0, "true"),
        (0, None),
        (5, True),
        (5, 7.0),
        (5, "7"),
        (5, 10.5),
        (3, False),
        (3, 0.75),
        (7, None),
    ],
)
def test_strict_json_types(index, value):
    data = convert(make_item(), CONFIG).model_dump(mode="json")
    data["criteria"][index]["value"] = value
    with pytest.raises(ValidationError):
        OfficialSuccess.model_validate(data)


def test_range_uses_all_original_turns_and_deduplicates():
    item = make_item()
    data = item.evaluation.model_dump(mode="json")
    evidence = [
        {
            "kind": "range",
            "start_message_id": "m0001",
            "end_message_id": "m0004",
            "relation": "context",
            "explanation": "Полный контекст с ботом и событием.",
        },
        {
            "kind": "message",
            "message_ids": ["m0004"],
            "relation": "support",
            "explanation": "Ответ.",
        },
    ]
    for key in ("initial", "automatic_final"):
        data["artifact"][key][0]["evidence"] = evidence
    result = convert(replace(item, evaluation=EvaluationView.model_validate(data)), CONFIG)
    assert result.criteria[0].evidence_turns == [1, 2, 3, 4]
    # Iteration order can differ; original source_index/ordinal and turn hashes remain authoritative.
    changed = item.conversation.model_copy(
        update={"messages": list(reversed(item.conversation.messages))}
    )
    changed = changed.model_copy(update={"content_hash": domain.conversation_content_hash(changed)})
    check_conversation(item.entry, changed)
    bad = changed.model_copy(update={"messages": changed.messages[:-1]})
    with pytest.raises(PreparationError, match="mapping"):
        check_conversation(item.entry, bad)


def test_critical_does_not_zero_score():
    result = convert(make_item(critical=True), CONFIG)
    assert result.score.critical_flag is True
    assert result.score.final_score == 85.38


@pytest.mark.parametrize("kwargs", [{"partial": True}, {"failed": True}])
def test_partial_and_failed_are_explicit_error_without_mutating_internal_state(kwargs):
    item = make_item(**kwargs)
    before = item.evaluation.model_dump_json() if item.evaluation else None
    result = convert(item, CONFIG)
    assert result.status == "error" and result.criteria == [] and result.score is None
    assert (item.evaluation.model_dump_json() if item.evaluation else None) == before


@pytest.mark.parametrize("kind", ["nine", "eleven", "wrong", "duplicate"])
def test_exact_manifest_ids_not_just_ten(kind):
    items, manifest = dataset()
    payload = build_results(items, CONFIG, manifest).model_dump(mode="json")
    if kind == "nine":
        payload["results"].pop()
    if kind == "eleven":
        payload["results"].append(convert(make_item(10), CONFIG).model_dump(mode="json"))
    if kind == "wrong":
        for r in payload["results"]:
            r["conversation_id"] += "-wrong"
    if kind == "duplicate":
        payload["results"][0]["conversation_id"] = payload["results"][1]["conversation_id"]
    with pytest.raises((PreparationError, ValidationError)):
        validate_results(OfficialResults.model_validate(payload), manifest)


def test_effective_overrides_never_change_submission():
    item = make_item()
    edited = item.evaluation.model_copy(
        update={
            "effective_score": item.evaluation.effective_score.model_copy(
                update={"total_score": Decimal(0)}
            ),
            "effective_proposals": [],
        }
    )
    assert convert(replace(item, evaluation=edited), CONFIG) == convert(item, CONFIG)


def test_actual_models_include_reviewer_and_fallback_not_unused_configuration():
    items, manifest = dataset()
    call = items[0].calls[0]
    extra = [
        call.model_copy(
            update={
                "call_id": name,
                "purpose": purpose,
                "actual": call.actual.model_copy(update={"model": name}),
            }
        )
        for name, purpose in [("actual-reviewer", "review"), ("actual-fallback", "fallback")]
    ]
    items[0] = replace(items[0], calls=[*items[0].calls, *extra])
    result = build_results(items, CONFIG, manifest)
    assert result.model.mode == "external_api"
    assert result.model.name == "actual-fallback; actual-reviewer; synthetic-model-not-called"
    assert (
        safe_rationale("Оператор Иван проверил email a@b.kz и +7 777 123 45 67.", ["Иван"])
        == "Оператор [данные скрыты] проверил email [данные скрыты] и [данные скрыты]"
    )


def test_atomic_utf8_output_requires_exact_review_hash_and_keeps_previous_on_failure(tmp_path):
    items, manifest = dataset()
    result = build_results(items, CONFIG, manifest)
    candidate = tmp_path / "private" / "candidate.json"
    fingerprint = write_results(candidate, result, manifest)
    target = tmp_path / "results" / "prod" / "results.json"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"previous verified result")
    with pytest.raises(PreparationError, match="review"):
        write_results(target, result, manifest)
    assert target.read_bytes() == b"previous verified result"
    write_results(target, result, manifest, reviewed_sha256=fingerprint)
    assert target.read_bytes() == candidate.read_bytes()
    assert "Оператор" in target.read_text(encoding="utf-8")
    bad = result.model_copy(update={"results": result.results[:-1]})
    with pytest.raises(PreparationError):
        write_results(target, bad, manifest, reviewed_sha256=fingerprint)
    assert target.read_bytes() == candidate.read_bytes()


@pytest.mark.parametrize(
    "mutation", ["definition", "weight", "scale", "na", "revision", "profile_hash", "score"]
)
def test_mismatch_is_preparation_error_not_fake_evaluation_failure(mutation):
    item = make_item()
    if mutation in {"definition", "weight", "scale", "na"}:
        changes = {
            "definition": {"definition": "Changed meaning"},
            "weight": {"weight": Decimal(11)},
            "scale": {"choices": item.checklist.criteria[0].choices[:1]},
            "na": {"allow_na": True, "na_condition": "Changed"},
        }
        criteria = list(item.checklist.criteria)
        criteria[0] = criteria[0].model_copy(update=changes[mutation])
        item = replace(item, checklist=item.checklist.model_copy(update={"criteria": criteria}))
    elif mutation == "revision":
        item = replace(item, entry=item.entry.model_copy(update={"revision": 2}))
    elif mutation == "profile_hash":
        artifact = item.evaluation.artifact.model_copy(
            update={
                "identity": item.evaluation.artifact.identity.model_copy(
                    update={"profile_hash": "f" * 64}
                )
            }
        )
        item = replace(item, evaluation=item.evaluation.model_copy(update={"artifact": artifact}))
    else:
        item = replace(
            item,
            evaluation=item.evaluation.model_copy(
                update={
                    "automatic_score": item.evaluation.automatic_score.model_copy(
                        update={"total_score": Decimal(0)}
                    )
                }
            ),
        )
    with pytest.raises((PreparationError, domain.errors.DomainValidationError)):
        convert(item, CONFIG)


def test_duplicate_json_keys_rejected_and_atomic_failure_preserves_old_file(tmp_path, monkeypatch):
    path = tmp_path / "file.json"
    path.write_text('{"schema_version":"1.0","schema_version":"2.0"}', encoding="utf-8")
    with pytest.raises(PreparationError):
        load_json(path)
    before = path.read_bytes()

    def fail(*args):
        raise OSError("synthetic disk failure")

    monkeypatch.setattr("cqa_submission.adapter.os.replace", fail)
    with pytest.raises(OSError):
        atomic_write(path, b"new")
    assert path.read_bytes() == before
    assert [p.name for p in tmp_path.iterdir()] == ["file.json"]


@pytest.mark.parametrize("value", [True, "85.38", 85.381, float("nan"), 101, -1])
def test_final_score_is_finite_json_number_rounded_to_cents(value):
    data = convert(make_item(), CONFIG).model_dump(mode="json")
    data["score"]["final_score"] = value
    with pytest.raises(ValidationError):
        OfficialSuccess.model_validate(data)


def test_unfinished_requires_explicit_error_policy_and_unknown_model_cannot_be_invented():
    items, manifest = dataset()
    items[0] = replace(items[0], state="running", evaluation=None)
    with pytest.raises(PreparationError, match="unfinished"):
        build_results(items, CONFIG, manifest)
    assert (
        build_results(items, CONFIG, manifest, allow_unfinished=True).results[0].status == "error"
    )
    items = [replace(i, calls=[]) for i in items]
    with pytest.raises(PreparationError, match="actual_model"):
        build_results(items, CONFIG, manifest, allow_unfinished=True)


def test_standalone_validator_rejects_wrong_score_and_out_of_bounds_evidence():
    items, manifest = dataset()
    data = build_results(items, CONFIG, manifest).model_dump(mode="json")
    data["results"][0]["score"]["final_score"] = 12.34
    with pytest.raises(PreparationError, match="raw_values"):
        validate_results(OfficialResults.model_validate(data), manifest)
    data["results"][0]["score"]["final_score"] = 85.38
    data["results"][0]["criteria"][0]["evidence_turns"] = [9]
    with pytest.raises(PreparationError, match="bounds"):
        validate_results(OfficialResults.model_validate(data), manifest)


def test_generated_official_schema_and_pdf_synthetic_fixture():
    from pathlib import Path

    from jsonschema import Draft202012Validator

    root = Path(__file__).resolve().parents[3]
    schema = load_json(root / "contracts/organizer-results.schema.json")
    fixture = load_json(root / "fixtures/submission/pdf-example.synthetic.json")
    Draft202012Validator(schema).validate(fixture)
    result = OfficialResults.model_validate(fixture)
    expected = convert(make_item(), CONFIG).model_dump(mode="json")
    expected["conversation_id"] = "demo-001"
    assert result.results[0].model_dump(mode="json") == expected


def test_name_redaction_does_not_change_other_words():
    assert (
        safe_rationale("Лиза: реализация выполнена.", ["Лиза"])
        == "[данные скрыты]: реализация выполнена."
    )
