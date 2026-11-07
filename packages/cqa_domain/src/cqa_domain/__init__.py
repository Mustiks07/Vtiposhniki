"""CQA domain: rubric rules, the single Decimal scorer and canonical hashing.

Pure functions only: no network, ORM, HTTP routes or UI. Shared DTOs come from
cqa_contracts; this package never defines competing public types.
"""

from cqa_contracts.models import (
    ChecklistVersion,
    Conversation,
    CorpusSnapshot,
    EvaluationArtifact,
)

from .canonical import canonical_decimal, canonical_hash, canonical_json
from .checklist import build_checklist_version, validate_checklist, validate_checklist_draft
from .hashing import (
    checklist_scoring_hash,
    checklist_semantic_hash,
    content_projection,
    conversation_content_hash,
    corpus_projection,
    corpus_snapshot_hash,
    evaluation_reuse_key,
    profile_hash,
    scoring_projection,
    semantic_projection,
    text_hash,
)
from .proposals import validate_proposals
from .rubric import original_checklist, original_checklist_draft
from .scoring import score


def validate_artifact(
    conversation: Conversation,
    checklist: ChecklistVersion,
    corpus: CorpusSnapshot,
    artifact: EvaluationArtifact,
) -> None:
    raise NotImplementedError("Claude A: implement cross-object artifact validation (A2)")


__all__ = [
    "build_checklist_version",
    "canonical_decimal",
    "canonical_hash",
    "canonical_json",
    "checklist_scoring_hash",
    "checklist_semantic_hash",
    "content_projection",
    "conversation_content_hash",
    "corpus_projection",
    "corpus_snapshot_hash",
    "evaluation_reuse_key",
    "original_checklist",
    "original_checklist_draft",
    "profile_hash",
    "score",
    "scoring_projection",
    "semantic_projection",
    "text_hash",
    "validate_artifact",
    "validate_checklist",
    "validate_checklist_draft",
    "validate_proposals",
]
