"""Claude A evaluator: provider adapters, prompts, sources and blind reviewer.

`evaluate` is the production entrypoint: it fails closed without credentials,
never falls back to fixtures, and returns an EvaluationArtifact without totals.
Offline tests construct `Evaluator` with explicit fake transports instead.
"""

import os

import httpx
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

from .evaluator import Evaluator
from .pricing import Price, PriceTable
from .prompts import PREPROCESSING_VERSION, PROMPT_VERSION
from .providers import transports_from_environment


async def evaluate(
    conversation: Conversation,
    checklist: ChecklistVersion,
    profile: EvaluatorProfile,
    corpus: CorpusSnapshot,
    budget: ExecutionBudget,
    call_observer: CallObserver,
) -> EvaluationArtifact:
    require_production_configuration(profile, os.environ)
    async with httpx.AsyncClient() as client:
        transports = transports_from_environment(profile, os.environ, client)
        # Tariffs are not configured by default: cost stays null (unknown), never 0.
        evaluator = Evaluator(transports, prices=PriceTable())
        return await evaluator(conversation, checklist, profile, corpus, budget, call_observer)


__all__ = [
    "PREPROCESSING_VERSION",
    "PROMPT_VERSION",
    "Evaluator",
    "Price",
    "PriceTable",
    "evaluate",
]
