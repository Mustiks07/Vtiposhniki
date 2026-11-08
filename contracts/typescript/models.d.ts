/* Generated from cqa_contracts. DO NOT EDIT. */

/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ErrorCode".
 */
export type ErrorCode =
  | "validation_error"
  | "not_found"
  | "revision_conflict"
  | "idempotency_conflict"
  | "open_appeal_exists"
  | "invalid_state"
  | "payload_too_large"
  | "configuration_error"
  | "provider_error"
  | "budget_exceeded"
  | "timeout"
  | "cancelled"
  | "lease_lost"
  | "persistence_error"
  | "audio_unavailable"
  | "not_implemented"
  | "internal_error";
export type CorrelationId = string;
export type Field = string | null;
export type Index = number | null;
export type Reason = "invalid" | "missing" | "duplicate" | "conflicting_duplicate" | "limit_exceeded" | "unsupported";
export type SchemaVersion = "1.0";
export type Details = ErrorDetail[];
export type Message = string;
export type Retryable = boolean;
export type SchemaVersion1 = "1.0";
export type Comment = string;
export type CreatedAt = string;
export type CriterionId = string;
export type EffectiveRevision = number;
export type EvaluationId = string;
export type Id = string;
export type SchemaVersion2 = "1.0";
export type State = "open" | "resolved";
export type EndSeconds = string | null;
export type MessageId = string;
export type SchemaVersion3 = "1.0";
export type StartSeconds = string;
export type AccessPath = string | null;
export type AlignmentStatus = "verified" | "unverified" | "unavailable";
export type Availability = "available" | "unavailable" | "unknown";
export type ContentHash = string | null;
export type Mapping = AudioMapping[] | null;
export type MediaType = string | null;
export type SchemaVersion4 = "1.0";
export type Cancelled = number;
export type Failed = number;
export type Queued = number;
export type RetryWait = number;
export type Running = number;
export type SchemaVersion5 = "1.0";
export type Succeeded = number;
export type Total = number;
export type AttemptId = string;
export type CallId = string;
export type Event = "call_started" | "call_finished";
export type LogicalJobId = string;
export type ConfigurationRef = string;
export type Model = string;
export type Provider = "gemini" | "deepseek" | "openrouter" | "xerosharc" | "test";
export type SchemaVersion6 = "1.0";
export type AttemptId1 = string;
export type CallId1 = string;
export type Cost = string | null;
export type Currency = "USD";
export type FinishReason = ("stop" | "length" | "refusal" | "error" | "unknown") | null;
export type FinishedAt = string | null;
export type Outcome = "started" | "succeeded" | "failed" | "timeout" | "cancelled" | "unknown";
export type PriceVersion = string | null;
export type Purpose = "primary" | "review" | "repair" | "fallback";
export type SchemaVersion7 = "1.0";
export type StartedAt = string;
export type CachedTokens = number | null;
export type InputTokens = number | null;
export type OutputTokens = number | null;
export type ReasoningTokens = number | null;
export type SchemaVersion8 = "1.0";
export type SchemaVersion9 = "1.0";
export type AgentChat = string;
export type SchemaVersion10 = "1.0";
export type VoiceCall = string;
export type VoicePolicyVersion = string;
/**
 * @minItems 1
 */
export type Criteria = [Criterion, ...Criterion[]];
export type AllowNa = boolean;
/**
 * @minItems 2
 */
export type Choices = [Choice, Choice, ...Choice[]];
export type Anchor = string;
export type Id1 = string;
export type Label = string;
export type RawValue = boolean | number | string;
export type SchemaVersion11 = "1.0";
export type ScoreFraction = string | null;
export type Definition = string;
export type AllowSource = boolean;
export type MissingActionRequiresRange = boolean;
export type RequireEvidence = boolean;
export type SchemaVersion12 = "1.0";
export type FlagWhenChoiceIds = string[];
export type Id2 = string;
export type NaCondition = string | null;
export type RequiresReference = boolean;
export type ResponseType = "binary" | "scale" | "flag";
export type SchemaVersion13 = "1.0";
export type SectionId = string | null;
export type Title = string;
export type Weight = string;
export type DecimalPlaces = 2;
export type IntermediateRounding = false;
export type Mode = "ROUND_HALF_UP";
export type SchemaVersion14 = "1.0";
export type SchemaVersion15 = "1.0";
export type Id3 = string;
export type SchemaVersion16 = "1.0";
export type Title1 = string;
export type Sections = Section[];
export type Title2 = string;
export type ChecklistId = string;
export type CreatedAt1 = string;
export type LatestVersionId = string;
export type SchemaVersion17 = "1.0";
export type Title3 = string;
export type ChecklistId1 = string;
export type CreatedAt2 = string;
/**
 * @minItems 1
 */
export type Criteria1 = [Criterion, ...Criterion[]];
export type SchemaVersion18 = "1.0";
export type ScoringConfigHash = string;
export type Sections1 = Section[];
export type SemanticHash = string;
export type Title4 = string;
export type VersionId = string;
export type SchemaVersion19 = "1.0";
export type Speaker = "client" | "operator" | "bot" | "system";
export type Text = string;
export type TimestampOriginal = string;
export type Channel = "agent_chat" | "voice_call";
export type ContentHash1 = string;
export type ExternalId = string;
export type Id4 = string;
export type Language = "RU" | "KZ" | "EN";
/**
 * @minItems 1
 */
export type Messages = [Message1, ...Message1[]];
export type Id5 = string;
export type Ordinal = number;
export type ParsedTime = string | null;
export type SchemaVersion20 = "1.0";
export type SourceIndex = number;
export type Speaker1 = "client" | "operator" | "bot" | "system";
export type Text1 = string;
export type TimestampOriginal1 = string;
export type OccurredAt = string | null;
export type Revision = number;
export type SchemaVersion21 = "1.0";
export type Warnings = string[];
export type ChecklistVersionId = string | null;
export type FlagCriterionId = string | null;
export type FlagScope = "automatic" | "effective";
export type FlagStatus = ("detected" | "not_detected" | "unknown") | null;
export type SchemaVersion22 = "1.0";
export type ChecklistVersionId1 = string;
export type LatestJobId = string | null;
export type AnswerChoiceId = string | null;
export type CriterionId1 = string;
export type Detected = boolean | null;
export type SchemaVersion23 = "1.0";
export type SchemaVersion24 = "1.0";
export type Scope = "automatic" | "effective";
export type Status = "detected" | "not_detected" | "unknown";
export type Channel1 = "agent_chat" | "voice_call";
export type Language1 = "RU" | "KZ" | "EN";
export type Messages1 = ContentMessage[];
export type OccurredAt1 = string | null;
export type SchemaVersion25 = "1.0";
export type ChecklistVersionId2 = string | null;
export type DetectedFlag = boolean | null;
export type EvaluationStatus = "unevaluated" | "complete" | "partial" | "failed" | "pending";
export type LatestEvaluationId = string | null;
export type OpenAppeals = number;
export type ProfileId = string | null;
export type ResultScope = "automatic" | "effective";
export type ReviewReasons = ("incomplete" | "conflict" | "open_appeal" | "evaluation_failed")[];
export type SchemaVersion26 = "1.0";
export type TotalScore = string | null;
export type ApplicabilityPolicy = string;
export type ChunkId = string;
export type ContentHash2 = string;
export type Locator = string;
export type SchemaVersion27 = "1.0";
export type SourceId = string;
export type SourceVersion = string;
export type Text2 = string;
export type Chunks = SourceChunk[];
export type Id6 = string;
export type PriorityPolicy = string;
export type SchemaVersion28 = "1.0";
export type ContentHash3 = string;
export type EffectiveFrom = string | null;
export type EffectiveUntil = string | null;
export type LegalEntity = string | null;
export type Locator1 = string | null;
export type Product = string | null;
export type Provenance = "organizer" | "official_public" | "synthetic";
export type PublishedAt = string | null;
export type RetrievedAt = string;
export type SafeUrl = string | null;
export type SchemaVersion29 = "1.0";
export type SourceId1 = string;
export type Title5 = string;
export type Version = string;
export type Sources = SourceVersion1[];
export type ApplicabilityPolicy1 = string;
export type Chunks1 = SourceChunk[];
export type ContentHash4 = string;
export type Id7 = string;
export type PriorityPolicy1 = string;
export type SchemaVersion30 = "1.0";
export type Sources1 = SourceVersion1[];
export type Comment1 = string;
export type CriterionId2 = string;
export type ExpectedRevision = number;
export type SchemaVersion31 = "1.0";
export type ChecklistVersionId3 = string;
/**
 * @minItems 1
 * @maxItems 1000
 */
export type ConversationIds = [string, ...string[]];
export type Mode1 = "fresh" | "reuse_if_compatible";
export type ProfileId1 = string;
export type SchemaVersion32 = "1.0";
export type ExpectedLatestVersionId = string;
export type SchemaVersion33 = "1.0";
export type AnswerChoiceId1 = string | null;
export type Applicability = "applicable" | "not_applicable" | "undetermined";
export type CriterionId3 = string;
export type EndMessageId = string | null;
export type Explanation = string;
export type Kind = "message" | "range" | "source";
export type MessageIds = string[];
export type Relation = "support" | "counter" | "context";
export type SchemaVersion34 = "1.0";
export type SourceChunkId = string | null;
export type StartMessageId = string | null;
export type Evidence = Evidence1[];
export type Limitations = string[];
export type Origin = "ai" | "human" | "test";
export type Rationale = string;
/**
 * @minItems 1
 */
export type ReasonCodes = [ReasonCode, ...ReasonCode[]];
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ReasonCode".
 */
export type ReasonCode =
  | "criteria_met"
  | "criteria_partially_met"
  | "criteria_not_met"
  | "not_applicable"
  | "missing_expected_action"
  | "insufficient_evidence"
  | "conflicting_evidence"
  | "factual_verification_limited"
  | "violation_detected"
  | "no_violation_detected"
  | "other"
  | "human_confirmed"
  | "human_changed";
export type ReviewReasons1 = string[];
export type SchemaVersion35 = "1.0";
export type SchemaVersion36 = "1.0";
export type AppealId = string;
export type CreatedAt3 = string;
export type CriterionId4 = string;
export type Decision1 = "confirmed" | "changed";
export type EvaluationId1 = string;
export type ExpectedRevision1 = number;
export type Id8 = string;
export type Reason1 = string;
/**
 * @minItems 1
 */
export type ReasonCodes1 = [ReasonCode, ...ReasonCode[]];
export type Revision1 = number;
export type SchemaVersion37 = "1.0";
export type Decision2 = "confirmed" | "changed";
export type ExpectedRevision2 = number;
export type Reason2 = string;
export type SchemaVersion38 = "1.0";
export type AutomaticFinal = CriterionProposal[];
export type Calls = CallRecord[];
export type EvaluatorMode = "production" | "test";
export type AudioContentHash = string | null;
export type ChecklistSemanticHash = string;
export type ConversationContentHash = string;
export type CorpusSnapshotHash = string;
export type ProfileHash = string;
export type SchemaVersion39 = "1.0";
export type Initial = CriterionProposal[];
export type Limitations1 = string[];
export type CallIds = string[];
export type CriterionId5 = string;
export type Limitations2 = string[];
export type Outcome1 = "agreed" | "conflicted" | "skipped" | "failed";
export type SchemaVersion40 = "1.0";
export type Reviews = ReviewRecord[];
export type SchemaVersion41 = "1.0";
export type SchemaVersion42 = "1.0";
export type SourceFragments = SourceFragment[];
export type Status1 = "complete" | "partial" | "failed";
export type ChecklistVersionId4 = string;
export type CorpusSnapshotId = string;
export type CreatedAt4 = string;
export type Id9 = string;
export type AttemptId2 = string | null;
export type AttemptId3 = string;
export type FinishedAt1 = string | null;
export type Number = number;
export type SchemaVersion43 = "1.0";
export type StartedAt1 = string;
export type State1 = "running" | "succeeded" | "failed" | "expired" | "cancelled";
export type Attempts = JobAttempt[];
export type BatchId = string | null;
export type AttemptId4 = string;
export type ConsumedCalls = number;
export type ConsumedCost = string | null;
export type ConsumedTokens = number | null;
export type Currency1 = "USD";
export type DeadlineAt = string;
export type LogicalJobId1 = string;
export type MaxCost = string | null;
export type MaxProviderCalls = number;
export type MaxTotalTokens = number | null;
export type SchemaVersion44 = "1.0";
export type UsageComplete = boolean;
export type ConversationId = string;
export type ConversationRevision = number;
export type EvaluationId2 = string | null;
export type Id10 = string;
export type LeaseExpiresAt = string | null;
export type LeaseId = string | null;
export type MaxAttempts = number;
export type NextAttemptAt = string | null;
export type CompletedCalls = number;
export type SchemaVersion45 = "1.0";
export type Stage = "queued" | "evaluating" | "reviewing" | "persisting" | "done";
export type SchemaVersion46 = "1.0";
export type State2 = "queued" | "running" | "succeeded" | "retry_wait" | "failed" | "cancelled";
export type Jobs = Job[];
export type Mode2 = "fresh" | "reuse_if_compatible";
export type ProfileId2 = string;
export type ProfileVersion = string;
export type SchemaVersion47 = "1.0";
export type Calls1 = CallRecord[];
export type Cost1 = string | null;
export type CostComplete = boolean;
export type Currency2 = "USD";
export type SchemaVersion48 = "1.0";
export type AnswerChoiceId2 = string | null;
export type Applicability1 = "applicable" | "not_applicable" | "undetermined";
export type ApplicableWeight = string;
export type CriterionId6 = string;
export type EarnedWeight = string | null;
export type NormalizedContribution = string | null;
export type OriginalWeight = string;
export type RawValue1 = boolean | number | string | null;
export type SchemaVersion49 = "1.0";
export type ScoreFraction1 = string | null;
export type Contributions = ScoreContribution[];
export type Flags = FlagResult[];
export type SchemaVersion50 = "1.0";
export type SchemaVersion51 = "1.0";
export type SectionApplicableWeight = string;
export type SectionEarnedWeight = string;
export type SectionId1 = string;
export type SectionPercent = string | null;
export type SectionResults = SectionResult[];
export type Status2 = "complete" | "no_applicable_weight" | "incomplete_evaluation";
export type TotalScore1 = string | null;
export type ChecklistVersionId5 = string;
export type ConversationId1 = string;
export type ConversationRevision1 = number;
export type CorpusSnapshotId1 = string;
export type CreatedAt5 = string;
export type EffectiveProposals = CriterionProposal[];
export type HumanDecisions = Decision[];
export type Id11 = string;
export type ProfileId3 = string;
export type ProfileVersion1 = string;
export type Mode3 = "fresh" | "reuse_if_compatible";
export type ReuseKey = string;
export type ReusedFromEvaluationId = string | null;
export type SchemaVersion52 = "1.0";
export type Revision2 = number;
export type SchemaVersion53 = "1.0";
export type SourceFragments1 = SourceFragment[];
export type CorpusSnapshotId2 = string;
export type Fallbacks = ProviderSelection[];
export type MaxOutputTokens = number;
export type SchemaVersion54 = "1.0";
export type Seed = number | null;
export type Temperature = string;
export type Id12 = string;
export type Mode4 = "production" | "test";
export type OutputSchemaVersion = "1.0";
export type PreprocessingVersion = string;
export type PromptVersion = string;
export type CallTimeoutSeconds = number;
export type Currency3 = "USD";
export type JobDeadlineSeconds = number;
export type MaxCost1 = string | null;
export type MaxFormatRepairs = number;
export type MaxJobAttempts = number;
export type MaxProviderCalls1 = number;
export type MaxTotalTokens1 = number | null;
export type MaxTransportRetries = number;
export type SchemaVersion55 = "1.0";
export type Blind = true;
export type Enabled = boolean;
export type MaxCriteria = number;
export type SchemaVersion56 = "1.0";
export type Version1 = "keep_valid_initial_v1";
export type SchemaVersion57 = "1.0";
export type Version2 = string;
export type BusinessReady = boolean;
export type EvaluatorMode1 = "production" | "test";
export type Phase = "foundation" | "application";
export type SchemaVersion58 = "1.0";
export type Status3 = "ok";
export type SchemaVersion59 = "1.0";
export type Speaker2 = "client" | "operator" | "bot" | "system";
export type Text3 = string;
export type TimestampOriginal2 = string;
export type Channel2 = "agent_chat" | "voice_call";
export type ExternalId1 = string;
export type Language2 = "RU" | "KZ" | "EN";
/**
 * @minItems 1
 */
export type Messages2 = [ImportMessage, ...ImportMessage[]];
export type OccurredAt2 = string | null;
export type SchemaVersion60 = "1.0";
export type Atomic = true;
export type DeduplicatedCount = number;
export type ConversationId2 = string;
export type Disposition = "created" | "new_revision" | "unchanged";
export type Revision3 = number;
export type SchemaVersion61 = "1.0";
/**
 * @minItems 1
 */
export type SourceIndices = [number, ...number[]];
export type Items = ImportedRevision[];
export type ReceivedCount = number;
export type SchemaVersion62 = "1.0";
/**
 * @minItems 1
 * @maxItems 1000
 */
export type Records = [ImportRecord, ...ImportRecord[]];
export type SchemaVersion63 = "1.0";
export type Source = "json";
export type Items1 = SourceVersion1[];
export type Limit = number;
export type Offset = number;
export type SchemaVersion64 = "1.0";
export type Total1 = number;
export type Mode5 = "local" | "external_api" | "hybrid";
export type Name = string;
/**
 * @minItems 1
 */
export type Results = [OfficialSuccess | OfficialError, ...(OfficialSuccess | OfficialError)[]];
export type ConversationId3 = string;
/**
 * @minItems 8
 * @maxItems 8
 */
export type Criteria2 = [
  RequiredBinary | OptionalBinary | Consultation | Dialogue,
  RequiredBinary | OptionalBinary | Consultation | Dialogue,
  RequiredBinary | OptionalBinary | Consultation | Dialogue,
  RequiredBinary | OptionalBinary | Consultation | Dialogue,
  RequiredBinary | OptionalBinary | Consultation | Dialogue,
  RequiredBinary | OptionalBinary | Consultation | Dialogue,
  RequiredBinary | OptionalBinary | Consultation | Dialogue,
  RequiredBinary | OptionalBinary | Consultation | Dialogue
];
export type CriterionId7 = "contact" | "empathy" | "critical";
export type EvidenceTurns = number[];
export type Rationale1 = string;
export type Value = boolean;
export type CriterionId8 = "discovery" | "identification" | "closure";
export type EvidenceTurns1 = number[];
export type Rationale2 = string;
export type Value1 = boolean | null;
export type CriterionId9 = "consultation";
export type EvidenceTurns2 = number[];
export type Rationale3 = string;
export type Value2 = (0 | 5 | 10 | 15 | 20) | null;
export type CriterionId10 = "dialogue";
export type EvidenceTurns3 = number[];
export type Rationale4 = string;
export type Value3 = 0 | 4 | 7 | 10;
export type CriticalFlag = boolean;
export type FinalScore = number;
export type Status4 = "ok";
export type ConversationId4 = string;
/**
 * @maxItems 0
 */
export type Criteria3 = [];
export type Error = string;
export type Score = null;
export type Status5 = "error";
export type SchemaVersion65 = "1.0";
export type TeamName = string;
export type GroupId = string;
export type SchemaVersion66 = "1.0";
export type Source1 = "organizer_api";
export type Items2 = unknown[];
export type Limit1 = number;
export type Offset1 = number;
export type SchemaVersion67 = "1.0";
export type Total2 = number;
export type Items3 = ChecklistVersion[];
export type Limit2 = number;
export type Offset2 = number;
export type SchemaVersion68 = "1.0";
export type Total3 = number;
export type Items4 = SourceVersion1[];
export type Limit3 = number;
export type Offset3 = number;
export type SchemaVersion69 = "1.0";
export type Total4 = number;
export type Configured = boolean;
export type Preferred = boolean;
export type SchemaVersion70 = "1.0";
export type AnswerChoiceId3 = string | null;
export type Applicability2 = "applicable" | "not_applicable" | "undetermined";
export type ApplicableWeight1 = string;
export type CriterionId11 = string;
export type EarnedWeight1 = string | null;
export type EndMessageId1 = string | null;
export type Kind1 = "message" | "range" | "source";
export type MessageIds1 = string[];
export type Relation1 = "support" | "counter" | "context";
export type SchemaVersion71 = "1.0";
export type SourceChunkId1 = string | null;
export type StartMessageId1 = string | null;
export type Evidence2 = SafeEvidenceRef[];
export type FlagDetected = boolean | null;
export type NormalizedContribution1 = string | null;
export type Origin1 = "ai" | "human" | "test";
export type ReasonCodes2 = ReasonCode[];
export type SchemaVersion72 = "1.0";
export type ScoreFraction2 = string | null;
export type AppealId1 = string;
export type CriterionId12 = string;
export type Decision3 = "confirmed" | "changed";
export type Id13 = string;
export type ReasonCodes3 = ReasonCode[];
export type Revision4 = number;
export type SchemaVersion73 = "1.0";
export type BatchId1 = string | null;
export type GeneratedAt = string;
export type ChecklistVersionId6 = string;
export type ConversationId5 = string;
export type ConversationRevision2 = number;
export type CorpusSnapshotId3 = string;
export type Cost2 = string | null;
export type CostComplete1 = boolean;
export type Criteria4 = SafeCriterionResult[];
export type Currency4 = "USD";
export type Decisions = SafeDecision[];
export type EvaluationId3 = string | null;
export type EvaluationRevision = number | null;
export type EvaluationStatus1 = ("complete" | "partial" | "failed") | null;
export type JobId = string;
export type JobState = "queued" | "running" | "succeeded" | "retry_wait" | "failed" | "cancelled";
export type LimitationCodes = (
  | "test_evaluator"
  | "incomplete"
  | "review_unfinished"
  | "factual_verification_limited"
  | "audio_unavailable"
  | "cost_unknown"
  | "other"
)[];
export type ProfileId4 = string;
export type ProfileVersion2 = string;
export type SchemaVersion74 = "1.0";
export type ScoreStatus = ("complete" | "no_applicable_weight" | "incomplete_evaluation") | null;
export type TotalScore2 = string | null;
export type Items5 = SafeExportItem[];
export type SchemaVersion75 = "1.0";
export type Scope1 = "automatic" | "effective";
export type Id14 = string;
export type SchemaVersion76 = "1.0";
export type ScoreFraction3 = string | null;
export type Choices1 = ScoringChoice[];
export type Id15 = string;
export type SchemaVersion77 = "1.0";
export type SectionId2 = string | null;
export type Weight1 = string;
export type Criteria5 = ScoringCriterion[];
export type SchemaVersion78 = "1.0";
export type Sections2 = Section[];
export type AppealId2 = string;
export type Calls2 = CallRecord[];
export type CreatedAt6 = string;
export type CriterionId13 = string;
export type EvaluationId4 = string;
export type FinishedAt2 = string | null;
export type Id16 = string;
export type Mode6 = "production" | "test";
export type ProfileId5 = string;
export type ProfileVersion3 = string;
export type SchemaVersion79 = "1.0";
export type SourceFragments2 = SourceFragment[];
export type State3 = "running" | "succeeded" | "failed";
export type Anchor1 = string;
export type Id17 = string;
export type Label1 = string;
export type RawValue2 = boolean | number | string;
export type SchemaVersion80 = "1.0";
export type AllowNa1 = boolean;
export type Choices2 = SemanticChoice[];
export type Definition1 = string;
export type FlagWhenChoiceIds1 = string[];
export type Id18 = string;
export type NaCondition1 = string | null;
export type RequiresReference1 = boolean;
export type ResponseType1 = "binary" | "scale" | "flag";
export type SchemaVersion81 = "1.0";
export type Title6 = string;
export type Criteria6 = SemanticCriterion[];
export type SchemaVersion82 = "1.0";
export type ChecklistVersionId7 = string;
export type ProfileId6 = string;
export type ProfileVersion4 = string;
export type Redactions = string[];
export type SchemaVersion83 = "1.0";
export type SubmissionBranch = string;
export type TeamName1 = string;
export type Dataset = "dev" | "prod";
export type Channel3 = "agent_chat" | "voice_call";
export type ConversationId6 = string;
export type ExternalId2 = string;
export type Language3 = "RU" | "KZ" | "EN";
export type Revision5 = number;
export type SchemaVersion84 = "1.0";
/**
 * @minItems 1
 */
export type TurnHashes = [string, ...string[]];
export type Entries = SubmissionEntry[];
export type SchemaVersion85 = "1.0";
export type SourceSha256 = string;
export type BatchId2 = string | null;
export type ExternalId3 = string;
export type IdempotencyKey = string;
export type SchemaVersion86 = "1.0";
export type Attempts1 = SubmissionAttempt[];
export type ConfigSha256 = string;
export type ManifestSha256 = string;
export type SchemaVersion87 = "1.0";
export type Items6 = ChecklistVersion[];
export type Limit4 = number;
export type Offset4 = number;
export type SchemaVersion88 = "1.0";
export type Total5 = number;

export interface CQAContracts {
  APIError: APIError;
  Appeal: Appeal;
  AudioMapping: AudioMapping;
  AudioMetadata: AudioMetadata;
  BatchProgress: BatchProgress;
  CallEvent: CallEvent;
  CallRecord: CallRecord;
  ChannelInstructions: ChannelInstructions;
  ChecklistDraft: ChecklistDraft;
  ChecklistSummary: ChecklistSummary;
  ChecklistVersion: ChecklistVersion;
  Choice: Choice;
  ContentMessage: ContentMessage;
  Conversation: Conversation;
  ConversationFlagQuery: ConversationFlagQuery;
  ConversationFlagSummary: ConversationFlagSummary;
  ConversationHashInput: ConversationHashInput;
  ConversationSummary: ConversationSummary;
  CorpusHashInput: CorpusHashInput;
  CorpusSnapshot: CorpusSnapshot;
  CreateAppeal: CreateAppeal;
  CreateBatch: CreateBatch;
  CreateChecklistVersion: CreateChecklistVersion;
  Criterion: Criterion;
  CriterionProposal: CriterionProposal;
  DTO: DTO;
  Decision: Decision;
  DecisionRequest: DecisionRequest;
  ErrorDetail: ErrorDetail;
  EvaluationArtifact: EvaluationArtifact;
  EvaluationBatch: EvaluationBatch;
  EvaluationIdentity: EvaluationIdentity;
  EvaluationRun: EvaluationRun;
  EvaluationView: EvaluationView;
  EvaluatorProfile: EvaluatorProfile;
  Evidence: Evidence1;
  EvidencePolicy: EvidencePolicy;
  ExecutionBudget: ExecutionBudget;
  FlagResult: FlagResult;
  GenerationSettings: GenerationSettings;
  Health: Health;
  ImportMessage: ImportMessage;
  ImportRecord: ImportRecord;
  ImportResult: ImportResult;
  ImportedRevision: ImportedRevision;
  JSONImport: JSONImport;
  Job: Job;
  JobAttempt: JobAttempt;
  JobProgress: JobProgress;
  KnowledgeSources: KnowledgeSources;
  Message: Message1;
  OfficialResults: OfficialResults;
  OrganizerImport: OrganizerImport;
  Page: Page;
  "Page[ChecklistVersion]": PageChecklistVersion;
  "Page[SourceVersion]": PageSourceVersion;
  ProfileSummary: ProfileSummary;
  ProviderSelection: ProviderSelection;
  RetryPolicy: RetryPolicy;
  ReuseProvenance: ReuseProvenance;
  ReviewRecord: ReviewRecord;
  ReviewerPolicy: ReviewerPolicy;
  RoundingPolicy: RoundingPolicy;
  SafeCriterionResult: SafeCriterionResult;
  SafeDecision: SafeDecision;
  SafeEvidenceRef: SafeEvidenceRef;
  SafeExport: SafeExport;
  SafeExportItem: SafeExportItem;
  ScoreContribution: ScoreContribution;
  ScoreSummary: ScoreSummary;
  ScoringChoice: ScoringChoice;
  ScoringCriterion: ScoringCriterion;
  ScoringHashInput: ScoringHashInput;
  SecondOpinion: SecondOpinion;
  Section: Section;
  SectionResult: SectionResult;
  SemanticChoice: SemanticChoice;
  SemanticCriterion: SemanticCriterion;
  SemanticHashInput: SemanticHashInput;
  SourceChunk: SourceChunk;
  SourceFragment: SourceFragment;
  SourceVersion: SourceVersion1;
  SubmissionConfig: SubmissionConfig;
  SubmissionManifest: SubmissionManifest;
  SubmissionRun: SubmissionRun;
  TokenUsage: TokenUsage;
  VersionList: VersionList;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "APIError".
 */
export interface APIError {
  code: ErrorCode;
  correlation_id: CorrelationId;
  details?: Details;
  message: Message;
  retryable: Retryable;
  schema_version?: SchemaVersion1;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ErrorDetail".
 */
export interface ErrorDetail {
  field?: Field;
  index?: Index;
  reason: Reason;
  schema_version?: SchemaVersion;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "Appeal".
 */
export interface Appeal {
  comment: Comment;
  created_at: CreatedAt;
  criterion_id: CriterionId;
  effective_revision: EffectiveRevision;
  evaluation_id: EvaluationId;
  id: Id;
  schema_version?: SchemaVersion2;
  state: State;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "AudioMapping".
 */
export interface AudioMapping {
  end_seconds?: EndSeconds;
  message_id: MessageId;
  schema_version?: SchemaVersion3;
  start_seconds: StartSeconds;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "AudioMetadata".
 */
export interface AudioMetadata {
  access_path?: AccessPath;
  alignment_status: AlignmentStatus;
  availability: Availability;
  content_hash?: ContentHash;
  mapping?: Mapping;
  media_type?: MediaType;
  schema_version?: SchemaVersion4;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "BatchProgress".
 */
export interface BatchProgress {
  cancelled: Cancelled;
  failed: Failed;
  queued: Queued;
  retry_wait: RetryWait;
  running: Running;
  schema_version?: SchemaVersion5;
  succeeded: Succeeded;
  total: Total;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "CallEvent".
 */
export interface CallEvent {
  attempt_id: AttemptId;
  call_id: CallId;
  event: Event;
  logical_job_id: LogicalJobId;
  record: CallRecord;
  schema_version?: SchemaVersion9;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "CallRecord".
 */
export interface CallRecord {
  actual?: ProviderSelection | null;
  attempt_id: AttemptId1;
  call_id: CallId1;
  cost?: Cost;
  currency?: Currency;
  finish_reason?: FinishReason;
  finished_at?: FinishedAt;
  outcome: Outcome;
  price_version?: PriceVersion;
  purpose: Purpose;
  requested: ProviderSelection;
  safe_error?: APIError | null;
  schema_version?: SchemaVersion7;
  started_at: StartedAt;
  usage?: TokenUsage | null;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ProviderSelection".
 */
export interface ProviderSelection {
  configuration_ref: ConfigurationRef;
  model: Model;
  provider: Provider;
  schema_version?: SchemaVersion6;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "TokenUsage".
 */
export interface TokenUsage {
  cached_tokens?: CachedTokens;
  input_tokens?: InputTokens;
  output_tokens?: OutputTokens;
  reasoning_tokens?: ReasoningTokens;
  schema_version?: SchemaVersion8;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ChannelInstructions".
 */
export interface ChannelInstructions {
  agent_chat?: AgentChat;
  schema_version?: SchemaVersion10;
  voice_call?: VoiceCall;
  voice_policy_version?: VoicePolicyVersion;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ChecklistDraft".
 */
export interface ChecklistDraft {
  criteria: Criteria;
  rounding?: RoundingPolicy;
  schema_version?: SchemaVersion15;
  sections?: Sections;
  title: Title2;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "Criterion".
 */
export interface Criterion {
  allow_na: AllowNa;
  channel_instructions: ChannelInstructions;
  choices: Choices;
  definition: Definition;
  evidence_policy: EvidencePolicy;
  flag_when_choice_ids?: FlagWhenChoiceIds;
  id: Id2;
  na_condition: NaCondition;
  requires_reference: RequiresReference;
  response_type: ResponseType;
  schema_version?: SchemaVersion13;
  section_id?: SectionId;
  title: Title;
  weight: Weight;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "Choice".
 */
export interface Choice {
  anchor: Anchor;
  id: Id1;
  label: Label;
  raw_value: RawValue;
  schema_version?: SchemaVersion11;
  score_fraction: ScoreFraction;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "EvidencePolicy".
 */
export interface EvidencePolicy {
  allow_source?: AllowSource;
  missing_action_requires_range?: MissingActionRequiresRange;
  require_evidence?: RequireEvidence;
  schema_version?: SchemaVersion12;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "RoundingPolicy".
 */
export interface RoundingPolicy {
  decimal_places?: DecimalPlaces;
  intermediate_rounding?: IntermediateRounding;
  mode?: Mode;
  schema_version?: SchemaVersion14;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "Section".
 */
export interface Section {
  id: Id3;
  schema_version?: SchemaVersion16;
  title: Title1;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ChecklistSummary".
 */
export interface ChecklistSummary {
  checklist_id: ChecklistId;
  created_at: CreatedAt1;
  latest_version_id: LatestVersionId;
  schema_version?: SchemaVersion17;
  title: Title3;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ChecklistVersion".
 */
export interface ChecklistVersion {
  checklist_id: ChecklistId1;
  created_at: CreatedAt2;
  criteria: Criteria1;
  rounding?: RoundingPolicy;
  schema_version?: SchemaVersion18;
  scoring_config_hash: ScoringConfigHash;
  sections?: Sections1;
  semantic_hash: SemanticHash;
  title: Title4;
  version_id: VersionId;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ContentMessage".
 */
export interface ContentMessage {
  schema_version?: SchemaVersion19;
  speaker: Speaker;
  text: Text;
  timestamp_original: TimestampOriginal;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "Conversation".
 */
export interface Conversation {
  audio: AudioMetadata;
  channel: Channel;
  content_hash: ContentHash1;
  external_id: ExternalId;
  id: Id4;
  language: Language;
  messages: Messages;
  occurred_at?: OccurredAt;
  revision: Revision;
  schema_version?: SchemaVersion21;
  warnings?: Warnings;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "Message".
 */
export interface Message1 {
  id: Id5;
  ordinal: Ordinal;
  parsed_time?: ParsedTime;
  schema_version?: SchemaVersion20;
  source_index: SourceIndex;
  speaker: Speaker1;
  text: Text1;
  timestamp_original: TimestampOriginal1;
}
/**
 * Validated selection for listConversations; no business filtering here.
 *
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ConversationFlagQuery".
 */
export interface ConversationFlagQuery {
  checklist_version_id?: ChecklistVersionId;
  flag_criterion_id?: FlagCriterionId;
  flag_scope?: FlagScope;
  flag_status?: FlagStatus;
  schema_version?: SchemaVersion22;
}
/**
 * One selected flag; details use latest_evaluation_id and result.criterion_id.
 *
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ConversationFlagSummary".
 */
export interface ConversationFlagSummary {
  checklist_version_id: ChecklistVersionId1;
  latest_job_id: LatestJobId;
  result: FlagResult;
  schema_version?: SchemaVersion24;
  scope: Scope;
  status: Status;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "FlagResult".
 */
export interface FlagResult {
  answer_choice_id: AnswerChoiceId;
  criterion_id: CriterionId1;
  detected: Detected;
  schema_version?: SchemaVersion23;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ConversationHashInput".
 */
export interface ConversationHashInput {
  channel: Channel1;
  language: Language1;
  messages: Messages1;
  occurred_at?: OccurredAt1;
  schema_version?: SchemaVersion25;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ConversationSummary".
 */
export interface ConversationSummary {
  checklist_version_id?: ChecklistVersionId2;
  conversation: Conversation;
  detected_flag?: DetectedFlag;
  evaluation_status: EvaluationStatus;
  flag_summary?: ConversationFlagSummary | null;
  latest_evaluation_id?: LatestEvaluationId;
  open_appeals?: OpenAppeals;
  profile_id?: ProfileId;
  result_scope?: ResultScope;
  review_reasons?: ReviewReasons;
  schema_version?: SchemaVersion26;
  total_score?: TotalScore;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "CorpusHashInput".
 */
export interface CorpusHashInput {
  applicability_policy: ApplicabilityPolicy;
  chunks: Chunks;
  id: Id6;
  priority_policy: PriorityPolicy;
  schema_version?: SchemaVersion28;
  sources: Sources;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "SourceChunk".
 */
export interface SourceChunk {
  chunk_id: ChunkId;
  content_hash: ContentHash2;
  locator: Locator;
  schema_version?: SchemaVersion27;
  source_id: SourceId;
  source_version: SourceVersion;
  text: Text2;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "SourceVersion".
 */
export interface SourceVersion1 {
  content_hash: ContentHash3;
  effective_from?: EffectiveFrom;
  effective_until?: EffectiveUntil;
  legal_entity?: LegalEntity;
  locator?: Locator1;
  product?: Product;
  provenance: Provenance;
  published_at?: PublishedAt;
  retrieved_at: RetrievedAt;
  safe_url: SafeUrl;
  schema_version?: SchemaVersion29;
  source_id: SourceId1;
  title: Title5;
  version: Version;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "CorpusSnapshot".
 */
export interface CorpusSnapshot {
  applicability_policy: ApplicabilityPolicy1;
  chunks: Chunks1;
  content_hash: ContentHash4;
  id: Id7;
  priority_policy: PriorityPolicy1;
  schema_version?: SchemaVersion30;
  sources: Sources1;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "CreateAppeal".
 */
export interface CreateAppeal {
  comment: Comment1;
  criterion_id: CriterionId2;
  expected_revision: ExpectedRevision;
  schema_version?: SchemaVersion31;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "CreateBatch".
 */
export interface CreateBatch {
  checklist_version_id: ChecklistVersionId3;
  conversation_ids: ConversationIds;
  mode: Mode1;
  profile_id: ProfileId1;
  schema_version?: SchemaVersion32;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "CreateChecklistVersion".
 */
export interface CreateChecklistVersion {
  config: ChecklistDraft;
  expected_latest_version_id: ExpectedLatestVersionId;
  schema_version?: SchemaVersion33;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "CriterionProposal".
 */
export interface CriterionProposal {
  answer_choice_id: AnswerChoiceId1;
  applicability: Applicability;
  criterion_id: CriterionId3;
  evidence: Evidence;
  limitations?: Limitations;
  origin?: Origin;
  rationale: Rationale;
  reason_codes: ReasonCodes;
  review_reasons?: ReviewReasons1;
  schema_version?: SchemaVersion35;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "Evidence".
 */
export interface Evidence1 {
  end_message_id?: EndMessageId;
  explanation: Explanation;
  kind: Kind;
  message_ids?: MessageIds;
  relation: Relation;
  schema_version?: SchemaVersion34;
  source_chunk_id?: SourceChunkId;
  start_message_id?: StartMessageId;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "DTO".
 */
export interface DTO {
  schema_version?: SchemaVersion36;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "Decision".
 */
export interface Decision {
  appeal_id: AppealId;
  created_at: CreatedAt3;
  criterion_id: CriterionId4;
  decision: Decision1;
  evaluation_id: EvaluationId1;
  expected_revision: ExpectedRevision1;
  id: Id8;
  reason: Reason1;
  reason_codes: ReasonCodes1;
  replacement?: CriterionProposal | null;
  revision: Revision1;
  schema_version?: SchemaVersion37;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "DecisionRequest".
 */
export interface DecisionRequest {
  decision: Decision2;
  expected_revision: ExpectedRevision2;
  reason: Reason2;
  replacement?: CriterionProposal | null;
  schema_version?: SchemaVersion38;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "EvaluationArtifact".
 */
export interface EvaluationArtifact {
  automatic_final: AutomaticFinal;
  calls: Calls;
  error?: APIError | null;
  evaluator_mode: EvaluatorMode;
  identity: EvaluationIdentity;
  initial: Initial;
  limitations?: Limitations1;
  reviews: Reviews;
  schema_version?: SchemaVersion41;
  source_fragments?: SourceFragments;
  status: Status1;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "EvaluationIdentity".
 */
export interface EvaluationIdentity {
  audio_content_hash?: AudioContentHash;
  checklist_semantic_hash: ChecklistSemanticHash;
  conversation_content_hash: ConversationContentHash;
  corpus_snapshot_hash: CorpusSnapshotHash;
  profile_hash: ProfileHash;
  schema_version?: SchemaVersion39;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ReviewRecord".
 */
export interface ReviewRecord {
  call_ids: CallIds;
  criterion_id: CriterionId5;
  limitations?: Limitations2;
  outcome: Outcome1;
  proposal: CriterionProposal | null;
  schema_version?: SchemaVersion40;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "SourceFragment".
 */
export interface SourceFragment {
  chunk: SourceChunk;
  schema_version?: SchemaVersion42;
  source: SourceVersion1;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "EvaluationBatch".
 */
export interface EvaluationBatch {
  checklist_version_id: ChecklistVersionId4;
  corpus_snapshot_id: CorpusSnapshotId;
  created_at: CreatedAt4;
  id: Id9;
  jobs: Jobs;
  mode: Mode2;
  profile_id: ProfileId2;
  profile_version: ProfileVersion;
  progress: BatchProgress;
  schema_version?: SchemaVersion47;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "Job".
 */
export interface Job {
  attempt_id: AttemptId2;
  attempts: Attempts;
  batch_id: BatchId;
  budget: ExecutionBudget | null;
  conversation_id: ConversationId;
  conversation_revision: ConversationRevision;
  error: APIError | null;
  evaluation_id: EvaluationId2;
  id: Id10;
  lease_expires_at: LeaseExpiresAt;
  lease_id: LeaseId;
  max_attempts: MaxAttempts;
  next_attempt_at: NextAttemptAt;
  progress: JobProgress;
  schema_version?: SchemaVersion46;
  state: State2;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "JobAttempt".
 */
export interface JobAttempt {
  attempt_id: AttemptId3;
  error: APIError | null;
  finished_at: FinishedAt1;
  number: Number;
  schema_version?: SchemaVersion43;
  started_at: StartedAt1;
  state: State1;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ExecutionBudget".
 */
export interface ExecutionBudget {
  attempt_id: AttemptId4;
  consumed_calls: ConsumedCalls;
  consumed_cost?: ConsumedCost;
  consumed_tokens?: ConsumedTokens;
  currency?: Currency1;
  deadline_at: DeadlineAt;
  logical_job_id: LogicalJobId1;
  max_cost?: MaxCost;
  max_provider_calls: MaxProviderCalls;
  max_total_tokens?: MaxTotalTokens;
  schema_version?: SchemaVersion44;
  usage_complete?: UsageComplete;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "JobProgress".
 */
export interface JobProgress {
  completed_calls: CompletedCalls;
  schema_version?: SchemaVersion45;
  stage: Stage;
}
/**
 * Current job ledger, separate from the immutable evaluation artifact.
 *
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "EvaluationRun".
 */
export interface EvaluationRun {
  calls: Calls1;
  cost: Cost1;
  cost_complete: CostComplete;
  currency?: Currency2;
  job: Job;
  schema_version?: SchemaVersion48;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "EvaluationView".
 */
export interface EvaluationView {
  artifact: EvaluationArtifact;
  automatic_score: ScoreSummary;
  checklist_version_id: ChecklistVersionId5;
  conversation_id: ConversationId1;
  conversation_revision: ConversationRevision1;
  corpus_snapshot_id: CorpusSnapshotId1;
  created_at: CreatedAt5;
  effective_proposals: EffectiveProposals;
  effective_score: ScoreSummary;
  human_decisions: HumanDecisions;
  id: Id11;
  profile_id: ProfileId3;
  profile_version: ProfileVersion1;
  reuse: ReuseProvenance;
  revision: Revision2;
  run?: EvaluationRun | null;
  schema_version?: SchemaVersion53;
  source_fragments: SourceFragments1;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ScoreSummary".
 */
export interface ScoreSummary {
  contributions: Contributions;
  flags: Flags;
  schema_version?: SchemaVersion50;
  section_results: SectionResults;
  status: Status2;
  total_score: TotalScore1;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ScoreContribution".
 */
export interface ScoreContribution {
  answer_choice_id: AnswerChoiceId2;
  applicability: Applicability1;
  applicable_weight: ApplicableWeight;
  criterion_id: CriterionId6;
  earned_weight: EarnedWeight;
  normalized_contribution: NormalizedContribution;
  original_weight: OriginalWeight;
  raw_value: RawValue1;
  schema_version?: SchemaVersion49;
  score_fraction: ScoreFraction1;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "SectionResult".
 */
export interface SectionResult {
  schema_version?: SchemaVersion51;
  section_applicable_weight: SectionApplicableWeight;
  section_earned_weight: SectionEarnedWeight;
  section_id: SectionId1;
  section_percent: SectionPercent;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ReuseProvenance".
 */
export interface ReuseProvenance {
  mode: Mode3;
  reuse_key: ReuseKey;
  reused_from_evaluation_id: ReusedFromEvaluationId;
  schema_version?: SchemaVersion52;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "EvaluatorProfile".
 */
export interface EvaluatorProfile {
  corpus_snapshot_id: CorpusSnapshotId2;
  fallbacks?: Fallbacks;
  generation: GenerationSettings;
  id: Id12;
  mode: Mode4;
  output_schema_version?: OutputSchemaVersion;
  preprocessing_version: PreprocessingVersion;
  primary: ProviderSelection;
  prompt_version: PromptVersion;
  retries: RetryPolicy;
  reviewer?: ProviderSelection | null;
  reviewer_policy: ReviewerPolicy;
  schema_version?: SchemaVersion57;
  version: Version2;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "GenerationSettings".
 */
export interface GenerationSettings {
  max_output_tokens?: MaxOutputTokens;
  schema_version?: SchemaVersion54;
  seed?: Seed;
  temperature?: Temperature;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "RetryPolicy".
 */
export interface RetryPolicy {
  call_timeout_seconds?: CallTimeoutSeconds;
  currency?: Currency3;
  job_deadline_seconds?: JobDeadlineSeconds;
  max_cost?: MaxCost1;
  max_format_repairs?: MaxFormatRepairs;
  max_job_attempts?: MaxJobAttempts;
  max_provider_calls?: MaxProviderCalls1;
  max_total_tokens?: MaxTotalTokens1;
  max_transport_retries?: MaxTransportRetries;
  schema_version?: SchemaVersion55;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ReviewerPolicy".
 */
export interface ReviewerPolicy {
  blind?: Blind;
  enabled?: Enabled;
  max_criteria?: MaxCriteria;
  schema_version?: SchemaVersion56;
  version?: Version1;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "Health".
 */
export interface Health {
  business_ready?: BusinessReady;
  evaluator_mode?: EvaluatorMode1;
  phase?: Phase;
  schema_version?: SchemaVersion58;
  status?: Status3;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ImportMessage".
 */
export interface ImportMessage {
  schema_version?: SchemaVersion59;
  speaker: Speaker2;
  text: Text3;
  timestamp_original: TimestampOriginal2;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ImportRecord".
 */
export interface ImportRecord {
  channel: Channel2;
  external_id: ExternalId1;
  language: Language2;
  messages: Messages2;
  occurred_at?: OccurredAt2;
  schema_version?: SchemaVersion60;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ImportResult".
 */
export interface ImportResult {
  atomic?: Atomic;
  deduplicated_count: DeduplicatedCount;
  items: Items;
  received_count: ReceivedCount;
  schema_version?: SchemaVersion62;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ImportedRevision".
 */
export interface ImportedRevision {
  conversation_id: ConversationId2;
  disposition: Disposition;
  revision: Revision3;
  schema_version?: SchemaVersion61;
  source_indices: SourceIndices;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "JSONImport".
 */
export interface JSONImport {
  records: Records;
  schema_version?: SchemaVersion63;
  source: Source;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "KnowledgeSources".
 */
export interface KnowledgeSources {
  items: Items1;
  limit: Limit;
  offset: Offset;
  schema_version?: SchemaVersion64;
  total: Total1;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "OfficialResults".
 */
export interface OfficialResults {
  model: OfficialModel;
  results: Results;
  schema_version: SchemaVersion65;
  team_name: TeamName;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "OfficialModel".
 */
export interface OfficialModel {
  mode: Mode5;
  name: Name;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "OfficialSuccess".
 */
export interface OfficialSuccess {
  conversation_id: ConversationId3;
  criteria: Criteria2;
  score: OfficialScore;
  status: Status4;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "RequiredBinary".
 */
export interface RequiredBinary {
  criterion_id: CriterionId7;
  evidence_turns: EvidenceTurns;
  rationale: Rationale1;
  value: Value;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "OptionalBinary".
 */
export interface OptionalBinary {
  criterion_id: CriterionId8;
  evidence_turns: EvidenceTurns1;
  rationale: Rationale2;
  value: Value1;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "Consultation".
 */
export interface Consultation {
  criterion_id: CriterionId9;
  evidence_turns: EvidenceTurns2;
  rationale: Rationale3;
  value: Value2;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "Dialogue".
 */
export interface Dialogue {
  criterion_id: CriterionId10;
  evidence_turns: EvidenceTurns3;
  rationale: Rationale4;
  value: Value3;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "OfficialScore".
 */
export interface OfficialScore {
  critical_flag: CriticalFlag;
  final_score: FinalScore;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "OfficialError".
 */
export interface OfficialError {
  conversation_id: ConversationId4;
  criteria: Criteria3;
  error: Error;
  score: Score;
  status: Status5;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "OrganizerImport".
 */
export interface OrganizerImport {
  group_id: GroupId;
  schema_version?: SchemaVersion66;
  source: Source1;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "Page".
 */
export interface Page {
  items: Items2;
  limit: Limit1;
  offset: Offset1;
  schema_version?: SchemaVersion67;
  total: Total2;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "Page_ChecklistVersion_".
 */
export interface PageChecklistVersion {
  items: Items3;
  limit: Limit2;
  offset: Offset2;
  schema_version?: SchemaVersion68;
  total: Total3;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "Page_SourceVersion_".
 */
export interface PageSourceVersion {
  items: Items4;
  limit: Limit3;
  offset: Offset3;
  schema_version?: SchemaVersion69;
  total: Total4;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ProfileSummary".
 */
export interface ProfileSummary {
  configuration_error?: APIError | null;
  configured: Configured;
  preferred?: Preferred;
  profile: EvaluatorProfile;
  schema_version?: SchemaVersion70;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "SafeCriterionResult".
 */
export interface SafeCriterionResult {
  answer_choice_id: AnswerChoiceId3;
  applicability: Applicability2;
  applicable_weight: ApplicableWeight1;
  criterion_id: CriterionId11;
  earned_weight: EarnedWeight1;
  evidence: Evidence2;
  flag_detected?: FlagDetected;
  normalized_contribution: NormalizedContribution1;
  origin: Origin1;
  reason_codes: ReasonCodes2;
  schema_version?: SchemaVersion72;
  score_fraction: ScoreFraction2;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "SafeEvidenceRef".
 */
export interface SafeEvidenceRef {
  end_message_id?: EndMessageId1;
  kind: Kind1;
  message_ids?: MessageIds1;
  relation: Relation1;
  schema_version?: SchemaVersion71;
  source_chunk_id?: SourceChunkId1;
  start_message_id?: StartMessageId1;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "SafeDecision".
 */
export interface SafeDecision {
  appeal_id: AppealId1;
  criterion_id: CriterionId12;
  decision: Decision3;
  id: Id13;
  reason_codes: ReasonCodes3;
  revision: Revision4;
  schema_version?: SchemaVersion73;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "SafeExport".
 */
export interface SafeExport {
  batch_id: BatchId1;
  generated_at: GeneratedAt;
  items: Items5;
  schema_version?: SchemaVersion75;
  scope: Scope1;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "SafeExportItem".
 */
export interface SafeExportItem {
  checklist_version_id: ChecklistVersionId6;
  conversation_id: ConversationId5;
  conversation_revision: ConversationRevision2;
  corpus_snapshot_id: CorpusSnapshotId3;
  cost?: Cost2;
  cost_complete?: CostComplete1;
  criteria: Criteria4;
  currency?: Currency4;
  decisions: Decisions;
  error_code: ErrorCode | null;
  evaluation_id: EvaluationId3;
  evaluation_revision?: EvaluationRevision;
  evaluation_status: EvaluationStatus1;
  job_id: JobId;
  job_state: JobState;
  limitation_codes: LimitationCodes;
  profile_id: ProfileId4;
  profile_version: ProfileVersion2;
  schema_version?: SchemaVersion74;
  score_status: ScoreStatus;
  total_score: TotalScore2;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ScoringChoice".
 */
export interface ScoringChoice {
  id: Id14;
  schema_version?: SchemaVersion76;
  score_fraction: ScoreFraction3;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ScoringCriterion".
 */
export interface ScoringCriterion {
  choices: Choices1;
  id: Id15;
  schema_version?: SchemaVersion77;
  section_id?: SectionId2;
  weight: Weight1;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "ScoringHashInput".
 */
export interface ScoringHashInput {
  criteria: Criteria5;
  rounding: RoundingPolicy;
  schema_version?: SchemaVersion78;
  sections: Sections2;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "SecondOpinion".
 */
export interface SecondOpinion {
  appeal_id: AppealId2;
  calls?: Calls2;
  created_at: CreatedAt6;
  criterion_id: CriterionId13;
  error?: APIError | null;
  evaluation_id: EvaluationId4;
  finished_at?: FinishedAt2;
  id: Id16;
  mode: Mode6;
  profile_id: ProfileId5;
  profile_version: ProfileVersion3;
  proposal?: CriterionProposal | null;
  schema_version?: SchemaVersion79;
  source_fragments?: SourceFragments2;
  state: State3;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "SemanticChoice".
 */
export interface SemanticChoice {
  anchor: Anchor1;
  id: Id17;
  label: Label1;
  raw_value: RawValue2;
  schema_version?: SchemaVersion80;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "SemanticCriterion".
 */
export interface SemanticCriterion {
  allow_na: AllowNa1;
  channel_instructions: ChannelInstructions;
  choices: Choices2;
  definition: Definition1;
  evidence_policy: EvidencePolicy;
  flag_when_choice_ids?: FlagWhenChoiceIds1;
  id: Id18;
  na_condition: NaCondition1;
  requires_reference: RequiresReference1;
  response_type: ResponseType1;
  schema_version?: SchemaVersion81;
  title: Title6;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "SemanticHashInput".
 */
export interface SemanticHashInput {
  criteria: Criteria6;
  schema_version?: SchemaVersion82;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "SubmissionConfig".
 */
export interface SubmissionConfig {
  checklist_version_id: ChecklistVersionId7;
  profile_id: ProfileId6;
  profile_version: ProfileVersion4;
  redactions?: Redactions;
  schema_version?: SchemaVersion83;
  submission_branch: SubmissionBranch;
  team_name: TeamName1;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "SubmissionManifest".
 */
export interface SubmissionManifest {
  dataset: Dataset;
  entries: Entries;
  schema_version?: SchemaVersion85;
  source_sha256: SourceSha256;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "SubmissionEntry".
 */
export interface SubmissionEntry {
  channel: Channel3;
  conversation_id: ConversationId6;
  external_id: ExternalId2;
  language: Language3;
  revision: Revision5;
  schema_version?: SchemaVersion84;
  turn_hashes: TurnHashes;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "SubmissionRun".
 */
export interface SubmissionRun {
  attempts: Attempts1;
  config_sha256: ConfigSha256;
  manifest_sha256: ManifestSha256;
  schema_version?: SchemaVersion87;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "SubmissionAttempt".
 */
export interface SubmissionAttempt {
  batch_id?: BatchId2;
  external_id: ExternalId3;
  idempotency_key: IdempotencyKey;
  schema_version?: SchemaVersion86;
}
/**
 * This interface was referenced by `CQAContracts`'s JSON-Schema
 * via the `definition` "VersionList".
 */
export interface VersionList {
  items: Items6;
  limit: Limit4;
  offset: Offset4;
  schema_version?: SchemaVersion88;
  total: Total5;
}
