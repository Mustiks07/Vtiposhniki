"""Offline fakes for tests and early integration. Never used by production evaluate.

ScriptedTransport replays pre-written responses/failures (no network). It is a
transport, not a scorer: everything still goes through parsing, validation,
budget and observer logic exactly as for real providers.
InMemoryObserver is a reference model of B's observer duties (atomic reservation
on call_started, idempotent duplicates, budget returned) for unit tests only.
"""

import asyncio
import json
from collections.abc import Callable, Sequence
from typing import Any

from cqa_contracts.interfaces import BudgetExceeded, ObserverPersistenceError
from cqa_contracts.models import (
    APIError,
    CallEvent,
    ChecklistDraft,
    Conversation,
    ErrorCode,
    ExecutionBudget,
    TokenUsage,
)

from .transport import Capabilities, ProviderFailure, ProviderRequest, ProviderResponse

Step = ProviderResponse | ProviderFailure | Callable[[ProviderRequest], Any]


class ScriptedTransport:
    capabilities = Capabilities(
        json_object=True,
        json_schema_strict=False,
        seed=True,
        reports_usage=True,
        reports_reasoning_tokens=False,
        notes=("offline scripted transport",),
    )

    def __init__(self, steps: Sequence[Step], provider: str = "test") -> None:
        self.provider = provider
        self.steps = list(steps)
        self.requests: list[ProviderRequest] = []

    async def complete(self, request: ProviderRequest) -> ProviderResponse:
        self.requests.append(request)
        if not self.steps:
            raise AssertionError("ScriptedTransport has no scripted step left")
        step = self.steps.pop(0)
        if callable(step) and not isinstance(step, (ProviderResponse, ProviderFailure)):
            result = step(request)
            if asyncio.iscoroutine(result):
                result = await result
            step = result
        if isinstance(step, ProviderFailure):
            raise step
        assert isinstance(step, ProviderResponse)
        return step


def ok(
    content: str | dict[str, Any],
    *,
    usage: TokenUsage | None = None,
    finish_reason: str = "stop",
    model: str | None = None,
) -> ProviderResponse:
    text = content if isinstance(content, str) else json.dumps(content, ensure_ascii=False)
    return ProviderResponse(
        content=text,
        finish_reason=finish_reason,  # type: ignore[arg-type]
        usage=usage,
        actual_model=model,
    )


def answer_all(
    checklist: ChecklistDraft,
    conversation: Conversation,
    choices: dict[str, str | None] | None = None,
    *,
    undetermined: Sequence[str] = (),
    not_applicable: Sequence[str] = (),
    flags: dict[str, list[str]] | None = None,
) -> dict[str, Any]:
    """A syntactically valid model answer for every criterion (synthetic content)."""
    first, last = conversation.messages[0].id, conversation.messages[-1].id
    items = []
    for c in checklist.criteria:
        choice = (choices or {}).get(c.id, c.choices[0].id)
        if c.id in undetermined:
            item = {
                "applicability": "undetermined",
                "answer_choice_id": None,
                "reason_codes": ["insufficient_evidence"],
            }
        elif c.id in not_applicable:
            item = {
                "applicability": "not_applicable",
                "answer_choice_id": None,
                "reason_codes": ["not_applicable"],
            }
        else:
            item = {
                "applicability": "applicable",
                "answer_choice_id": choice,
                "reason_codes": ["criteria_met"],
            }
        items.append(
            {
                "criterion_id": c.id,
                **item,
                "rationale": "Synthetic offline rationale.",
                "evidence": [
                    {
                        "kind": "range",
                        "start_message_id": first,
                        "end_message_id": last,
                        "relation": "context",
                        "explanation": "Whole synthetic dialog checked.",
                    }
                ],
                "limitations": [],
                "review_flags": (flags or {}).get(c.id, []),
            }
        )
    return {"criteria": items}


class InMemoryObserver:
    """Reference observer: reserve on started, idempotent replays, budget returned."""

    def __init__(
        self,
        budget: ExecutionBudget,
        *,
        fail_started_at: int | None = None,
        fail_finished_at: int | None = None,
        track_usage: bool = True,
    ) -> None:
        self.budget = budget
        self.events: list[CallEvent] = []
        self._seen: dict[tuple[str, str], CallEvent] = {}
        self.fail_started_at = fail_started_at
        self.fail_finished_at = fail_finished_at
        self.track_usage = track_usage
        self.started = 0
        self.finished = 0

    async def __call__(self, event: CallEvent) -> ExecutionBudget:
        key = (event.call_id, event.event)
        if key in self._seen:
            if self._seen[key] != event:
                raise ObserverPersistenceError(_err(ErrorCode.PERSISTENCE_ERROR, "Conflict"))
            return self.budget
        if event.event == "call_started":
            self.started += 1
            if self.fail_started_at == self.started:
                raise ObserverPersistenceError(_err(ErrorCode.PERSISTENCE_ERROR, "Store down"))
            if self.budget.consumed_calls >= self.budget.max_provider_calls:
                raise BudgetExceeded(_err(ErrorCode.BUDGET_EXCEEDED, "No call capacity"))
            self.budget = self.budget.model_copy(
                update={"consumed_calls": self.budget.consumed_calls + 1}
            )
        else:
            self.finished += 1
            if self.fail_finished_at == self.finished:
                raise ObserverPersistenceError(_err(ErrorCode.PERSISTENCE_ERROR, "Store down"))
            usage = event.record.usage
            if self.track_usage:
                if usage is None or usage.input_tokens is None or usage.output_tokens is None:
                    tokens = None
                elif self.budget.consumed_tokens is None and self.budget.consumed_calls > 1:
                    tokens = None
                else:
                    tokens = (
                        (self.budget.consumed_tokens or 0)
                        + usage.input_tokens
                        + (usage.output_tokens)
                    )
                cost = event.record.cost
                consumed_cost = (
                    None
                    if cost is None
                    or (self.budget.consumed_cost is None and self.budget.consumed_calls > 1)
                    else (self.budget.consumed_cost or 0) + cost
                )
                self.budget = self.budget.model_copy(
                    update={"consumed_tokens": tokens, "consumed_cost": consumed_cost}
                )
        self._seen[key] = event
        self.events.append(event)
        return self.budget


def _err(code: ErrorCode, message: str) -> APIError:
    return APIError(code=code, message=message, retryable=False, correlation_id="test-observer")
