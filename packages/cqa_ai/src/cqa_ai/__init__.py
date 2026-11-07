"""Claude A owns provider/evaluator implementation. No implicit fixture fallback."""

import os

from cqa_contracts.interfaces import CallObserver
from cqa_contracts.models import (
    ChecklistVersion,
    Conversation,
    CorpusSnapshot,
    EvaluationArtifact,
    EvaluatorProfile,
    ExecutionBudget,
)
from cqa_contracts.runtime import require_production_configuration


async def evaluate(
    conversation: Conversation,
    checklist: ChecklistVersion,
    profile: EvaluatorProfile,
    corpus: CorpusSnapshot,
    budget: ExecutionBudget,
    call_observer: CallObserver,
) -> EvaluationArtifact:
    require_production_configuration(profile, os.environ)
    raise NotImplementedError("Claude A: implement production evaluate and provider adapters")
