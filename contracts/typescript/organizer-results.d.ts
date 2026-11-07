/* Generated from cqa_contracts.submission. DO NOT EDIT. */

export type Mode = "local" | "external_api" | "hybrid";
export type Name = string;
/**
 * @minItems 1
 */
export type Results = [OfficialSuccess | OfficialError, ...(OfficialSuccess | OfficialError)[]];
export type ConversationId = string;
/**
 * @minItems 8
 * @maxItems 8
 */
export type Criteria = [
  RequiredBinary | OptionalBinary | Consultation | Dialogue,
  RequiredBinary | OptionalBinary | Consultation | Dialogue,
  RequiredBinary | OptionalBinary | Consultation | Dialogue,
  RequiredBinary | OptionalBinary | Consultation | Dialogue,
  RequiredBinary | OptionalBinary | Consultation | Dialogue,
  RequiredBinary | OptionalBinary | Consultation | Dialogue,
  RequiredBinary | OptionalBinary | Consultation | Dialogue,
  RequiredBinary | OptionalBinary | Consultation | Dialogue
];
export type CriterionId = "contact" | "empathy" | "critical";
export type EvidenceTurns = number[];
export type Rationale = string;
export type Value = boolean;
export type CriterionId1 = "discovery" | "identification" | "closure";
export type EvidenceTurns1 = number[];
export type Rationale1 = string;
export type Value1 = boolean | null;
export type CriterionId2 = "consultation";
export type EvidenceTurns2 = number[];
export type Rationale2 = string;
export type Value2 = (0 | 5 | 10 | 15 | 20) | null;
export type CriterionId3 = "dialogue";
export type EvidenceTurns3 = number[];
export type Rationale3 = string;
export type Value3 = 0 | 4 | 7 | 10;
export type CriticalFlag = boolean;
export type FinalScore = number;
export type Status = "ok";
export type ConversationId1 = string;
/**
 * @maxItems 0
 */
export type Criteria1 = [];
export type Error = string;
export type Score = null;
export type Status1 = "error";
export type SchemaVersion = "1.0";
export type TeamName = string;

export interface OfficialResults {
  model: OfficialModel;
  results: Results;
  schema_version: SchemaVersion;
  team_name: TeamName;
}
export interface OfficialModel {
  mode: Mode;
  name: Name;
}
export interface OfficialSuccess {
  conversation_id: ConversationId;
  criteria: Criteria;
  score: OfficialScore;
  status: Status;
}
export interface RequiredBinary {
  criterion_id: CriterionId;
  evidence_turns: EvidenceTurns;
  rationale: Rationale;
  value: Value;
}
export interface OptionalBinary {
  criterion_id: CriterionId1;
  evidence_turns: EvidenceTurns1;
  rationale: Rationale1;
  value: Value1;
}
export interface Consultation {
  criterion_id: CriterionId2;
  evidence_turns: EvidenceTurns2;
  rationale: Rationale2;
  value: Value2;
}
export interface Dialogue {
  criterion_id: CriterionId3;
  evidence_turns: EvidenceTurns3;
  rationale: Rationale3;
  value: Value3;
}
export interface OfficialScore {
  critical_flag: CriticalFlag;
  final_score: FinalScore;
}
export interface OfficialError {
  conversation_id: ConversationId1;
  criteria: Criteria1;
  error: Error;
  score: Score;
  status: Status1;
}
