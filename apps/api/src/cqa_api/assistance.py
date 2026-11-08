"""Shared durable call ledger for criterion drafts and conversation questions."""

from decimal import Decimal
from typing import Literal

from cqa_contracts.http_models import ConversationQuestionRun, CriterionSuggestionRun
from cqa_contracts.models import CallEvent, ErrorCode, ExecutionBudget

from .db import row, run
from .errors import ApiFailure, make_error
from .services import Services


def _record_call(
    services: Services,
    identity: str,
    event: CallEvent,
    *,
    table: Literal["criterion_suggestions", "conversation_questions"],
    record_type: type[CriterionSuggestionRun] | type[ConversationQuestionRun],
) -> ExecutionBudget:
    with services.db.write() as conn:
        stored = row(conn, f"SELECT * FROM {table} WHERE id=:id", {"id": identity})
        if (
            stored is None
            or stored["state"] != "running"
            or event.logical_job_id != identity
            or event.attempt_id != identity
        ):
            raise ApiFailure(make_error(ErrorCode.INVALID_STATE, "Advisory request is not active"))
        record = record_type.model_validate_json(stored["document_json"])
        budget = ExecutionBudget.model_validate_json(stored["budget_json"])
        calls = list(record.calls)
        index = next((i for i, call in enumerate(calls) if call.call_id == event.call_id), None)
        if event.event == "call_started":
            if index is not None:
                return budget
            if budget.consumed_calls >= budget.max_provider_calls:
                raise ApiFailure(
                    make_error(ErrorCode.BUDGET_EXCEEDED, "Advisory call limit reached")
                )
            calls.append(event.record)
        elif index is None:
            raise ApiFailure(make_error(ErrorCode.INVALID_STATE, "Advisory call was not reserved"))
        else:
            if calls[index].outcome != "started" and calls[index] != event.record:
                raise ApiFailure(
                    make_error(ErrorCode.INVALID_STATE, "Advisory call is already final")
                )
            calls[index] = event.record
        known_tokens = all(
            c.usage is not None
            and c.usage.input_tokens is not None
            and c.usage.output_tokens is not None
            for c in calls
        )
        known_cost = all(c.cost is not None for c in calls)
        budget = budget.model_copy(
            update={
                "consumed_calls": len(calls),
                "consumed_tokens": sum(
                    (c.usage.input_tokens or 0) + (c.usage.output_tokens or 0)
                    for c in calls
                    if c.usage
                )
                if known_tokens
                else None,
                "consumed_cost": sum((c.cost or Decimal(0) for c in calls), Decimal(0))
                if known_cost
                else None,
                "usage_complete": known_tokens and known_cost,
            }
        )
        record = record.model_copy(update={"calls": calls})
        run(
            conn,
            f"UPDATE {table} SET document_json=:document,budget_json=:budget WHERE id=:id",
            {
                "id": identity,
                "document": record.model_dump_json(),
                "budget": budget.model_dump_json(),
            },
        )
        return budget
