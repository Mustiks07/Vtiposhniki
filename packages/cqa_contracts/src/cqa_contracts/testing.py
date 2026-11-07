"""Explicit synthetic evaluator for independent offline development, NOT scoring.

The caller must opt into test mode AND pass a test profile. Arbitrary inputs get
obviously synthetic answers; no network or domain arithmetic is performed.
"""

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from .interfaces import BudgetExceeded, CallObserver, ConfigurationError
from .models import (
    APIError,
    CallEvent,
    CallRecord,
    ChecklistVersion,
    Conversation,
    CorpusSnapshot,
    CriterionProposal,
    ErrorCode,
    EvaluationArtifact,
    EvaluationIdentity,
    EvaluatorProfile,
    Evidence,
    ExecutionBudget,
    ReasonCode,
)


class SyntheticEvaluator:
    def __init__(
        self,
        *,
        app_mode: Literal["test", "production"],
        scenario: Literal["complete", "partial", "failed"] = "complete",
    ) -> None:
        if app_mode != "test":
            raise ConfigurationError(
                APIError(
                    code=ErrorCode.CONFIGURATION_ERROR,
                    message="Synthetic evaluator requires explicit test mode",
                    retryable=False,
                    correlation_id="test-mode",
                )
            )
        self.scenario = scenario

    async def __call__(
        self,
        conversation: Conversation,
        checklist: ChecklistVersion,
        profile: EvaluatorProfile,
        corpus: CorpusSnapshot,
        budget: ExecutionBudget,
        call_observer: CallObserver,
    ) -> EvaluationArtifact:
        if profile.mode != "test":
            raise ConfigurationError(
                APIError(
                    code=ErrorCode.CONFIGURATION_ERROR,
                    message="Synthetic evaluator requires a test profile",
                    retryable=False,
                    correlation_id="test-mode",
                )
            )
        now = datetime.now(UTC)
        if budget.consumed_calls >= budget.max_provider_calls or now >= budget.deadline_at:
            raise BudgetExceeded(
                APIError(
                    code=ErrorCode.BUDGET_EXCEEDED,
                    message="Execution budget exhausted",
                    retryable=False,
                    correlation_id=budget.logical_job_id,
                )
            )
        call_id = str(uuid4())
        record = CallRecord(
            call_id=call_id,
            attempt_id=budget.attempt_id,
            purpose="primary",
            requested=profile.primary,
            actual=profile.primary,
            started_at=now,
            outcome="started",
        )
        # Awaiting is intentional: persistence failure forbids even a simulated call.
        await call_observer(
            CallEvent(
                event="call_started",
                logical_job_id=budget.logical_job_id,
                attempt_id=budget.attempt_id,
                call_id=call_id,
                record=record,
            )
        )
        proposals = [
            CriterionProposal(
                criterion_id=c.id,
                applicability="undetermined" if self.scenario == "partial" else "applicable",
                answer_choice_id=None if self.scenario == "partial" else c.choices[0].id,
                rationale="SYNTHETIC TEST OUTPUT: no semantic evaluation performed",
                reason_codes=[
                    ReasonCode.INSUFFICIENT_EVIDENCE
                    if self.scenario == "partial"
                    else ReasonCode.OTHER
                ],
                evidence=[
                    Evidence(
                        kind="range",
                        start_message_id=conversation.messages[0].id,
                        end_message_id=conversation.messages[-1].id,
                        relation="context",
                        explanation="Synthetic test range, not a verified semantic claim",
                    )
                ],
                limitations=["test_evaluator"],
                origin="test",
            )
            for c in checklist.criteria
        ]
        record = record.model_copy(
            update={
                "outcome": "failed" if self.scenario == "failed" else "succeeded",
                "finished_at": datetime.now(UTC),
                "finish_reason": "stop",
            }
        )
        await call_observer(
            CallEvent(
                event="call_finished",
                logical_job_id=budget.logical_job_id,
                attempt_id=budget.attempt_id,
                call_id=call_id,
                record=record,
            )
        )
        return EvaluationArtifact(
            status=self.scenario,
            initial=[] if self.scenario == "failed" else proposals,
            reviews=[],
            automatic_final=[] if self.scenario == "failed" else proposals,
            calls=[record],
            identity=EvaluationIdentity(
                conversation_content_hash=conversation.content_hash,
                checklist_semantic_hash=checklist.semantic_hash,
                profile_hash="0" * 64,
                corpus_snapshot_hash=corpus.content_hash,
            ),
            limitations=[
                "test_evaluator",
                "No provider call or semantic assessment; usage and cost unknown",
            ],
            evaluator_mode="test",
            error=APIError(
                code=ErrorCode.PROVIDER_ERROR,
                message="Synthetic failure",
                retryable=False,
                correlation_id=call_id,
            )
            if self.scenario == "failed"
            else None,
        )
