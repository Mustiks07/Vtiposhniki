"""Build synthetic wire examples; no domain scoring or hashing is implemented here."""

import argparse
import json
from pathlib import Path

from cqa_contracts import http_models as h
from cqa_contracts import models as m

ROOT = Path(__file__).resolve().parents[1]
NOW = "2026-11-07T00:00:00Z"
LATER = "2026-11-07T00:00:01Z"
DEADLINE = "2026-11-07T00:05:00Z"
HASH = "1" * 64  # Typed placeholders, NOT canonical hash test vectors.
FIXTURES: dict[str, tuple[m.DTO, str]] = {}


def add(name: str, model: type[m.DTO], data: dict, description: str) -> m.DTO:
    value = model.model_validate(data)
    FIXTURES[name] = value, description
    return value


def choice(id: str, raw: bool | int, fraction: str | None) -> dict:
    return dict(
        id=id, label=id, raw_value=raw, anchor=f"Synthetic anchor: {id}", score_fraction=fraction
    )


def criterion(id: str, kind: str, weight: str, choices: list[dict], allow_na: bool = False) -> dict:
    return dict(
        id=id,
        title=f"Synthetic {id}",
        definition="Illustrative contract criterion only.",
        response_type=kind,
        choices=choices,
        allow_na=allow_na,
        na_condition="No synthetic request was made." if allow_na else None,
        channel_instructions={},
        evidence_policy={},
        requires_reference=False,
        weight=weight,
        section_id="synthetic-section" if kind != "flag" else None,
        flag_when_choice_ids=["yes"] if kind == "flag" else [],
    )


def evidence(kind: str = "range") -> dict:
    base = dict(
        kind=kind,
        relation="support",
        explanation="Synthetic checked excerpt; no real conversation.",
    )
    if kind == "message":
        return base | dict(message_ids=["m0002"])
    if kind == "source":
        return base | dict(source_chunk_id="synthetic-chunk")
    return base | dict(start_message_id="m0001", end_message_id="m0003")


def proposal(
    id: str,
    answer: str | None,
    *,
    applicability: str = "applicable",
    reason: str = "criteria_met",
    origin: str = "test",
    kind: str = "message",
) -> dict:
    return dict(
        criterion_id=id,
        applicability=applicability,
        answer_choice_id=answer,
        rationale="SYNTHETIC TEST: illustrative explanation, not an AI assessment.",
        reason_codes=[reason],
        evidence=[evidence(kind)],
        limitations=["test_evaluator"],
        review_reasons=[],
        origin=origin,
    )


def contribution(
    id: str,
    answer: str | None,
    raw: bool | int | None,
    fraction: str | None,
    weight: str,
    earned: str | None,
    applicable_weight: str,
    normalized: str | None,
    applicability: str = "applicable",
) -> dict:
    return dict(
        criterion_id=id,
        answer_choice_id=answer,
        raw_value=raw,
        score_fraction=fraction,
        original_weight=weight,
        earned_weight=earned,
        applicable_weight=applicable_weight,
        normalized_contribution=normalized,
        applicability=applicability,
    )


def score(
    total: str | None,
    binary: dict,
    scale: dict,
    *,
    flag: bool | None = False,
    earned: str = "70",
    applicable: str = "100",
    status: str | None = None,
) -> dict:
    # These values are deliberately supplied constants. This is not an arithmetic oracle.
    return dict(
        status=status or ("complete" if total is not None else "incomplete_evaluation"),
        total_score=total,
        contributions=[binary, scale],
        section_results=[
            dict(
                section_id="synthetic-section",
                section_earned_weight=earned,
                section_applicable_weight=applicable,
                section_percent=total,
            )
        ],
        flags=[
            dict(
                criterion_id="synthetic-flag",
                detected=flag,
                answer_choice_id=None if flag is None else ("yes" if flag else "no"),
            )
        ],
    )


def build() -> None:
    FIXTURES.clear()
    conversation = add(
        "conversation-chat",
        m.Conversation,
        dict(
            id="synthetic-conversation",
            external_id="synthetic-external",
            revision=1,
            content_hash=HASH,
            channel="agent_chat",
            language="RU",
            occurred_at=None,
            messages=[
                dict(
                    id=f"m{i:04d}",
                    ordinal=i,
                    source_index=i - 1,
                    speaker=role,
                    text=text,
                    timestamp_original=timestamp,
                    parsed_time=None,
                )
                for i, (role, text, timestamp) in enumerate(
                    [
                        ("client", "Учебный вопрос о вымышленном сервисе.", "00:01"),
                        (
                            "operator",
                            "Здравствуйте. Учебный ответ. Бұл синтетикалық мысал. Synthetic example.",
                            "00:05",
                        ),
                        ("client", "Спасибо за учебный ответ.", "00:09"),
                    ],
                    1,
                )
            ],
            audio=dict(availability="unavailable", alignment_status="unavailable"),
            warnings=[],
        ),
        "Entirely invented three-message chat; original MM:SS remains undated.",
    )
    na_conversation = conversation.model_dump(mode="json") | dict(id="synthetic-conversation-na")
    na_conversation["messages"][0]["text"] = "Соединение установлено; вопрос ещё не сформулирован."
    na_conversation["messages"][1]["text"] = "Здравствуйте. Какой у вас учебный вопрос?"
    na_conversation["messages"][2]["text"] = "Учебный разговор завершён до вопроса."
    add(
        "conversation-na",
        m.Conversation,
        na_conversation,
        "Companion input for artifact-na: no request was formulated.",
    )
    missing_conversation = conversation.model_dump(mode="json") | dict(
        id="synthetic-conversation-missing-action"
    )
    missing_conversation["messages"][1]["text"] = "Учебный ответ без приветствия."
    add(
        "conversation-missing-action",
        m.Conversation,
        missing_conversation,
        "Companion input for missing-action: full range contains no operator greeting.",
    )
    for state, alignment in [("unavailable", "unavailable"), ("unknown", "unverified")]:
        data = conversation.model_dump(mode="json") | dict(
            id=f"synthetic-voice-{alignment}", channel="voice_call"
        )
        data["audio"] = dict(availability=state, alignment_status=alignment, mapping=None)
        data["warnings"] = ["Synthetic audio state; no audio recording is provided."]
        add(
            f"conversation-voice-{alignment}",
            m.Conversation,
            data,
            "No invented seek mapping or signed audio URL.",
        )

    binary = criterion(
        "synthetic-binary", "binary", "40", [choice("yes", True, "1"), choice("no", False, "0")]
    )
    binary["definition"] = (
        "The first operator reply contains a greeting. Check the full range when it is missing."
    )
    scale = criterion(
        "synthetic-scale",
        "scale",
        "60",
        [choice("high", 2, "1"), choice("middle", 1, "0.5"), choice("low", 0, "0")],
        True,
    )
    flag = criterion(
        "synthetic-flag", "flag", "0", [choice("yes", True, None), choice("no", False, None)]
    )
    checklist = add(
        "checklist-custom",
        m.ChecklistVersion,
        dict(
            checklist_id="synthetic-checklist",
            version_id="synthetic-checklist-v1",
            title="Synthetic three-criterion checklist",
            criteria=[binary, scale, flag],
            sections=[dict(id="synthetic-section", title="Synthetic section")],
            semantic_hash=HASH,
            scoring_config_hash=HASH,
            created_at=NOW,
        ),
        "Custom binary/scale/flag fixture; explicitly NOT the official eight-criterion rubric.",
    )
    unfamiliar = criterion(
        "custom-followup-unknown-to-code",
        "scale",
        "7",
        [choice("a", 10, "0"), choice("b", 1, "1")],
        True,
    )
    add(
        "criterion-unfamiliar",
        m.Criterion,
        unfamiliar,
        "Unfamiliar criterion with explicit reverse nonzero scale.",
    )
    add(
        "checklist-unfamiliar",
        m.ChecklistVersion,
        checklist.model_dump(mode="json")
        | dict(version_id="synthetic-checklist-v2", criteria=[binary, scale, flag, unfamiliar]),
        "Additional criterion demonstrates schema independence from original eight IDs.",
    )

    source = dict(
        source_id="synthetic-source",
        version="v1",
        content_hash=HASH,
        provenance="synthetic",
        title="Invented fixture source",
        safe_url=None,
        locator="fixture section 1",
        retrieved_at=NOW,
    )
    chunk = dict(
        chunk_id="synthetic-chunk",
        source_id="synthetic-source",
        source_version="v1",
        text="This invented source says that the imaginary service has a help screen.",
        content_hash=HASH,
        locator="fixture section 1",
    )
    corpus = add(
        "corpus-synthetic",
        m.CorpusSnapshot,
        dict(
            id="synthetic-corpus",
            content_hash=HASH,
            sources=[source],
            chunks=[chunk],
            applicability_policy="Synthetic fixtures only.",
            priority_policy="One synthetic source; not an organizer or product authority.",
        ),
        "Safe invented source and chunk.",
    )
    add(
        "corpus-empty",
        m.CorpusSnapshot,
        dict(
            id="synthetic-empty",
            content_hash="0" * 64,
            sources=[],
            chunks=[],
            applicability_policy="No sources available.",
            priority_policy="No source priority.",
        ),
        "Empty corpus is representable.",
    )
    provider = dict(
        provider="test", model="synthetic-contract-v1", configuration_ref="synthetic-only"
    )
    add(
        "profile-test",
        m.EvaluatorProfile,
        dict(
            id="synthetic-profile",
            version="v1",
            mode="test",
            primary=provider,
            generation={},
            prompt_version="synthetic-v1",
            preprocessing_version="identity-v1",
            reviewer_policy={},
            retries={},
            corpus_snapshot_id=corpus.id,
        ),
        "Explicitly test-only provider and finite retry limits.",
    )
    budget = add(
        "execution-budget",
        m.ExecutionBudget,
        dict(
            logical_job_id="synthetic-job",
            attempt_id="synthetic-attempt-1",
            max_provider_calls=8,
            consumed_calls=1,
            deadline_at=DEADLINE,
            max_total_tokens=65536,
            consumed_tokens=None,
            max_cost=None,
            consumed_cost=None,
            usage_complete=False,
        ),
        "Job-wide budget; unknown usage/cost stays null.",
    )
    call = dict(
        call_id="synthetic-call",
        attempt_id="synthetic-attempt-1",
        purpose="primary",
        requested=provider,
        actual=provider,
        started_at=NOW,
        finished_at=LATER,
        outcome="succeeded",
        finish_reason="stop",
    )
    add(
        "call-record",
        m.CallRecord,
        call,
        "Synthetic call with unknown usage and cost, never claimed as a real free call.",
    )
    for event in ["call_started", "call_finished"]:
        record = (
            call
            if event == "call_finished"
            else call | dict(outcome="started", finished_at=None, finish_reason=None)
        )
        add(
            event.replace("_", "-"),
            m.CallEvent,
            dict(
                event=event,
                logical_job_id="synthetic-job",
                attempt_id="synthetic-attempt-1",
                call_id="synthetic-call",
                record=record,
            ),
            "Awaitable observer event contract.",
        )
    identity = dict(
        conversation_content_hash=HASH,
        checklist_semantic_hash=HASH,
        profile_hash=HASH,
        corpus_snapshot_hash=HASH,
    )
    proposals = [
        proposal("synthetic-binary", "yes"),
        proposal("synthetic-scale", "middle", reason="criteria_partially_met"),
        proposal("synthetic-flag", "no", reason="no_violation_detected", kind="range"),
    ]

    def artifact(
        name: str, selected: list[dict], status: str = "complete", **changes: object
    ) -> m.DTO:
        return add(
            name,
            m.EvaluationArtifact,
            dict(
                status=status,
                initial=selected,
                automatic_final=selected,
                reviews=[],
                calls=[call],
                identity=identity,
                limitations=["test_evaluator"],
                evaluator_mode="test",
            )
            | changes,
            "Synthetic artifact shape; no semantic evaluation or domain arithmetic has run.",
        )

    complete = artifact("artifact-complete", proposals)
    na = [
        proposals[0],
        proposal(
            "synthetic-scale",
            None,
            applicability="not_applicable",
            reason="not_applicable",
            kind="range",
        ),
        proposals[2],
    ]
    artifact("artifact-na", na)
    missing = [
        proposal("synthetic-binary", "no", reason="missing_expected_action", kind="range"),
        *proposals[1:],
    ]
    artifact("artifact-missing-action", missing)
    partial_proposals = [
        proposals[0],
        proposal(
            "synthetic-scale",
            None,
            applicability="undetermined",
            reason="insufficient_evidence",
            kind="range",
        ),
        proposals[2],
    ]
    partial = artifact("artifact-partial", partial_proposals, "partial")
    artifact(
        "artifact-all-undetermined",
        [
            proposal(
                c["id"],
                None,
                applicability="undetermined",
                reason="insufficient_evidence",
                kind="range",
            )
            for c in [binary, scale, flag]
        ],
        "partial",
    )
    artifact(
        "artifact-source-evidence",
        [proposals[0], proposal("synthetic-scale", "middle", kind="source"), proposals[2]],
        source_fragments=[dict(source=source, chunk=chunk)],
    )
    artifact(
        "artifact-review-budget",
        proposals,
        reviews=[
            dict(
                criterion_id="synthetic-scale",
                proposal=None,
                call_ids=[],
                outcome="skipped",
                limitations=["Reviewer was not called: shared budget exhausted."],
            )
        ],
        limitations=["test_evaluator", "review_unfinished"],
    )
    error = add(
        "api-error",
        m.APIError,
        dict(
            code="provider_error",
            message="Synthetic provider unavailable.",
            retryable=True,
            correlation_id="synthetic-correlation",
        ),
        "Fixed safe error; no provider response or secrets.",
    )
    artifact(
        "artifact-failed",
        [],
        "failed",
        error=error.model_dump(mode="json"),
        calls=[
            call
            | dict(
                outcome="failed", finish_reason="error", safe_error=error.model_dump(mode="json")
            )
        ],
    )

    b = contribution("synthetic-binary", "yes", True, "1", "40", "40", "40", "40")
    s = contribution("synthetic-scale", "middle", 1, "0.5", "60", "30", "60", "30")
    full_score = add(
        "score-complete",
        m.ScoreSummary,
        score("70.00", b, s),
        "Handwritten illustrative score; not an arithmetic implementation test.",
    )
    partial_score = add(
        "score-partial",
        m.ScoreSummary,
        score(
            None,
            b | dict(normalized_contribution=None),
            contribution(
                "synthetic-scale", None, None, None, "60", None, "0", None, "undetermined"
            ),
            earned="40",
            applicable="40",
        ),
        "No complete automatic total for undetermined.",
    )
    effective_score = add(
        "score-human-effective",
        m.ScoreSummary,
        score(
            "100.00",
            b,
            contribution("synthetic-scale", "high", 2, "1", "60", "60", "60", "60"),
            earned="100",
        ),
        "Illustrative complete score after human replacement.",
    )
    add(
        "score-na",
        m.ScoreSummary,
        score(
            "100.00",
            b | dict(normalized_contribution="100"),
            contribution(
                "synthetic-scale", None, None, None, "60", "0", "0", "0", "not_applicable"
            ),
            earned="40",
            applicable="40",
        ),
        "N/A excluded from applicable weight.",
    )
    add(
        "score-no-applicable-weight",
        m.ScoreSummary,
        dict(
            status="no_applicable_weight",
            total_score=None,
            contributions=[],
            section_results=[],
            flags=[],
        ),
        "Separate null reason, not an incomplete evaluation or zero score.",
    )

    replacement = proposal(
        "synthetic-scale", "high", reason="human_changed", origin="human", kind="range"
    )
    decisions: dict[str, m.DTO] = {}
    for kind in ["confirmed", "changed"]:
        appeal_id = f"synthetic-appeal-{kind}"
        add(
            f"appeal-{kind}",
            m.Appeal,
            dict(
                id=appeal_id,
                evaluation_id=f"synthetic-evaluation-{kind}",
                criterion_id="synthetic-scale",
                comment="SYNTHETIC PRIVATE_TEXT_SENTINEL: inspect this invented answer.",
                effective_revision=1,
                state="resolved",
                created_at=NOW,
            ),
            "Synthetic free text remains local, never in safe export.",
        )
        decisions[kind] = add(
            f"decision-{kind}",
            m.Decision,
            dict(
                id=f"synthetic-decision-{kind}",
                appeal_id=appeal_id,
                evaluation_id=f"synthetic-evaluation-{kind}",
                criterion_id="synthetic-scale",
                expected_revision=1,
                decision=kind,
                replacement=replacement if kind == "changed" else None,
                reason="SYNTHETIC PRIVATE_TEXT_SENTINEL: reviewed the complete invented range.",
                reason_codes=[f"human_{kind}"],
                revision=2,
                created_at=LATER,
            ),
            "Confirmed preserves the proposal; changed uses a human replacement.",
        )
    base_view = dict(
        id="synthetic-evaluation-complete",
        conversation_id=conversation.id,
        conversation_revision=1,
        checklist_version_id=checklist.version_id,
        profile_id="synthetic-profile",
        profile_version="v1",
        corpus_snapshot_id=corpus.id,
        created_at=NOW,
        revision=1,
        artifact=complete.model_dump(mode="json"),
        automatic_score=full_score.model_dump(mode="json"),
        human_decisions=[],
        effective_proposals=proposals,
        effective_score=full_score.model_dump(mode="json"),
        reuse=dict(mode="fresh", reused_from_evaluation_id=None, reuse_key=HASH),
        source_fragments=[],
    )
    add("evaluation-complete", m.EvaluationView, base_view, "Complete synthetic evaluation card.")
    add(
        "evaluation-confirmed",
        m.EvaluationView,
        base_view
        | dict(
            id="synthetic-evaluation-confirmed",
            revision=2,
            human_decisions=[decisions["confirmed"].model_dump(mode="json")],
        ),
        "Confirmation does not change automatic proposals or score.",
    )
    add(
        "evaluation-human-completed",
        m.EvaluationView,
        base_view
        | dict(
            id="synthetic-evaluation-changed",
            revision=2,
            artifact=partial.model_dump(mode="json"),
            automatic_score=partial_score.model_dump(mode="json"),
            human_decisions=[decisions["changed"].model_dump(mode="json")],
            effective_proposals=[proposals[0], replacement, proposals[2]],
            effective_score=effective_score.model_dump(mode="json"),
        ),
        "Automatic remains partial/null while human effective is complete.",
    )
    add(
        "evaluation-source-fragments",
        m.EvaluationView,
        base_view
        | dict(
            artifact=FIXTURES["artifact-source-evidence"][0].model_dump(mode="json"),
            source_fragments=[dict(source=source, chunk=chunk)],
        ),
        "Pinned source text is available in local card, not safe export.",
    )

    for state in ["queued", "retry_wait", "failed", "succeeded"]:
        terminal_error = error.model_dump(mode="json") | dict(retryable=state == "retry_wait")
        add(
            f"job-{state}",
            m.Job,
            dict(
                id=f"synthetic-job-{state}",
                batch_id="synthetic-batch",
                conversation_id=conversation.id,
                conversation_revision=1,
                state=state,
                attempts=[]
                if state == "queued"
                else [
                    dict(
                        attempt_id="synthetic-attempt-1",
                        number=1,
                        started_at=NOW,
                        finished_at=LATER,
                        state="succeeded" if state == "succeeded" else "failed",
                        error=None if state == "succeeded" else terminal_error,
                    )
                ],
                max_attempts=3,
                next_attempt_at="2026-11-07T00:00:10Z" if state == "retry_wait" else None,
                attempt_id=None if state == "queued" else "synthetic-attempt-1",
                lease_id=None,
                lease_expires_at=None,
                budget=None
                if state == "queued"
                else budget.model_dump(mode="json") | dict(logical_job_id=f"synthetic-job-{state}"),
                progress=dict(
                    stage="queued" if state == "queued" else "done",
                    completed_calls=0 if state == "queued" else 1,
                ),
                evaluation_id="synthetic-evaluation-complete" if state == "succeeded" else None,
                error=terminal_error if state in {"retry_wait", "failed"} else None,
            ),
            "Job state is separate from artifact completeness.",
        )

    safe_binary = dict(
        criterion_id="synthetic-binary",
        applicability="applicable",
        answer_choice_id="yes",
        origin="test",
        reason_codes=["criteria_met"],
        evidence=[dict(kind="message", message_ids=["m0002"], relation="support")],
        score_fraction="1",
        earned_weight="40",
        applicable_weight="40",
        normalized_contribution="40",
    )
    safe_scale = dict(
        criterion_id="synthetic-scale",
        applicability="applicable",
        answer_choice_id="high",
        origin="human",
        reason_codes=["human_changed"],
        evidence=[
            dict(kind="range", start_message_id="m0001", end_message_id="m0003", relation="support")
        ],
        score_fraction="1",
        earned_weight="60",
        applicable_weight="60",
        normalized_contribution="60",
    )
    safe_flag = dict(
        criterion_id="synthetic-flag",
        applicability="applicable",
        answer_choice_id="no",
        origin="test",
        reason_codes=["no_violation_detected"],
        evidence=[
            dict(kind="range", start_message_id="m0001", end_message_id="m0003", relation="support")
        ],
        score_fraction=None,
        earned_weight="0",
        applicable_weight="0",
        normalized_contribution="0",
        flag_detected=False,
    )
    safe_criteria = [safe_binary, safe_scale, safe_flag]
    safe_base = dict(
        job_id="synthetic-job-succeeded",
        evaluation_id="synthetic-evaluation-changed",
        conversation_id=conversation.id,
        conversation_revision=1,
        checklist_version_id=checklist.version_id,
        profile_id="synthetic-profile",
        profile_version="v1",
        corpus_snapshot_id=corpus.id,
        evaluation_revision=2,
        job_state="succeeded",
        evaluation_status="partial",
        score_status="complete",
        total_score="100.00",
        criteria=safe_criteria,
        decisions=[
            dict(
                id="synthetic-decision-changed",
                appeal_id="synthetic-appeal-changed",
                criterion_id="synthetic-scale",
                decision="changed",
                reason_codes=["human_changed"],
                revision=2,
            )
        ],
        error_code=None,
        limitation_codes=["test_evaluator", "cost_unknown"],
    )
    failed_safe = safe_base | dict(
        job_id="synthetic-job-failed",
        evaluation_id=None,
        evaluation_revision=None,
        job_state="failed",
        evaluation_status=None,
        score_status=None,
        total_score=None,
        criteria=[],
        decisions=[],
        error_code="provider_error",
    )
    pending_safe = failed_safe | dict(
        job_id="synthetic-job-queued", job_state="queued", error_code=None
    )
    add(
        "safe-export-effective",
        m.SafeExport,
        dict(
            scope="effective",
            generated_at=LATER,
            batch_id="synthetic-batch",
            items=[safe_base, failed_safe, pending_safe],
        ),
        "Allowlist-only export includes failed/pending; never free text.",
    )
    automatic_safe = safe_base | dict(
        score_status="incomplete_evaluation",
        total_score=None,
        decisions=[],
        criteria=[
            safe_binary | dict(normalized_contribution=None),
            safe_scale
            | dict(
                applicability="undetermined",
                answer_choice_id=None,
                origin="test",
                reason_codes=["insufficient_evidence"],
                score_fraction=None,
                earned_weight=None,
                applicable_weight="0",
                normalized_contribution=None,
            ),
            safe_flag | dict(normalized_contribution=None),
        ],
        limitation_codes=["test_evaluator", "incomplete", "cost_unknown"],
    )
    add(
        "safe-export-automatic",
        m.SafeExport,
        dict(
            scope="automatic",
            generated_at=LATER,
            batch_id="synthetic-batch",
            items=[automatic_safe, failed_safe, pending_safe],
        ),
        "Original partial automatic remains incomplete after human changes.",
    )
    add(
        "import-json",
        h.JSONImport,
        dict(
            source="json",
            records=[
                dict(
                    external_id="synthetic-import",
                    channel="agent_chat",
                    language="KZ",
                    messages=[
                        dict(
                            speaker="client",
                            text="Бұл тек синтетикалық мысал.",
                            timestamp_original="00:01",
                        )
                    ],
                )
            ],
        ),
        "Portable import request contains synthetic data only.",
    )
    add("health", h.Health, {}, "Foundation health explicitly reports business_ready=false.")

    # Shape examples, not a second flag calculation or a server query implementation.
    for name, state, flag_status, detected, scope, job_id, evaluation_id in [
        ("detected-partial", "partial", "detected", True, "automatic", "job-flag", "eval-flag"),
        ("negative", "complete", "not_detected", False, "automatic", "job-flag", "eval-flag"),
        ("human-negative", "partial", "not_detected", False, "effective", "job-flag", "eval-flag"),
        ("pending", "pending", "unknown", None, "automatic", "job-new", None),
        ("failed", "failed", "unknown", None, "automatic", "job-failed", None),
        ("unevaluated", "unevaluated", "unknown", None, "automatic", None, None),
    ]:
        add(
            f"conversation-flag-{name}",
            h.ConversationSummary,
            dict(
                conversation=conversation.model_dump(mode="json"),
                latest_evaluation_id=evaluation_id,
                evaluation_status=state,
                flag_summary=dict(
                    checklist_version_id="synthetic-checklist-v1",
                    latest_job_id=job_id,
                    scope=scope,
                    status=flag_status,
                    result=dict(
                        criterion_id="synthetic-flag",
                        detected=detected,
                        answer_choice_id=None if detected is None else "yes" if detected else "no",
                    ),
                ),
            ),
            "Synthetic flag-filter response shape; no database selection is exercised.",
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "fixtures/contracts")
    args = parser.parse_args()
    build()
    args.output.mkdir(parents=True, exist_ok=True)
    entries = []
    for name, (value, description) in sorted(FIXTURES.items()):
        filename = f"{name}.json"
        (args.output / filename).write_text(
            json.dumps(value.model_dump(mode="json"), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        entries.append(dict(file=filename, model=type(value).__name__, description=description))
    (args.output / "manifest.json").write_text(
        json.dumps(
            dict(
                schema_version="1.0",
                synthetic=True,
                fixtures=entries,
                companion_inputs={
                    "artifact-na.json": "conversation-na.json",
                    "artifact-missing-action.json": "conversation-missing-action.json",
                    "default_conversation": "conversation-chat.json",
                    "default_checklist": "checklist-custom.json",
                    "default_corpus": "corpus-synthetic.json",
                    "default_profile": "profile-test.json",
                },
            ),
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"Validated and wrote {len(entries)} synthetic contract fixtures.")


if __name__ == "__main__":
    main()
