"""Claude A implements these entrypoints after foundation."""

from cqa_contracts.models import (
    ChecklistVersion,
    Conversation,
    CorpusSnapshot,
    CriterionProposal,
    EvaluationArtifact,
    EvaluationIdentity,
    EvaluatorProfile,
    ScoreSummary,
)


def validate_checklist(config: ChecklistVersion) -> None:
    raise NotImplementedError("Claude A: implement checklist business validation")


def score(checklist: ChecklistVersion, proposals: list[CriterionProposal]) -> ScoreSummary:
    raise NotImplementedError("Claude A: implement the single Decimal scorer")


def validate_artifact(
    conversation: Conversation,
    checklist: ChecklistVersion,
    corpus: CorpusSnapshot,
    artifact: EvaluationArtifact,
) -> None:
    raise NotImplementedError("Claude A: implement cross-object artifact validation")


def conversation_content_hash(conversation: Conversation) -> str:
    raise NotImplementedError("Claude A: implement content projection/hash")


def checklist_semantic_hash(checklist: ChecklistVersion) -> str:
    raise NotImplementedError("Claude A: implement semantic projection/hash")


def checklist_scoring_hash(checklist: ChecklistVersion) -> str:
    raise NotImplementedError("Claude A: implement scoring projection/hash")


def profile_hash(profile: EvaluatorProfile) -> str:
    raise NotImplementedError("Claude A: implement profile projection/hash")


def corpus_snapshot_hash(corpus: CorpusSnapshot) -> str:
    raise NotImplementedError("Claude A: hash corpus excluding its own content_hash")


def evaluation_reuse_key(identity: EvaluationIdentity) -> str:
    raise NotImplementedError("Claude A: implement reuse identity hash")
