"""Loss-aware conversion of pinned automatic evaluations to organizer JSON."""

import hashlib
import json
import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cqa_domain as domain
from cqa_contracts.models import (
    CallRecord,
    ChecklistVersion,
    Conversation,
    CorpusSnapshot,
    EvaluationView,
    EvaluatorProfile,
    ReasonCode,
)
from cqa_contracts.submission import (
    OFFICIAL_CODES,
    OfficialError,
    OfficialResults,
    OfficialSuccess,
    SubmissionConfig,
    SubmissionEntry,
    SubmissionManifest,
)

# Explicit mapping, never inferred from display titles or array position.
CRITERION_MAP = dict(
    zip(
        (
            "c1_contact",
            "c2_needs",
            "c3_identification",
            "c4_consultation",
            "c5_empathy",
            "c6_dialog_management",
            "c7_closing",
            "c8_gross_errors",
        ),
        OFFICIAL_CODES,
        strict=True,
    )
)
TERMINAL = {"succeeded", "failed", "cancelled"}
SENSITIVE = re.compile(
    r"https?://\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}"
    r"|(?:\+?\d[\s().-]*){7,}"
    r"|\b(?:sk-[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]+|AQ\.[A-Za-z0-9_-]{25,})",
    re.IGNORECASE,
)


class PreparationError(ValueError):
    """Safe diagnostics only: never include private text or upstream error bodies."""


def digest(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    ).hexdigest()


def turn_hash(speaker: str, text: str, timestamp: str) -> str:
    return digest([speaker, text, timestamp])


def load_json(path: Path) -> Any:
    def unique(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise PreparationError("duplicate_json_key")
            result[key] = value
        return result

    def nonfinite(_value: str) -> None:
        raise PreparationError("nonfinite_json_number")

    return json.loads(
        path.read_text(encoding="utf-8"), object_pairs_hook=unique, parse_constant=nonfinite
    )


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")


def atomic_write(path: Path, payload: bytes) -> None:
    """Same-directory replace, only after the caller has fully validated payload."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=path.parent, prefix=f".{path.name}.", delete=False
        ) as f:
            temporary = f.name
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporary, path)
        temporary = None
    finally:
        if temporary is not None:
            Path(temporary).unlink(missing_ok=True)


def check_rubric(checklist: ChecklistVersion, version_id: str) -> None:
    original = domain.original_checklist()
    allowed_scoring = {
        original.scoring_config_hash,
        domain.sectioned_original_checklist().scoring_config_hash,
    }
    domain.validate_checklist(checklist)
    if checklist.version_id != version_id:
        raise PreparationError("wrong_pinned_checklist_version")
    if (
        domain.checklist_semantic_hash(checklist) != original.semantic_hash
        or domain.checklist_scoring_hash(checklist) not in allowed_scoring
    ):
        raise PreparationError("checklist_is_not_the_official_rubric")
    if checklist.semantic_hash != domain.checklist_semantic_hash(
        checklist
    ) or checklist.scoring_config_hash != domain.checklist_scoring_hash(checklist):
        raise PreparationError("checklist_hash_mismatch")


def check_conversation(entry: SubmissionEntry, conversation: Conversation) -> None:
    if (
        conversation.external_id != entry.external_id
        or conversation.id != entry.conversation_id
        or conversation.revision != entry.revision
        or conversation.channel != entry.channel
        or conversation.language != entry.language
    ):
        raise PreparationError("conversation_identity_or_revision_mismatch")
    messages = sorted(conversation.messages, key=lambda m: m.source_index)
    if (
        [m.source_index for m in messages] != list(range(len(entry.turn_hashes)))
        or len({m.id for m in messages}) != len(messages)
        or any(m.ordinal != m.source_index + 1 for m in messages)
    ):
        raise PreparationError("original_turn_mapping_not_lossless")
    hashes = [turn_hash(m.speaker, m.text, m.timestamp_original) for m in messages]
    if hashes != entry.turn_hashes:
        raise PreparationError("original_transcript_mismatch")
    if conversation.content_hash != domain.conversation_content_hash(conversation):
        raise PreparationError("conversation_hash_mismatch")


def safe_rationale(text: str, redactions: list[str]) -> str:
    # Redactions remove identifying substrings; they never invent new reasoning.
    for value in sorted(redactions, key=len, reverse=True):
        text = re.sub(
            r"(?<!\w)" + re.escape(value) + r"(?!\w)", "[данные скрыты]", text, flags=re.IGNORECASE
        )
    text = SENSITIVE.sub("[данные скрыты]", text)
    text = " ".join(text.split())
    if not text or len(text) > 600:
        raise PreparationError("rationale_requires_safe_shortening")
    return text


@dataclass(frozen=True)
class SavedItem:
    entry: SubmissionEntry
    conversation: Conversation
    checklist: ChecklistVersion
    profile: EvaluatorProfile
    corpus: CorpusSnapshot
    state: str
    evaluation: EvaluationView | None
    calls: list[CallRecord]


def convert(
    item: SavedItem, config: SubmissionConfig, *, allow_unfinished: bool = False
) -> OfficialSuccess | OfficialError:
    check_rubric(item.checklist, config.checklist_version_id)
    check_conversation(item.entry, item.conversation)
    if (
        item.profile.mode != "production"
        or item.profile.id != config.profile_id
        or item.profile.version != config.profile_version
    ):
        raise PreparationError("wrong_or_test_profile")

    def failed(message: str) -> OfficialError:
        return OfficialError(
            conversation_id=item.entry.external_id,
            status="error",
            criteria=[],
            score=None,
            error=message,
        )

    if item.state not in TERMINAL:
        if not allow_unfinished:
            raise PreparationError("unfinished_jobs_wait_or_explicitly_export_errors")
        return failed("Обработка не завершена к моменту выгрузки.")
    view = item.evaluation
    if view is not None:
        if (
            view.conversation_id != item.conversation.id
            or view.conversation_revision != item.conversation.revision
            or view.checklist_version_id != item.checklist.version_id
            or view.profile_id != item.profile.id
            or view.profile_version != item.profile.version
            or view.corpus_snapshot_id != item.corpus.id
        ):
            raise PreparationError("evaluation_pinned_identity_mismatch")
        artifact = view.artifact
        if artifact.evaluator_mode != "production":
            raise PreparationError("test_evaluation_cannot_be_submitted")
        if artifact.identity.profile_hash != domain.profile_hash(item.profile):
            raise PreparationError("evaluation_profile_hash_mismatch")
        domain.validate_artifact(item.conversation, item.checklist, item.corpus, artifact)
    if item.state != "succeeded" or view is None or view.artifact.status == "failed":
        return failed("Не удалось получить полноценную оценку модели.")
    if view.artifact.status == "partial" or any(
        p.applicability == "undetermined" for p in view.artifact.automatic_final
    ):
        return failed("Автоматическая оценка неполная: не определены все восемь критериев.")
    score = domain.score(item.checklist, view.artifact.automatic_final)
    if score != view.automatic_score or score.total_score is None:
        raise PreparationError("stored_automatic_score_mismatch")
    by_id = {c.id: c for c in item.checklist.criteria}
    proposals = {p.criterion_id: p for p in view.artifact.automatic_final}
    indices = {m.id: m.source_index + 1 for m in item.conversation.messages}
    criteria = []
    for internal, official in CRITERION_MAP.items():
        p, criterion = proposals[internal], by_id[internal]
        if p.origin != "ai":
            raise PreparationError("non_ai_proposal")
        value: bool | int | float | str | None
        if p.applicability == "not_applicable":
            if not criterion.allow_na or ReasonCode.NOT_APPLICABLE not in p.reason_codes:
                raise PreparationError("unjustified_not_applicable")
            value = None
        else:
            value = next(c.raw_value for c in criterion.choices if c.id == p.answer_choice_id)
        turns: set[int] = set()
        for evidence in p.evidence:
            if evidence.kind == "message":
                if not set(evidence.message_ids) <= indices.keys():
                    raise PreparationError("evidence_message_not_in_original")
                turns.update(indices[mid] for mid in evidence.message_ids)
            elif evidence.kind == "range":
                start, end = (
                    indices.get(evidence.start_message_id or ""),
                    indices.get(evidence.end_message_id or ""),
                )
                if start is None or end is None or start > end:
                    raise PreparationError("evidence_range_not_in_original")
                turns.update(range(start, end + 1))
            # Source evidence is not a transcript turn.
        if not turns:
            raise PreparationError("no_original_turn_evidence")
        criteria.append(
            {
                "criterion_id": official,
                "value": value,
                "rationale": safe_rationale(p.rationale, config.redactions),
                "evidence_turns": sorted(turns),
            }
        )
    flag = next(f.detected for f in score.flags if f.criterion_id == "c8_gross_errors")
    return OfficialSuccess.model_validate(
        {
            "conversation_id": item.entry.external_id,
            "status": "ok",
            "criteria": criteria,
            "score": {"final_score": float(score.total_score), "critical_flag": flag},
        }
    )


def build_results(
    items: list[SavedItem],
    config: SubmissionConfig,
    manifest: SubmissionManifest,
    *,
    allow_unfinished: bool = False,
    item_configs: list[SubmissionConfig] | None = None,
) -> OfficialResults:
    if [i.entry for i in items] != manifest.entries:
        raise PreparationError("saved_items_do_not_match_manifest_order")
    configs = item_configs if item_configs is not None else [config] * len(items)
    if len(configs) != len(items) or any(
        (c.team_name, c.submission_branch, c.checklist_version_id)
        != (config.team_name, config.submission_branch, config.checklist_version_id)
        for c in configs
    ):
        raise PreparationError("mixed_execution_configs_do_not_match_submission")
    names = set()
    for item in items:
        for call in item.calls:
            if call.actual is None:
                continue  # A configured/requested model is not proof of an actual model.
            if call.actual.provider not in {"gemini", "deepseek", "openrouter", "xerosharc", "basisweb"}:
                raise PreparationError("unsupported_actual_provider")
            if SENSITIVE.search(call.actual.model):
                raise PreparationError("unsafe_actual_model_name")
            names.add(call.actual.model)
    if not names:
        raise PreparationError("no_confirmed_actual_model_in_call_log")
    result = OfficialResults.model_validate(
        {
            "schema_version": "1.0",
            "team_name": config.team_name,
            "model": {"mode": "external_api", "name": "; ".join(sorted(names))},
            "results": [
                convert(i, c, allow_unfinished=allow_unfinished)
                for i, c in zip(items, configs, strict=True)
            ],
        }
    )
    validate_results(result, manifest)
    return result


def validate_results(result: OfficialResults, manifest: SubmissionManifest) -> None:
    if [r.conversation_id for r in result.results] != [e.external_id for e in manifest.entries]:
        raise PreparationError("result_ids_or_order_do_not_match_source_manifest")
    rubric = domain.original_checklist()
    for row, entry in zip(result.results, manifest.entries, strict=True):
        if row.status == "error":
            if SENSITIVE.search(row.error):
                raise PreparationError("unsafe_error_text")
            continue
        # Reuse the domain scorer for standalone validation too: never a second formula.
        proposals = []
        by_code = {c.criterion_id: c for c in row.criteria}
        from cqa_contracts.models import CriterionProposal

        for criterion in rubric.criteria:
            c = next(
                value for code, value in by_code.items() if code == CRITERION_MAP[criterion.id]
            )
            if any(t > len(entry.turn_hashes) for t in c.evidence_turns) or not c.evidence_turns:
                raise PreparationError("evidence_turn_out_of_bounds_or_empty")
            if SENSITIVE.search(c.rationale):
                raise PreparationError("unsafe_rationale")
            choice = (
                None
                if c.value is None
                else next(
                    ch.id
                    for ch in criterion.choices
                    if type(ch.raw_value) is type(c.value) and ch.raw_value == c.value
                )
            )
            proposals.append(
                CriterionProposal(
                    criterion_id=criterion.id,
                    applicability="not_applicable" if c.value is None else "applicable",
                    answer_choice_id=choice,
                    rationale=c.rationale,
                    reason_codes=[
                        ReasonCode.NOT_APPLICABLE if c.value is None else ReasonCode.OTHER
                    ],
                    evidence=[],
                    origin="ai",
                )
            )
        expected = domain.score(rubric, proposals)
        if row.score.final_score != float(expected.total_score or 0):
            raise PreparationError("final_score_does_not_match_raw_values")


def write_results(
    path: Path,
    result: OfficialResults,
    manifest: SubmissionManifest,
    *,
    reviewed_sha256: str | None = None,
) -> str:
    validated = OfficialResults.model_validate_json(json_bytes(result.model_dump(mode="json")))
    validate_results(validated, manifest)
    payload = json_bytes(validated.model_dump(mode="json"))
    fingerprint = hashlib.sha256(payload).hexdigest()
    if "results" in path.resolve().parts:
        if path.parent.name != manifest.dataset or path.name != "results.json":
            raise PreparationError("wrong_official_output_path")
        if reviewed_sha256 != fingerprint:
            raise PreparationError("review_candidate_rationales_then_pass_its_sha256")
    atomic_write(path, payload)
    return fingerprint
