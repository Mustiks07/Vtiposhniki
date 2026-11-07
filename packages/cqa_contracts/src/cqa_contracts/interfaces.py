"""Stable callable boundaries. Implementations belong to A and B.

Observer ownership: B validates the attempt/lease, persists and reserves a call
atomically on call_started, then returns the current logical-job budget. A MUST
await that return before network IO and use the returned budget for later calls.
Repeated events with identical identities are idempotent. Finished persistence
failure propagates; it cannot be converted into a successful evaluation.
"""

import asyncio
from typing import Protocol

from .models import (
    APIError,
    CallEvent,
    ChecklistVersion,
    Conversation,
    CorpusSnapshot,
    CriterionProposal,
    EvaluationArtifact,
    EvaluatorProfile,
    ExecutionBudget,
    ScoreSummary,
)


class ContractError(Exception):
    def __init__(self, error: APIError) -> None:
        self.error = error
        super().__init__(error.message)


class ConfigurationError(ContractError):
    pass


class DomainValidationError(ContractError):
    pass


class BudgetExceeded(ContractError):
    pass


class EvaluationTimeout(ContractError):
    pass


class LeaseLost(ContractError):
    pass


class ObserverPersistenceError(ContractError):
    pass


class EvaluationCancelled(asyncio.CancelledError):
    """Propagates cancellation, never an ordinary partial/failed proposal."""


class CallObserver(Protocol):
    async def __call__(self, event: CallEvent) -> ExecutionBudget: ...


class ChecklistValidator(Protocol):
    def __call__(self, config: ChecklistVersion) -> None:
        """Raise DomainValidationError for invalid rules; no mutation/network."""
        ...


class Scorer(Protocol):
    def __call__(
        self, checklist: ChecklistVersion, proposals: list[CriterionProposal]
    ) -> ScoreSummary: ...


class ArtifactValidator(Protocol):
    def __call__(
        self,
        conversation: Conversation,
        checklist: ChecklistVersion,
        corpus: CorpusSnapshot,
        artifact: EvaluationArtifact,
    ) -> None: ...


class Evaluator(Protocol):
    async def __call__(
        self,
        conversation: Conversation,
        checklist: ChecklistVersion,
        profile: EvaluatorProfile,
        corpus: CorpusSnapshot,
        budget: ExecutionBudget,
        call_observer: CallObserver,
    ) -> EvaluationArtifact: ...
