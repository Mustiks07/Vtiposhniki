"""Integrator regression (delivery 93c7738): a call must not start after the deadline
when the call_started observer is slow."""

import asyncio
from datetime import timedelta
from decimal import Decimal

import pytest
from _cqa_ai_helpers import FakeClock, budget, conversation, corpus, make, profile, run
from cqa_ai.evaluator import Evaluator
from cqa_ai.testing import InMemoryObserver, ScriptedTransport, answer_all, ok
from cqa_contracts.interfaces import EvaluationTimeout
from cqa_contracts.models import CallEvent, ExecutionBudget
from cqa_domain import original_checklist, validate_artifact

CHECKLIST = original_checklist()
CONV = conversation()


class SlowStartObserver(InMemoryObserver):
    """Persists call_started, then takes `delay` seconds (fake clock) to return."""

    def __init__(
        self, budget: ExecutionBudget, clock: FakeClock, delay: float, slow_from: int = 1
    ) -> None:
        super().__init__(budget)
        self.clock = clock
        self.delay = delay
        self.slow_from = slow_from

    async def __call__(self, event: CallEvent) -> ExecutionBudget:
        result = await super().__call__(event)
        if event.event == "call_started" and self.started >= self.slow_from:
            self.clock.current += timedelta(seconds=self.delay)
        return result


async def test_slow_started_past_deadline_sends_nothing_and_finishes_record() -> None:
    clock = FakeClock()
    evaluator, transport, _ = make([ok(answer_all(CHECKLIST, CONV))], clock=clock)
    b = budget(seconds=1)
    observer = SlowStartObserver(b, clock, delay=2)
    with pytest.raises(EvaluationTimeout):
        await run(evaluator, bud=b, observer=observer)
    assert transport.requests == []
    assert [e.event for e in observer.events] == ["call_started", "call_finished"]
    record = observer.events[-1].record
    assert record.outcome == "timeout"
    assert record.safe_error is not None and record.safe_error.code == "timeout"
    assert record.usage is not None
    assert (record.usage.input_tokens, record.usage.output_tokens) == (0, 0)
    assert record.cost == Decimal(0)  # nothing was sent, so nothing was spent
    # The reserved call is counted exactly once.
    assert observer.budget.consumed_calls == 1


async def test_timeout_is_recomputed_after_started_returns() -> None:
    clock = FakeClock()
    evaluator, transport, _ = make([ok(answer_all(CHECKLIST, CONV))], clock=clock)
    b = budget(seconds=10)
    observer = SlowStartObserver(b, clock, delay=9)
    artifact, _ = await run(evaluator, bud=b, observer=observer)
    assert artifact.status == "complete"
    assert transport.requests[0].timeout_seconds == pytest.approx(1.0)
    assert observer.budget.consumed_calls == 1


async def test_recheck_does_not_double_count_the_last_reserved_call() -> None:
    clock = FakeClock()
    evaluator, transport, _ = make([ok(answer_all(CHECKLIST, CONV))], clock=clock)
    # Exactly one call left: after reservation consumed == max, yet it must be sent.
    b = budget(max_calls=3, consumed=2, seconds=10)
    observer = SlowStartObserver(b, clock, delay=1)
    artifact, _ = await run(evaluator, bud=b, observer=observer)
    assert artifact.status == "complete"
    assert len(transport.requests) == 1
    assert observer.budget.consumed_calls == 3


async def test_slow_reviewer_start_past_deadline_keeps_valid_initial() -> None:
    clock = FakeClock()
    initial = answer_all(CHECKLIST, CONV, flags={"c8_gross_errors": ["potential_violation"]})
    evaluator, transport, _ = make([ok(initial)], clock=clock)
    b = budget(seconds=5)
    observer = SlowStartObserver(b, clock, delay=10, slow_from=2)
    artifact, _ = await run(evaluator, prof=profile(reviewer=True), bud=b, observer=observer)
    assert len(transport.requests) == 1  # reviewer request never sent
    assert artifact.status == "complete"
    assert [r.outcome for r in artifact.reviews] == ["skipped"]
    assert "review_unfinished" in artifact.limitations
    assert [c.outcome for c in artifact.calls] == ["succeeded", "timeout"]
    assert artifact.reviews[0].call_ids == [artifact.calls[1].call_id]
    validate_artifact(CONV, CHECKLIST, corpus(), artifact)


async def test_real_clock_reproduction() -> None:
    """Integrator scenario with real time: deadline in 1 s, observer stalls 2 s."""
    transport = ScriptedTransport([ok(answer_all(CHECKLIST, CONV))])
    evaluator = Evaluator({"test": transport})
    from datetime import UTC, datetime

    b = ExecutionBudget(
        logical_job_id="job-real",
        attempt_id="attempt-real",
        max_provider_calls=8,
        consumed_calls=0,
        deadline_at=datetime.now(UTC) + timedelta(seconds=1),
    )

    class Stalling(InMemoryObserver):
        async def __call__(self, event: CallEvent) -> ExecutionBudget:
            result = await super().__call__(event)
            if event.event == "call_started":
                await asyncio.sleep(2)
            return result

    observer = Stalling(b)
    with pytest.raises(EvaluationTimeout):
        await evaluator(CONV, CHECKLIST, profile(), corpus(), b, observer)
    assert transport.requests == []
    assert [e.event for e in observer.events] == ["call_started", "call_finished"]
