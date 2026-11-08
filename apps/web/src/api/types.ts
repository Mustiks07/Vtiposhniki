// Aliases over the generated contract. Never redefine DTO shapes here.
import type { components, paths } from '../../../../contracts/typescript/api';

type S = components['schemas'];

export type APIErrorBody = S['APIError'];
export type Health = S['Health'];
export type Conversation = S['Conversation'];
export type ConversationSummary = S['ConversationSummary'];
export type Message = S['Message'];
export type AudioMetadata = S['AudioMetadata'];
export type ImportRecord = S['ImportRecord'];
export type ImportResult = S['ImportResult'];
export type JSONImport = S['JSONImport'];
export type OrganizerImport = S['OrganizerImport'];
export type ChecklistSummary = S['ChecklistSummary'];
export type ChecklistDraft = S['ChecklistDraft'];
export type ChecklistVersion = S['ChecklistVersion'];
export type Criterion = S['Criterion'];
export type Choice = S['Choice'];
export type Section = S['Section'];
export type CreateChecklistVersion = S['CreateChecklistVersion'];
export type CreateBatch = S['CreateBatch'];
export type EvaluationBatch = S['EvaluationBatch'];
export type Job = S['Job'];
export type EvaluationView = S['EvaluationView'];
export type EvaluationArtifact = S['EvaluationArtifact'];
export type CriterionProposal = S['CriterionProposal'];
export type Evidence = S['Evidence'];
export type ScoreSummary = S['ScoreSummary'];
export type ScoreContribution = S['ScoreContribution'];
export type SectionResult = S['SectionResult'];
export type FlagResult = S['FlagResult'];
export type CallRecord = S['CallRecord'];
export type ReviewRecord = S['ReviewRecord'];
export type SourceFragment = S['SourceFragment'];
export type Appeal = S['Appeal'];
export type SecondOpinion = S['SecondOpinion'];
export type SecondOpinionPage = S['Page_SecondOpinion_'];
export type AssistantRun = S['AssistantRun'];
export type AssistantRunPage = S['Page_AssistantRun_'];
export type CoachingRequest = S['CoachingRequest'];
export type CreateAppeal = S['CreateAppeal'];
export type Decision = S['Decision'];
export type DecisionRequest = S['DecisionRequest'];
export type ProfileSummary = S['ProfileSummary'];
export type SafeExport = S['SafeExport'];
export type ReasonCode = CriterionProposal['reason_codes'][number];

export type ConversationPage = S['Page_ConversationSummary_'];
export type ChecklistPage = S['Page_ChecklistSummary_'];
export type EvaluationPage = S['Page_EvaluationView_'];
export type AppealPage = S['Page_Appeal_'];
export type ProfilePage = S['Page_ProfileSummary_'];
export type VersionList = S['VersionList'];

export type ConversationFlagSummary = S['ConversationFlagSummary'];
export type FlagStatus = ConversationFlagSummary['status'];
export type FlagScope = ConversationFlagSummary['scope'];
/** Query of listConversations, straight from the generated operation contract (1.1.0). */
export type ConversationQuery = NonNullable<paths['/api/v1/conversations']['get']['parameters']['query']>;

export type Language = Conversation['language'];
export type Channel = Conversation['channel'];
export type EvaluationListStatus = ConversationSummary['evaluation_status'];
