"""The only path from the server into the domain/AI packages.

The server never computes a score or a canonical hash itself. Everything goes
through this port, bound to cqa_domain/cqa_ai in production.
"""

from collections.abc import Callable
from dataclasses import dataclass

import cqa_ai
import cqa_domain
from cqa_contracts.interfaces import ArtifactValidator, ChecklistValidator, Evaluator, Scorer
from cqa_contracts.models import (
    ChecklistDraft,
    ChecklistVersion,
    Conversation,
    CorpusSnapshot,
    EvaluationIdentity,
    EvaluatorProfile,
)


@dataclass(frozen=True)
class DomainPort:
    validate_checklist: ChecklistValidator
    validate_artifact: ArtifactValidator
    score: Scorer
    conversation_content_hash: Callable[[Conversation], str]
    checklist_semantic_hash: Callable[[ChecklistVersion], str]
    checklist_scoring_hash: Callable[[ChecklistVersion], str]
    profile_hash: Callable[[EvaluatorProfile], str]
    corpus_snapshot_hash: Callable[[CorpusSnapshot], str]
    evaluation_reuse_key: Callable[[EvaluationIdentity], str]
    # Optional until the shared interfaces name it (handoff request R-3).
    original_checklist_draft: Callable[[], ChecklistDraft] | None = None
    sectioned_original_checklist_draft: Callable[[], ChecklistDraft] | None = None


def production_domain() -> DomainPort:
    return DomainPort(
        validate_checklist=cqa_domain.validate_checklist,
        validate_artifact=cqa_domain.validate_artifact,
        score=cqa_domain.score,
        conversation_content_hash=cqa_domain.conversation_content_hash,
        checklist_semantic_hash=cqa_domain.checklist_semantic_hash,
        checklist_scoring_hash=cqa_domain.checklist_scoring_hash,
        profile_hash=cqa_domain.profile_hash,
        corpus_snapshot_hash=cqa_domain.corpus_snapshot_hash,
        evaluation_reuse_key=cqa_domain.evaluation_reuse_key,
        original_checklist_draft=getattr(cqa_domain, "original_checklist_draft", None),
        sectioned_original_checklist_draft=cqa_domain.sectioned_original_checklist_draft,
    )


def production_evaluator() -> Evaluator:
    return cqa_ai.evaluate
