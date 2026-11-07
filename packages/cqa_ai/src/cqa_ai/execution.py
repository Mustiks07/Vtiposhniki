"""One provider call under the shared logical-job budget and call observer.

Order per call: check budget/deadline locally -> emit call_started and AWAIT the
observer (B reserves the call atomically and returns the current budget) -> send
-> emit call_finished and await it. Observer failures propagate: no request is
sent after a failed started, and no success is reported after a failed finished.
Cancellation emits a best-effort cancelled record and propagates.
"""

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from cqa_contracts.interfaces import (
    BudgetExceeded,
    CallObserver,
    EvaluationCancelled,
    EvaluationTimeout,
    LeaseLost,
)
from cqa_contracts.models import (
    APIError,
    CallEvent,
    CallRecord,
    ErrorCode,
    ExecutionBudget,
    GenerationSettings,
    ProviderSelection,
    RetryPolicy,
    TokenUsage,
)

from .pricing import PriceTable
from .transport import (
    ChatMessage,
    ProviderFailure,
    ProviderRequest,
    ProviderResponse,
    ProviderTransport,
)

Purpose = Literal["primary", "review", "repair", "fallback"]


def _error(code: ErrorCode, message: str, correlation_id: str, retryable: bool) -> APIError:
    return APIError(code=code, message=message, retryable=retryable, correlation_id=correlation_id)


@dataclass
class Clock:
    now: Callable[[], datetime] = lambda: datetime.now(UTC)
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep


class CallRunner:
    def __init__(
        self,
        *,
        budget: ExecutionBudget,
        observer: CallObserver,
        retries: RetryPolicy,
        generation: GenerationSettings,
        prices: PriceTable,
        clock: Clock,
        id_factory: Callable[[], str] | None = None,
    ) -> None:
        self.budget = budget
        self.observer = observer
        self.retries = retries
        self.generation = generation
        self.prices = prices
        self.clock = clock
        self.id_factory = id_factory or (lambda: uuid.uuid4().hex)
        self.calls: list[CallRecord] = []
        self._local_tokens: int | None = 0

    # -- budget -------------------------------------------------------------
    def remaining_seconds(self) -> float:
        return (self.budget.deadline_at - self.clock.now()).total_seconds()

    def _consumed_tokens(self) -> int | None:
        if self.budget.consumed_tokens is not None:
            return self.budget.consumed_tokens
        if self.budget.consumed_calls == 0:
            return 0
        # B did not report usage; only our own fully-known calls can be trusted.
        if self.budget.consumed_calls == len(self.calls):
            return self._local_tokens
        return None

    def check_can_call(self, selection: ProviderSelection) -> int:
        """Raise if no further call may start; return the output-token cap to request."""
        b = self.budget
        cid = b.logical_job_id
        if self.remaining_seconds() <= 0:
            raise EvaluationTimeout(
                _error(ErrorCode.TIMEOUT, "Logical job deadline reached", cid, False)
            )
        if b.consumed_calls >= b.max_provider_calls:
            raise BudgetExceeded(
                _error(ErrorCode.BUDGET_EXCEEDED, "Provider call budget exhausted", cid, False)
            )
        max_out = self.generation.max_output_tokens
        if b.max_total_tokens is not None:
            consumed = self._consumed_tokens()
            if consumed is None:
                raise BudgetExceeded(
                    _error(
                        ErrorCode.BUDGET_EXCEEDED,
                        "Token cap cannot be enforced: earlier usage is unknown",
                        cid,
                        False,
                    )
                )
            remaining = b.max_total_tokens - consumed
            if remaining <= 0:
                raise BudgetExceeded(
                    _error(ErrorCode.BUDGET_EXCEEDED, "Token budget exhausted", cid, False)
                )
            max_out = min(max_out, remaining)
        if b.max_cost is not None:
            if self.prices.get(selection) is None:
                raise BudgetExceeded(
                    _error(
                        ErrorCode.BUDGET_EXCEEDED,
                        "Cost cap cannot be enforced: no verified tariff",
                        cid,
                        False,
                    )
                )
            if b.consumed_calls > 0 and b.consumed_cost is None:
                raise BudgetExceeded(
                    _error(
                        ErrorCode.BUDGET_EXCEEDED,
                        "Cost cap cannot be enforced: earlier cost is unknown",
                        cid,
                        False,
                    )
                )
            if (b.consumed_cost or 0) >= b.max_cost:
                raise BudgetExceeded(
                    _error(ErrorCode.BUDGET_EXCEEDED, "Cost budget exhausted", cid, False)
                )
        return max_out

    def _accept(self, budget: ExecutionBudget) -> ExecutionBudget:
        if (budget.logical_job_id, budget.attempt_id) != (
            self.budget.logical_job_id,
            self.budget.attempt_id,
        ):
            raise LeaseLost(
                _error(
                    ErrorCode.LEASE_LOST,
                    "Observer returned another attempt's budget",
                    self.budget.logical_job_id,
                    False,
                )
            )
        return budget

    async def _emit(self, event: Literal["call_started", "call_finished"], rec: CallRecord) -> None:
        returned = await self.observer(
            CallEvent(
                event=event,
                logical_job_id=self.budget.logical_job_id,
                attempt_id=self.budget.attempt_id,
                call_id=rec.call_id,
                record=rec,
            )
        )
        self.budget = self._accept(returned)

    # -- calls --------------------------------------------------------------
    async def call(
        self,
        purpose: Purpose,
        selection: ProviderSelection,
        transport: ProviderTransport,
        messages: tuple[ChatMessage, ...],
    ) -> ProviderResponse:
        """One logical request with bounded transport retries inside the budget."""
        retries = 0
        while True:
            try:
                return await self._single(purpose, selection, transport, messages)
            except ProviderFailure as failure:
                if not failure.retryable or retries >= self.retries.max_transport_retries:
                    raise
                delay = failure.retry_after if failure.retry_after is not None else 2.0**retries
                if delay >= self.remaining_seconds():
                    raise
                retries += 1
                await self.clock.sleep(delay)

    async def _single(
        self,
        purpose: Purpose,
        selection: ProviderSelection,
        transport: ProviderTransport,
        messages: tuple[ChatMessage, ...],
    ) -> ProviderResponse:
        max_out = self.check_can_call(selection)
        timeout = min(float(self.retries.call_timeout_seconds), self.remaining_seconds())
        started = CallRecord(
            call_id=self.id_factory(),
            attempt_id=self.budget.attempt_id,
            purpose=purpose,
            requested=selection,
            started_at=self.clock.now(),
            outcome="started",
        )
        await self._emit("call_started", started)  # failure here: request is never sent
        request = ProviderRequest(
            model=selection.model,
            messages=messages,
            temperature=float(self.generation.temperature),
            max_output_tokens=max_out,
            seed=self.generation.seed,
            timeout_seconds=timeout,
        )
        try:
            async with asyncio.timeout(timeout):
                response = await transport.complete(request)
        except TimeoutError:
            failure = ProviderFailure("timeout", "Provider call timed out")
            await self._finish(started, failure=failure, outcome="timeout")
            raise failure from None
        except ProviderFailure as failure:
            await self._finish(started, failure=failure, outcome="failed")
            raise
        except asyncio.CancelledError:
            try:
                await self._finish(started, failure=None, outcome="cancelled")
            finally:
                raise EvaluationCancelled() from None
        except Exception:
            unknown = ProviderFailure("network", "Unexpected transport failure")
            await self._finish(started, failure=unknown, outcome="unknown")
            raise unknown from None
        await self._finish(started, response=response, outcome="succeeded")
        return response

    async def _finish(
        self,
        started: CallRecord,
        *,
        outcome: Literal["succeeded", "failed", "timeout", "cancelled", "unknown"],
        response: ProviderResponse | None = None,
        failure: ProviderFailure | None = None,
    ) -> None:
        usage: TokenUsage | None = (
            response.usage if response else (failure.usage if failure else None)
        )
        actual_model = (
            response.actual_model if response else (failure.actual_model if failure else None)
        )
        actual = (
            started.requested.model_copy(update={"model": actual_model})
            if actual_model
            else (started.requested if response else None)
        )
        cost, price_version = self.prices.cost(actual or started.requested, usage)
        finish_reason = (
            response.finish_reason
            if response
            else (failure.finish_reason if failure else "unknown")
        )
        safe_error = None
        if failure is not None:
            code = ErrorCode.TIMEOUT if failure.kind == "timeout" else ErrorCode.PROVIDER_ERROR
            safe_error = _error(code, failure.safe_message, started.call_id, failure.retryable)
        elif outcome == "cancelled":
            safe_error = _error(ErrorCode.CANCELLED, "Evaluation cancelled", started.call_id, False)
        record = started.model_copy(
            update={
                "outcome": outcome,
                "finished_at": max(self.clock.now(), started.started_at),
                "finish_reason": finish_reason,
                "actual": actual,
                "usage": usage,
                "cost": cost,
                "price_version": price_version,
                "safe_error": safe_error,
            }
        )
        self.calls.append(record)
        if self._local_tokens is not None:
            if usage is None or usage.input_tokens is None or usage.output_tokens is None:
                self._local_tokens = None
            else:
                self._local_tokens += usage.input_tokens + usage.output_tokens
        await self._emit("call_finished", record)
