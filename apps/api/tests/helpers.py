"""Scripted collaborators for server tests. None of them performs score arithmetic."""

import dataclasses
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from cqa_api.registry import register_profile
from cqa_api.testmode import build_test_domain, synthetic_profile
from cqa_contracts.interfaces import ContractError
from cqa_contracts.models import (
    APIError,
    CallEvent,
    CallRecord,
    ReasonCode,
    ScoreSummary,
    TokenUsage,
)
from cqa_contracts.testing import SyntheticEvaluator

ROOT = Path(__file__).resolve().parents[3]


def illustrative_score(name: str = "score-complete") -> ScoreSummary:
    """A fixture constant, used to prove storage and call paths, not to check arithmetic."""
    text = (ROOT / "fixtures/contracts" / f"{name}.json").read_text(encoding="utf-8")
    return ScoreSummary.model_validate_json(text)


class SpyDomain:
    """Test-mode domain whose score and validator calls are recorded."""

    def __init__(self):
        self.score_calls = []
        self.validated = []
        self.validation_error = None
        self.score_error = None
        self.result = illustrative_score()
        self.port = dataclasses.replace(
            build_test_domain(), score=self._score, validate_artifact=self._validate
        )

    def _score(self, checklist, proposals):
        self.score_calls.append((checklist, list(proposals)))
        if self.score_error is not None:
            raise self.score_error
        return self.result

    def _validate(self, conversation, checklist, corpus, artifact):
        self.validated.append((conversation, checklist, corpus, artifact))
        if self.validation_error is not None:
            raise self.validation_error


def contract_error(cls=ContractError, code="provider_error", retryable=True) -> ContractError:
    return cls(
        APIError(
            code=code,
            message="Synthetic failure",
            retryable=retryable,
            correlation_id="synthetic",
        )
    )


class ScriptedEvaluator:
    """Each step is an exception to raise, an awaitable factory, or None for a normal result."""

    def __init__(self, *steps, scenario="complete"):
        self.steps = list(steps)
        self.calls = 0
        self.scenario = scenario

    async def __call__(self, conversation, checklist, profile, corpus, budget, call_observer):
        self.calls += 1
        step = self.steps.pop(0) if self.steps else None
        if isinstance(step, BaseException):
            raise step
        if callable(step):
            await step(budget, call_observer)
        evaluator = SyntheticEvaluator(app_mode="test", scenario=self.scenario)
        return await evaluator(conversation, checklist, profile, corpus, budget, call_observer)


UNDETERMINED = "__undetermined__"
NOT_APPLICABLE = "__not_applicable__"


class PlannedEvaluator:
    """Answers come from the test's plan; the real cqa_domain computes every flag from them.

    ``plan[external_id]`` is an exception to raise, "failed" for a failed artifact, or a map
    of criterion ID to a choice ID, UNDETERMINED or NOT_APPLICABLE. Criteria it does not
    name keep the first choice. The clock is the one the queue uses.
    """

    def __init__(self, clock):
        self.plan = {}
        self._clock = clock

    @staticmethod
    def _answered(proposal, answer):
        if answer is None:
            return proposal
        if answer == UNDETERMINED:
            update = {
                "applicability": "undetermined",
                "answer_choice_id": None,
                "reason_codes": [ReasonCode.INSUFFICIENT_EVIDENCE],
            }
        elif answer == NOT_APPLICABLE:
            update = {
                "applicability": "not_applicable",
                "answer_choice_id": None,
                "reason_codes": [ReasonCode.NOT_APPLICABLE],
            }
        else:
            update = {"answer_choice_id": answer}
        return proposal.model_copy(update=update)

    async def __call__(self, conversation, checklist, profile, corpus, budget, call_observer):
        entry = self.plan.get(conversation.external_id, {})
        if isinstance(entry, BaseException):
            raise entry
        evaluator = SyntheticEvaluator(
            app_mode="test",
            scenario="failed" if entry == "failed" else "complete",
            clock=self._clock,
        )
        artifact = await evaluator(conversation, checklist, profile, corpus, budget, call_observer)
        if entry == "failed":
            return artifact
        final = [self._answered(p, entry.get(p.criterion_id)) for p in artifact.automatic_final]
        partial = any(p.applicability == "undetermined" for p in final)
        return artifact.model_copy(
            update={
                "status": "partial" if partial else "complete",
                "initial": final,
                "automatic_final": final,
            }
        )


def call_event(
    budget,
    event="call_started",
    *,
    call_id=None,
    attempt_id=None,
    outcome=None,
    usage=None,
    cost=None,
    now=None,
):
    moment = now or datetime.now(UTC)
    call_id = call_id or f"call-{uuid4().hex}"
    attempt_id = attempt_id or budget.attempt_id
    profile = synthetic_profile()
    finished = event == "call_finished"
    record = CallRecord(
        call_id=call_id,
        attempt_id=attempt_id,
        purpose="primary",
        requested=profile.primary,
        actual=profile.primary if finished else None,
        started_at=moment,
        finished_at=moment if finished else None,
        outcome=outcome or ("succeeded" if finished else "started"),
        finish_reason="stop" if finished else None,
        usage=usage,
        cost=cost,
    )
    return CallEvent(
        event=event,
        logical_job_id=budget.logical_job_id,
        attempt_id=attempt_id,
        call_id=call_id,
        record=record,
    )


def spend(input_tokens=10, output_tokens=5) -> TokenUsage:
    return TokenUsage(input_tokens=input_tokens, output_tokens=output_tokens)


class MutableClock:
    def __init__(self):
        self.now = datetime(2026, 11, 7, 12, 0, tzinfo=UTC)

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += timedelta(seconds=seconds)


def add_profile(client, *, version="v2", fields=None, **retries):
    """Register a stricter synthetic profile version; it becomes the latest for the ID."""
    base = synthetic_profile()
    updated = base.model_copy(
        update={
            **(fields or {}),
            "version": version,
            "retries": type(base.retries).model_validate(
                {**base.retries.model_dump(), **retries}
            ),
        }
    )
    services = client.app.state.services
    with services.db.write() as conn:
        register_profile(conn, services, updated)
    return updated
