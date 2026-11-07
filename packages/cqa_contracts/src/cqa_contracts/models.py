"""Canonical domain, execution and safe export DTOs.

Local structural checks live here. Cross-object/business validation belongs to
cqa_domain; persistence and authorization of transitions belong to apps/api.
"""

import re
from datetime import date, datetime, timedelta
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Literal, Self
from urllib.parse import urlsplit

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    PlainSerializer,
    WithJsonSchema,
    model_validator,
)


def _decimal(value: object) -> Decimal:
    if not isinstance(value, (str, Decimal)):
        raise ValueError("Decimals must be JSON strings")
    if isinstance(value, str) and not re.fullmatch(r"-?\d+(\.\d+)?", value):
        raise ValueError("Decimal strings must use finite fixed-point notation")
    result = Decimal(value)
    if not result.is_finite():
        raise ValueError("Decimal must be finite")
    return result


DecimalString = Annotated[
    Decimal,
    BeforeValidator(_decimal),
    PlainSerializer(lambda value: format(value, "f"), return_type=str),
    WithJsonSchema({"type": "string", "pattern": r"^-?\d+(\.\d+)?$"}),
]
NonnegativeDecimal = Annotated[DecimalString, Field(ge=0)]
Fraction = Annotated[DecimalString, Field(ge=0, le=1)]
Percentage = Annotated[DecimalString, Field(ge=0, le=100)]
ID = Annotated[str, Field(min_length=1, max_length=200)]
MessageID = Annotated[str, Field(pattern=r"^m[0-9]{4,}$")]
Hash = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
Nonempty = Annotated[str, Field(min_length=1, pattern=r"\S")]


def _utc(value: datetime) -> datetime:
    if value.utcoffset() != timedelta(0):
        raise ValueError("Server timestamps must be UTC")
    return value


UTCDateTime = Annotated[AwareDatetime, AfterValidator(_utc)]


def _safe_url(value: str) -> str:
    url = urlsplit(value)
    if (
        url.scheme != "https"
        or not url.netloc
        or url.username
        or url.password
        or url.query
        or url.fragment
    ):
        raise ValueError("Source URLs must be HTTPS without credentials, query or fragment")
    return value


SafeURL = Annotated[str, AfterValidator(_safe_url)]


class DTO(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)
    schema_version: Literal["1.0"] = "1.0"


class ReasonCode(StrEnum):
    CRITERIA_MET = "criteria_met"
    CRITERIA_PARTIALLY_MET = "criteria_partially_met"
    CRITERIA_NOT_MET = "criteria_not_met"
    NOT_APPLICABLE = "not_applicable"
    MISSING_EXPECTED_ACTION = "missing_expected_action"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"
    CONFLICTING_EVIDENCE = "conflicting_evidence"
    FACTUAL_VERIFICATION_LIMITED = "factual_verification_limited"
    VIOLATION_DETECTED = "violation_detected"
    NO_VIOLATION_DETECTED = "no_violation_detected"
    OTHER = "other"
    HUMAN_CONFIRMED = "human_confirmed"
    HUMAN_CHANGED = "human_changed"


class ErrorCode(StrEnum):
    VALIDATION_ERROR = "validation_error"
    NOT_FOUND = "not_found"
    REVISION_CONFLICT = "revision_conflict"
    IDEMPOTENCY_CONFLICT = "idempotency_conflict"
    OPEN_APPEAL_EXISTS = "open_appeal_exists"
    INVALID_STATE = "invalid_state"
    PAYLOAD_TOO_LARGE = "payload_too_large"
    CONFIGURATION_ERROR = "configuration_error"
    PROVIDER_ERROR = "provider_error"
    BUDGET_EXCEEDED = "budget_exceeded"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"
    LEASE_LOST = "lease_lost"
    PERSISTENCE_ERROR = "persistence_error"
    AUDIO_UNAVAILABLE = "audio_unavailable"
    NOT_IMPLEMENTED = "not_implemented"
    INTERNAL_ERROR = "internal_error"


class ErrorDetail(DTO):
    index: int | None = Field(default=None, ge=0)
    field: str | None = None
    reason: Literal[
        "invalid", "missing", "duplicate", "conflicting_duplicate", "limit_exceeded", "unsupported"
    ]


class APIError(DTO):
    code: ErrorCode
    message: Nonempty  # fixed safe text, never a raw exception/provider response
    details: list[ErrorDetail] = Field(default_factory=list)
    retryable: bool
    correlation_id: ID


class Message(DTO):
    id: MessageID
    ordinal: int = Field(ge=1)
    speaker: Literal["client", "operator", "bot", "system"]
    text: str
    timestamp_original: str
    parsed_time: AwareDatetime | None = None
    source_index: int = Field(ge=0)


class AudioMapping(DTO):
    message_id: MessageID
    start_seconds: NonnegativeDecimal
    end_seconds: NonnegativeDecimal | None = None


class AudioMetadata(DTO):
    availability: Literal["available", "unavailable", "unknown"]
    access_path: str | None = Field(default=None, pattern=r"^/api/v1/conversations/[^/?#]+/audio$")
    content_hash: Hash | None = None
    alignment_status: Literal["verified", "unverified", "unavailable"]
    mapping: list[AudioMapping] | None = None
    media_type: str | None = None

    @model_validator(mode="after")
    def verified_mapping(self) -> Self:
        if self.mapping is not None and self.alignment_status != "verified":
            raise ValueError("Audio mapping requires verified alignment")
        return self


class Conversation(DTO):
    id: ID
    external_id: ID
    revision: int = Field(ge=1)
    content_hash: Hash
    channel: Literal["agent_chat", "voice_call"]
    language: Literal["RU", "KZ", "EN"]
    messages: list[Message] = Field(min_length=1)
    occurred_at: AwareDatetime | None = None
    audio: AudioMetadata
    warnings: list[str] = Field(default_factory=list)


class Choice(DTO):
    id: ID
    label: Nonempty
    raw_value: bool | int | float | str
    anchor: Nonempty
    score_fraction: Fraction | None


class ChannelInstructions(DTO):
    agent_chat: str = ""
    voice_call: str = ""
    voice_policy_version: ID = "text-observable-v1"


class EvidencePolicy(DTO):
    require_evidence: bool = True
    missing_action_requires_range: bool = True
    allow_source: bool = True


class Criterion(DTO):
    id: ID
    title: Nonempty
    definition: Nonempty
    response_type: Literal["binary", "scale", "flag"]
    choices: list[Choice] = Field(min_length=2)
    allow_na: bool
    na_condition: str | None
    channel_instructions: ChannelInstructions
    evidence_policy: EvidencePolicy
    requires_reference: bool
    weight: NonnegativeDecimal
    section_id: ID | None = None
    flag_when_choice_ids: list[ID] = Field(default_factory=list)


class Section(DTO):
    id: ID
    title: Nonempty


class RoundingPolicy(DTO):
    mode: Literal["ROUND_HALF_UP"] = "ROUND_HALF_UP"
    decimal_places: Literal[2] = 2
    intermediate_rounding: Literal[False] = False


class ChecklistDraft(DTO):
    title: Nonempty
    criteria: list[Criterion] = Field(min_length=1)
    sections: list[Section] = Field(default_factory=list)
    rounding: RoundingPolicy = Field(default_factory=RoundingPolicy)


class ChecklistVersion(ChecklistDraft):
    checklist_id: ID
    version_id: ID
    semantic_hash: Hash
    scoring_config_hash: Hash
    created_at: UTCDateTime


class Evidence(DTO):
    kind: Literal["message", "range", "source"]
    message_ids: list[MessageID] = Field(default_factory=list)
    start_message_id: MessageID | None = None
    end_message_id: MessageID | None = None
    source_chunk_id: ID | None = None
    relation: Literal["support", "counter", "context"]
    explanation: Nonempty

    @model_validator(mode="after")
    def shape(self) -> Self:
        message = bool(self.message_ids)
        bounds = self.start_message_id is not None and self.end_message_id is not None
        any_bound = self.start_message_id is not None or self.end_message_id is not None
        source = self.source_chunk_id is not None
        valid = (
            self.kind == "message"
            and message
            and not any_bound
            and not source
            or self.kind == "range"
            and bounds
            and not message
            and not source
            or self.kind == "source"
            and source
            and not message
            and not any_bound
        )
        if not valid:
            raise ValueError("Evidence must have exactly the references appropriate to its kind")
        return self


class CriterionProposal(DTO):
    criterion_id: ID
    applicability: Literal["applicable", "not_applicable", "undetermined"]
    answer_choice_id: ID | None
    rationale: Nonempty
    reason_codes: list[ReasonCode] = Field(min_length=1)
    evidence: list[Evidence]
    limitations: list[str] = Field(default_factory=list)
    review_reasons: list[str] = Field(default_factory=list)
    origin: Literal["ai", "human", "test"] = "ai"

    @model_validator(mode="after")
    def shape(self) -> Self:
        if (self.applicability == "applicable") != (self.answer_choice_id is not None):
            raise ValueError("Only applicable proposals have an answer_choice_id")
        human = {ReasonCode.HUMAN_CHANGED, ReasonCode.HUMAN_CONFIRMED}
        if self.origin != "human" and human.intersection(self.reason_codes):
            raise ValueError("AI/test proposals cannot claim human reason codes")
        if self.origin == "human" and self.reason_codes != [ReasonCode.HUMAN_CHANGED]:
            raise ValueError("Human replacement proposals use human_changed")
        return self


class ProviderSelection(DTO):
    provider: Literal["gemini", "deepseek", "openrouter", "test"]
    model: ID
    configuration_ref: ID  # name only; never a credential or endpoint URL


class GenerationSettings(DTO):
    temperature: NonnegativeDecimal = Decimal("0")
    max_output_tokens: int = Field(default=4096, ge=1, le=131072)
    seed: int | None = None


class RetryPolicy(DTO):
    max_job_attempts: int = Field(default=3, ge=1, le=10)
    max_format_repairs: int = Field(default=1, ge=0, le=4)
    max_transport_retries: int = Field(default=1, ge=0, le=4)
    call_timeout_seconds: int = Field(default=60, ge=1, le=300)
    job_deadline_seconds: int = Field(default=300, ge=1, le=3600)
    max_provider_calls: int = Field(default=8, ge=1, le=100)
    max_total_tokens: int | None = Field(default=65536, ge=1)
    max_cost: NonnegativeDecimal | None = None
    currency: Literal["USD"] = "USD"


class ReviewerPolicy(DTO):
    enabled: bool = False
    version: Literal["keep_valid_initial_v1"] = "keep_valid_initial_v1"
    max_criteria: int = Field(default=2, ge=0, le=20)
    blind: Literal[True] = True


class EvaluatorProfile(DTO):
    id: ID
    version: ID
    mode: Literal["production", "test"]
    primary: ProviderSelection
    reviewer: ProviderSelection | None = None
    fallbacks: list[ProviderSelection] = Field(default_factory=list)
    generation: GenerationSettings
    prompt_version: ID
    output_schema_version: Literal["1.0"] = "1.0"
    preprocessing_version: ID
    reviewer_policy: ReviewerPolicy
    retries: RetryPolicy
    corpus_snapshot_id: ID

    @model_validator(mode="after")
    def test_is_explicit(self) -> Self:
        providers = [self.primary, *self.fallbacks, *([self.reviewer] if self.reviewer else [])]
        if self.mode == "production" and any(p.provider == "test" for p in providers):
            raise ValueError("Production profiles cannot use a test provider")
        if self.mode == "test" and any(p.provider != "test" for p in providers):
            raise ValueError("Test profiles cannot call real providers")
        return self


class SourceVersion(DTO):
    source_id: ID
    version: ID
    content_hash: Hash
    provenance: Literal["organizer", "official_public", "synthetic"]
    title: Nonempty
    safe_url: SafeURL | None
    locator: str | None = None
    legal_entity: str | None = None
    product: str | None = None
    published_at: date | None = None
    effective_from: date | None = None
    effective_until: date | None = None
    retrieved_at: UTCDateTime


class SourceChunk(DTO):
    chunk_id: ID
    source_id: ID
    source_version: ID
    text: str
    content_hash: Hash
    locator: str


class CorpusSnapshot(DTO):
    id: ID
    content_hash: Hash
    sources: list[SourceVersion]
    chunks: list[SourceChunk]
    applicability_policy: Nonempty
    priority_policy: Nonempty


class SourceFragment(DTO):
    source: SourceVersion
    chunk: SourceChunk


class ExecutionBudget(DTO):
    logical_job_id: ID
    attempt_id: ID
    max_provider_calls: int = Field(ge=1, le=100)
    consumed_calls: int = Field(ge=0)
    deadline_at: UTCDateTime
    max_total_tokens: int | None = Field(default=None, ge=1)
    consumed_tokens: int | None = Field(default=None, ge=0)
    max_cost: NonnegativeDecimal | None = None
    consumed_cost: NonnegativeDecimal | None = None
    currency: Literal["USD"] = "USD"
    usage_complete: bool = False

    @model_validator(mode="after")
    def bounded(self) -> Self:
        if self.consumed_calls > self.max_provider_calls:
            raise ValueError("Consumed calls exceed budget")
        return self


class TokenUsage(DTO):
    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    reasoning_tokens: int | None = Field(default=None, ge=0)
    cached_tokens: int | None = Field(default=None, ge=0)


class CallRecord(DTO):
    call_id: ID
    attempt_id: ID
    purpose: Literal["primary", "review", "repair", "fallback"]
    requested: ProviderSelection
    actual: ProviderSelection | None = None
    started_at: UTCDateTime
    finished_at: UTCDateTime | None = None
    outcome: Literal["started", "succeeded", "failed", "timeout", "cancelled", "unknown"]
    finish_reason: Literal["stop", "length", "refusal", "error", "unknown"] | None = None
    usage: TokenUsage | None = None
    cost: NonnegativeDecimal | None = None
    currency: Literal["USD"] = "USD"
    price_version: ID | None = None
    safe_error: APIError | None = None


class CallEvent(DTO):
    event: Literal["call_started", "call_finished"]
    logical_job_id: ID
    attempt_id: ID
    call_id: ID
    record: CallRecord

    @model_validator(mode="after")
    def consistent(self) -> Self:
        if self.call_id != self.record.call_id or self.attempt_id != self.record.attempt_id:
            raise ValueError("Event and record identities differ")
        if self.event == "call_started" and (
            self.record.outcome != "started" or self.record.finished_at
        ):
            raise ValueError("Started event must precede completion")
        if self.event == "call_finished" and (
            self.record.outcome == "started" or not self.record.finished_at
        ):
            raise ValueError("Finished event needs a completed record")
        return self


class EvaluationIdentity(DTO):
    conversation_content_hash: Hash
    checklist_semantic_hash: Hash
    profile_hash: Hash
    corpus_snapshot_hash: Hash
    audio_content_hash: Hash | None = None  # non-null only when audio was evaluated


class ReviewRecord(DTO):
    criterion_id: ID
    proposal: CriterionProposal | None
    call_ids: list[ID]
    outcome: Literal["agreed", "conflicted", "skipped", "failed"]
    limitations: list[str] = Field(default_factory=list)


class EvaluationArtifact(DTO):
    status: Literal["complete", "partial", "failed"]
    initial: list[CriterionProposal]
    reviews: list[ReviewRecord]
    automatic_final: list[CriterionProposal]
    calls: list[CallRecord]
    identity: EvaluationIdentity
    source_fragments: list[SourceFragment] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    error: APIError | None = None
    evaluator_mode: Literal["production", "test"]

    @model_validator(mode="after")
    def structural_status(self) -> Self:
        if any(p.origin == "human" for p in [*self.initial, *self.automatic_final]):
            raise ValueError("Automatic artifacts cannot contain human proposals")
        if self.status != "failed":
            if not self.initial or not self.automatic_final or self.error:
                raise ValueError("Successful processing requires proposals and no fatal error")
            for proposals in (self.initial, self.automatic_final):
                ids = [p.criterion_id for p in proposals]
                if len(set(ids)) != len(ids):
                    raise ValueError("Duplicate criterion proposal")
            if {p.criterion_id for p in self.initial} != {
                p.criterion_id for p in self.automatic_final
            }:
                raise ValueError("Initial and automatic coverage must match")
            partial = any(p.applicability == "undetermined" for p in self.automatic_final)
            if partial != (self.status == "partial"):
                raise ValueError("Partial requires undetermined; complete forbids it")
        elif self.error is None:
            raise ValueError("Failed artifact requires a safe error")
        return self


class ScoreContribution(DTO):
    criterion_id: ID
    applicability: Literal["applicable", "not_applicable", "undetermined"]
    answer_choice_id: ID | None
    raw_value: bool | int | float | str | None
    score_fraction: Fraction | None
    original_weight: NonnegativeDecimal
    earned_weight: NonnegativeDecimal | None
    applicable_weight: NonnegativeDecimal
    normalized_contribution: Percentage | None


class SectionResult(DTO):
    section_id: ID
    section_earned_weight: NonnegativeDecimal
    section_applicable_weight: NonnegativeDecimal
    section_percent: Percentage | None


class FlagResult(DTO):
    criterion_id: ID
    detected: bool | None
    answer_choice_id: ID | None


class ScoreSummary(DTO):
    status: Literal["complete", "no_applicable_weight", "incomplete_evaluation"]
    total_score: Percentage | None
    contributions: list[ScoreContribution]
    section_results: list[SectionResult]
    flags: list[FlagResult]

    @model_validator(mode="after")
    def total_status(self) -> Self:
        if (self.status == "complete") != (self.total_score is not None):
            raise ValueError("Only complete scores have a total")
        return self


class JobAttempt(DTO):
    attempt_id: ID
    number: int = Field(ge=1)
    started_at: UTCDateTime
    finished_at: UTCDateTime | None
    state: Literal["running", "succeeded", "failed", "expired", "cancelled"]
    error: APIError | None


class JobProgress(DTO):
    stage: Literal["queued", "evaluating", "reviewing", "persisting", "done"]
    completed_calls: int = Field(ge=0)


class Job(DTO):
    id: ID
    batch_id: ID | None
    conversation_id: ID
    conversation_revision: int = Field(ge=1)
    state: Literal["queued", "running", "succeeded", "retry_wait", "failed", "cancelled"]
    attempts: list[JobAttempt]
    max_attempts: int = Field(ge=1, le=10)
    next_attempt_at: UTCDateTime | None
    attempt_id: ID | None
    lease_id: ID | None
    lease_expires_at: UTCDateTime | None
    budget: ExecutionBudget | None  # null before first claim; fixed deadline thereafter
    progress: JobProgress
    evaluation_id: ID | None
    error: APIError | None


class Appeal(DTO):
    id: ID
    evaluation_id: ID
    criterion_id: ID
    comment: Nonempty
    effective_revision: int = Field(ge=1)
    state: Literal["open", "resolved"]
    created_at: UTCDateTime


class DecisionRequest(DTO):
    expected_revision: int = Field(ge=1)
    decision: Literal["confirmed", "changed"]
    replacement: CriterionProposal | None = None
    reason: Nonempty

    @model_validator(mode="after")
    def replacement_shape(self) -> Self:
        if (self.decision == "changed") != (self.replacement is not None):
            raise ValueError("Only changed decisions require replacement")
        if self.replacement is not None and self.replacement.origin != "human":
            raise ValueError("Replacement must have human origin and human_changed code")
        return self


class Decision(DecisionRequest):
    id: ID
    appeal_id: ID
    evaluation_id: ID
    criterion_id: ID
    reason_codes: list[ReasonCode] = Field(min_length=1)
    revision: int = Field(ge=2)
    created_at: UTCDateTime

    @model_validator(mode="after")
    def human_codes(self) -> Self:
        expected = (
            ReasonCode.HUMAN_CHANGED if self.decision == "changed" else ReasonCode.HUMAN_CONFIRMED
        )
        if self.reason_codes != [expected]:
            raise ValueError("Decision reason code must match decision")
        return self


class ReuseProvenance(DTO):
    mode: Literal["fresh", "reuse_if_compatible"]
    reused_from_evaluation_id: ID | None
    reuse_key: Hash


class EvaluationView(DTO):
    id: ID
    conversation_id: ID
    conversation_revision: int = Field(ge=1)
    checklist_version_id: ID
    profile_id: ID
    profile_version: ID
    corpus_snapshot_id: ID
    created_at: UTCDateTime
    revision: int = Field(ge=1)
    artifact: EvaluationArtifact
    automatic_score: ScoreSummary
    human_decisions: list[Decision]
    effective_proposals: list[CriterionProposal]
    effective_score: ScoreSummary
    reuse: ReuseProvenance
    source_fragments: list[SourceFragment]


class SafeEvidenceRef(DTO):
    kind: Literal["message", "range", "source"]
    message_ids: list[MessageID] = Field(default_factory=list)
    start_message_id: MessageID | None = None
    end_message_id: MessageID | None = None
    source_chunk_id: ID | None = None
    relation: Literal["support", "counter", "context"]


class SafeCriterionResult(DTO):
    criterion_id: ID
    applicability: Literal["applicable", "not_applicable", "undetermined"]
    answer_choice_id: ID | None
    origin: Literal["ai", "human", "test"]
    reason_codes: list[ReasonCode]
    evidence: list[SafeEvidenceRef]
    score_fraction: Fraction | None
    earned_weight: NonnegativeDecimal | None
    applicable_weight: NonnegativeDecimal
    normalized_contribution: Percentage | None
    flag_detected: bool | None = None


class SafeDecision(DTO):
    id: ID
    appeal_id: ID
    criterion_id: ID
    decision: Literal["confirmed", "changed"]
    reason_codes: list[ReasonCode]
    revision: int = Field(ge=2)


class SafeExportItem(DTO):
    job_id: ID
    evaluation_id: ID | None
    conversation_id: ID
    conversation_revision: int = Field(ge=1)
    checklist_version_id: ID
    profile_id: ID
    profile_version: ID
    corpus_snapshot_id: ID
    evaluation_revision: int | None = Field(default=None, ge=1)
    job_state: Literal["queued", "running", "succeeded", "retry_wait", "failed", "cancelled"]
    evaluation_status: Literal["complete", "partial", "failed"] | None
    score_status: Literal["complete", "no_applicable_weight", "incomplete_evaluation"] | None
    total_score: Percentage | None
    criteria: list[SafeCriterionResult]
    decisions: list[SafeDecision]
    error_code: ErrorCode | None
    limitation_codes: list[
        Literal[
            "test_evaluator",
            "incomplete",
            "review_unfinished",
            "factual_verification_limited",
            "audio_unavailable",
            "cost_unknown",
            "other",
        ]
    ]
    cost: NonnegativeDecimal | None = None
    cost_complete: bool = False
    currency: Literal["USD"] = "USD"


class SafeExport(DTO):
    scope: Literal["automatic", "effective"]
    generated_at: UTCDateTime
    batch_id: ID | None
    items: list[SafeExportItem]
