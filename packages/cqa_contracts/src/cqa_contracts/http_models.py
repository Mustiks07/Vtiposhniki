"""Wire requests/responses, including the portable JSON import format v1."""

from typing import Annotated, Generic, Literal, Self, TypeVar

from pydantic import AwareDatetime, Field, model_validator

from .models import (
    DTO,
    ID,
    APIError,
    CallRecord,
    ChecklistDraft,
    ChecklistVersion,
    Conversation,
    CriterionProposal,
    EvaluatorProfile,
    FlagResult,
    Job,
    Nonempty,
    Percentage,
    SourceFragment,
    SourceVersion,
    UTCDateTime,
)

T = TypeVar("T")


class Page(DTO, Generic[T]):  # noqa: UP046 - Pydantic generic schema naming is pinned in v1.
    items: list[T]
    total: int = Field(ge=0)
    limit: int = Field(ge=1, le=200)
    offset: int = Field(ge=0)


class Health(DTO):
    status: Literal["ok"] = "ok"
    phase: Literal["foundation", "application"] = "foundation"
    business_ready: bool = False
    evaluator_mode: Literal["production", "test"] = "production"


class ImportMessage(DTO):
    speaker: Literal["client", "operator", "bot", "system"]
    text: str
    timestamp_original: str


class ImportRecord(DTO):
    external_id: ID
    channel: Literal["agent_chat", "voice_call"]
    language: Literal["RU", "KZ", "EN"]
    messages: list[ImportMessage] = Field(min_length=1)
    occurred_at: AwareDatetime | None = None


class OrganizerImport(DTO):
    source: Literal["organizer_api"]
    group_id: ID


class JSONImport(DTO):
    source: Literal["json"]
    records: list[ImportRecord] = Field(min_length=1, max_length=1000)


ImportRequest = Annotated[OrganizerImport | JSONImport, Field(discriminator="source")]


class ImportedRevision(DTO):
    conversation_id: ID
    revision: int = Field(ge=1)
    disposition: Literal["created", "new_revision", "unchanged"]
    source_indices: list[int] = Field(min_length=1)


class ImportResult(DTO):
    atomic: Literal[True] = True
    items: list[ImportedRevision]
    received_count: int = Field(ge=1)
    deduplicated_count: int = Field(ge=0)


class ChecklistSummary(DTO):
    checklist_id: ID
    title: Nonempty
    latest_version_id: ID
    created_at: UTCDateTime


class CreateChecklistVersion(DTO):
    expected_latest_version_id: ID
    config: ChecklistDraft


class CreateBatch(DTO):
    conversation_ids: list[ID] = Field(min_length=1, max_length=1000)
    checklist_version_id: ID
    profile_id: ID
    mode: Literal["fresh", "reuse_if_compatible"]


class BatchProgress(DTO):
    total: int = Field(ge=1)
    queued: int = Field(ge=0)
    running: int = Field(ge=0)
    retry_wait: int = Field(ge=0)
    succeeded: int = Field(ge=0)
    failed: int = Field(ge=0)
    cancelled: int = Field(ge=0)


class EvaluationBatch(DTO):
    id: ID
    checklist_version_id: ID
    profile_id: ID
    profile_version: ID
    corpus_snapshot_id: ID
    mode: Literal["fresh", "reuse_if_compatible"]
    created_at: UTCDateTime
    progress: BatchProgress
    jobs: list[Job]


class CreateAppeal(DTO):
    criterion_id: ID
    comment: Nonempty
    expected_revision: int = Field(ge=1)


class ProfileSummary(DTO):
    profile: EvaluatorProfile
    configured: bool
    configuration_error: APIError | None = None
    preferred: bool = False


FlagStatus = Literal["detected", "not_detected", "unknown"]
FlagScope = Literal["automatic", "effective"]
WorkQueue = Literal["flagged", "needs_review", "open_appeals"]
ConversationSort = Literal["newest", "score_asc", "score_desc"]
ReviewReason = Literal["incomplete", "conflict", "open_appeal", "evaluation_failed"]


class ConversationFlagQuery(DTO):
    """Validated selection for listConversations; no business filtering here."""

    checklist_version_id: ID | None = None
    flag_criterion_id: ID | None = None
    flag_status: FlagStatus | None = None
    flag_scope: FlagScope = "automatic"

    @model_validator(mode="after")
    def explicit_selection(self) -> Self:
        if self.flag_criterion_id is not None and self.checklist_version_id is None:
            raise ValueError("Flag selection requires checklist_version_id")
        if self.flag_criterion_id is None and (
            self.flag_status is not None or self.flag_scope != "automatic"
        ):
            raise ValueError("Flag status/scope requires flag_criterion_id")
        return self


class ConversationFlagSummary(DTO):
    """One selected flag; details use latest_evaluation_id and result.criterion_id."""

    checklist_version_id: ID
    latest_job_id: ID | None
    scope: FlagScope
    status: FlagStatus
    result: FlagResult

    @model_validator(mode="after")
    def consistent_status(self) -> Self:
        expected = (
            "unknown"
            if self.result.detected is None
            else "detected"
            if self.result.detected
            else "not_detected"
        )
        if self.status != expected:
            raise ValueError("Flag status must agree with the tri-state FlagResult")
        return self


class ConversationSummary(DTO):
    conversation: Conversation
    latest_evaluation_id: ID | None = None
    evaluation_status: Literal["unevaluated", "complete", "partial", "failed", "pending"]
    flag_summary: ConversationFlagSummary | None = None
    total_score: Percentage | None = None
    result_scope: FlagScope = "automatic"
    detected_flag: bool | None = None
    checklist_version_id: ID | None = None
    profile_id: ID | None = None
    open_appeals: int = Field(default=0, ge=0)
    review_reasons: list[ReviewReason] = Field(default_factory=list)


class VersionList(Page[ChecklistVersion]):
    pass


class SecondOpinion(DTO):
    id: ID
    appeal_id: ID
    evaluation_id: ID
    criterion_id: ID
    profile_id: ID
    profile_version: ID
    mode: Literal["production", "test"]
    state: Literal["running", "succeeded", "failed"]
    created_at: UTCDateTime
    finished_at: UTCDateTime | None = None
    proposal: CriterionProposal | None = None
    calls: list[CallRecord] = Field(default_factory=list)
    source_fragments: list[SourceFragment] = Field(default_factory=list)
    error: APIError | None = None


class KnowledgeSources(Page[SourceVersion]):
    pass


class CoachingRequest(DTO):
    criterion_id: ID
    expected_revision: int = Field(ge=1)
    scope: FlagScope = "effective"


class OperatorSuggestion(DTO):
    message_id: ID
    text: str = Field(min_length=1, max_length=1200)
    explanation: str = Field(min_length=1, max_length=1200)


class CoachingResult(DTO):
    language: Literal["RU", "KZ", "EN"]
    suggestions: list[OperatorSuggestion] = Field(min_length=1, max_length=2)


class AssistantRun(DTO):
    id: ID
    kind: Literal["coaching"]
    evaluation_id: ID
    evaluation_revision: int = Field(ge=1)
    criterion_id: ID
    scope: FlagScope
    profile_id: ID
    profile_version: ID
    mode: Literal["production", "test"]
    state: Literal["running", "succeeded", "failed"]
    created_at: UTCDateTime
    finished_at: UTCDateTime | None = None
    coaching: CoachingResult | None = None
    calls: list[CallRecord] = Field(default_factory=list)
    error: APIError | None = None
