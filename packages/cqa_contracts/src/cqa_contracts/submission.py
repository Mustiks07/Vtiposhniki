"""Organizer JSON 1.0 and private submission receipts; separate from SafeExport.

Only the root of the official JSON has schema_version. No internal metadata is
inherited into its nested objects. Business arithmetic remains in cqa_domain.
"""

from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StrictBool,
    StrictFloat,
    StrictInt,
    StrictStr,
    model_validator,
)

from .models import DTO, ID, Hash, Nonempty

OFFICIAL_CODES = (
    "contact",
    "discovery",
    "identification",
    "consultation",
    "empathy",
    "dialogue",
    "closure",
    "critical",
)


def _integer(value: object) -> object:
    if type(value) is not int:
        raise ValueError("A raw scale step must be a JSON integer, not a boolean or string")
    return value


class OfficialObject(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


class CriterionText(OfficialObject):
    rationale: Annotated[StrictStr, Field(min_length=1, max_length=600, pattern=r"\S")]
    evidence_turns: list[Annotated[StrictInt, Field(ge=1)]]

    @model_validator(mode="after")
    def ordered_turns(self) -> Self:
        if self.evidence_turns != sorted(set(self.evidence_turns)):
            raise ValueError("evidence_turns must be unique and in original order")
        return self


class RequiredBinary(CriterionText):
    criterion_id: Literal["contact", "empathy", "critical"]
    value: StrictBool


class OptionalBinary(CriterionText):
    criterion_id: Literal["discovery", "identification", "closure"]
    value: StrictBool | None


class Consultation(CriterionText):
    criterion_id: Literal["consultation"]
    value: Annotated[Literal[0, 5, 10, 15, 20], BeforeValidator(_integer)] | None


class Dialogue(CriterionText):
    criterion_id: Literal["dialogue"]
    value: Annotated[Literal[0, 4, 7, 10], BeforeValidator(_integer)]


OfficialCriterion = Annotated[
    RequiredBinary | OptionalBinary | Consultation | Dialogue,
    Field(discriminator="criterion_id"),
]


class OfficialScore(OfficialObject):
    final_score: Annotated[StrictFloat, Field(ge=0, le=100)]
    critical_flag: StrictBool

    @model_validator(mode="after")
    def cents(self) -> Self:
        if Decimal(str(self.final_score)) * 100 % 1:
            raise ValueError("final_score must be rounded to at most two decimal places")
        return self


class OfficialSuccess(OfficialObject):
    conversation_id: ID
    status: Literal["ok"]
    criteria: list[OfficialCriterion] = Field(min_length=8, max_length=8)
    score: OfficialScore

    @model_validator(mode="after")
    def exact_criteria(self) -> Self:
        if {c.criterion_id for c in self.criteria} != set(OFFICIAL_CODES):
            raise ValueError("Every official criterion must occur exactly once")
        critical = next(c for c in self.criteria if c.criterion_id == "critical")
        if critical.value is not self.score.critical_flag:
            raise ValueError("critical_flag must equal the critical answer")
        return self


class OfficialError(OfficialObject):
    conversation_id: ID
    status: Literal["error"]
    criteria: list[OfficialCriterion] = Field(max_length=0)
    score: None
    error: Annotated[StrictStr, Field(min_length=1, max_length=300, pattern=r"\S")]


OfficialResult = Annotated[OfficialSuccess | OfficialError, Field(discriminator="status")]


class OfficialModel(OfficialObject):
    mode: Literal["local", "external_api", "hybrid"]
    name: Nonempty


class OfficialResults(OfficialObject):
    schema_version: Literal["1.0"]
    team_name: Nonempty
    model: OfficialModel
    results: list[OfficialResult] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_conversations(self) -> Self:
        ids = [r.conversation_id for r in self.results]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate conversation_id")
        return self


class SubmissionEntry(DTO):
    external_id: ID
    channel: Literal["agent_chat", "voice_call"]
    language: Literal["RU", "KZ", "EN"]
    turn_hashes: list[Hash] = Field(min_length=1)
    conversation_id: ID
    revision: Annotated[StrictInt, Field(ge=1)]


class SubmissionManifest(DTO):
    dataset: Literal["dev", "prod"]
    source_sha256: Hash
    entries: list[SubmissionEntry]

    @model_validator(mode="after")
    def full_dataset(self) -> Self:
        expected = 65 if self.dataset == "dev" else 10
        ids = [e.external_id for e in self.entries]
        if len(ids) != expected or len(set(ids)) != expected:
            raise ValueError(f"{self.dataset} requires {expected} distinct original IDs")
        channels = [e.channel for e in self.entries]
        chats, calls = (60, 5) if self.dataset == "dev" else (10, 0)
        if channels.count("agent_chat") != chats or channels.count("voice_call") != calls:
            raise ValueError("Dataset channel counts do not match the submission appendix")
        if len({e.conversation_id for e in self.entries}) != expected:
            raise ValueError("Imported conversation IDs are not distinct")
        return self


class SubmissionConfig(DTO):
    team_name: Nonempty
    submission_branch: Nonempty
    checklist_version_id: ID
    profile_id: ID
    profile_version: ID
    # Private literal redactions supplement email/phone/URL/credential detection.
    redactions: list[Nonempty] = Field(default_factory=list)


class SubmissionAttempt(DTO):
    external_id: ID
    idempotency_key: ID
    batch_id: ID | None = None


class SubmissionRun(DTO):
    manifest_sha256: Hash
    config_sha256: Hash
    attempts: list[SubmissionAttempt]


SUBMISSION_MODELS = (
    OfficialResults,
    SubmissionManifest,
    SubmissionConfig,
    SubmissionRun,
)
