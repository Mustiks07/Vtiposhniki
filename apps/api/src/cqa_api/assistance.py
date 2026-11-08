"""Durable advisory history, isolated from automatic results and human decisions."""

import asyncio
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from typing import Literal
from uuid import uuid4

from cqa_ai.assistance import second_opinion
from cqa_ai.transport import ProviderFailure
from cqa_contracts.http_models import CriterionSuggestionRun, SecondOpinion
from cqa_contracts.interfaces import ContractError
from cqa_contracts.models import (
    APIError,
    CallEvent,
    ChecklistVersion,
    Conversation,
    CorpusSnapshot,
    CriterionProposal,
    ErrorCode,
    EvaluatorProfile,
    ExecutionBudget,
    SourceFragment,
)

from .checklists import pinned_checklist
from .conversations import pinned_conversation
from .db import row, rows, run
from .errors import ApiFailure, make_error, not_found
from .registry import pinned_corpus, pinned_profile
from .services import Services


@dataclass(frozen=True)
class Inputs:
    conversation: Conversation
    checklist: ChecklistVersion
    profile: EvaluatorProfile
    corpus: CorpusSnapshot
    comment: str
    budget: ExecutionBudget


def _prepare(services: Services, appeal_id: str, key: str) -> tuple[SecondOpinion, Inputs | None]:
    with services.db.write() as conn:
        existing = row(conn, "SELECT * FROM second_opinions WHERE request_key=:key", {"key": key})
        if existing:
            if existing["appeal_id"] != appeal_id:
                raise ApiFailure(
                    make_error(
                        ErrorCode.IDEMPOTENCY_CONFLICT, "Request key belongs to another appeal"
                    )
                )
            return SecondOpinion.model_validate_json(existing["document_json"]), None
        appeal = row(conn, "SELECT * FROM appeals WHERE id=:id", {"id": appeal_id})
        if appeal is None:
            raise not_found("Appeal")
        if appeal["state"] != "open":
            raise ApiFailure(make_error(ErrorCode.INVALID_STATE, "Appeal has already been decided"))
        if row(
            conn,
            "SELECT id FROM second_opinions WHERE appeal_id=:id AND state='running'",
            {"id": appeal_id},
        ):
            raise ApiFailure(
                make_error(ErrorCode.INVALID_STATE, "Second opinion is already running"), status=409
            )
        evaluation = row(
            conn, "SELECT * FROM evaluations WHERE id=:id", {"id": appeal["evaluation_id"]}
        )
        assert evaluation is not None
        profile = pinned_profile(conn, evaluation["profile_id"], evaluation["profile_version"])
        if profile.mode != services.settings.mode:
            raise ApiFailure(
                make_error(ErrorCode.CONFIGURATION_ERROR, "Profile mode differs from server mode")
            )
        now = services.clock()
        identity = f"opinion_{uuid4().hex}"
        budget = ExecutionBudget(
            logical_job_id=identity,
            attempt_id=identity,
            max_provider_calls=1,
            consumed_calls=0,
            deadline_at=now + timedelta(seconds=min(90, profile.retries.job_deadline_seconds)),
            max_total_tokens=profile.retries.max_total_tokens,
            consumed_tokens=0,
            max_cost=profile.retries.max_cost,
            consumed_cost=Decimal(0),
            usage_complete=True,
        )
        result = SecondOpinion(
            id=identity,
            appeal_id=appeal_id,
            evaluation_id=evaluation["id"],
            criterion_id=appeal["criterion_id"],
            profile_id=profile.id,
            profile_version=profile.version,
            mode=profile.mode,
            state="running",
            created_at=now,
        )
        inputs = Inputs(
            conversation=pinned_conversation(
                conn, evaluation["conversation_id"], evaluation["conversation_revision"]
            ),
            checklist=pinned_checklist(conn, evaluation["checklist_version_id"]),
            profile=profile,
            corpus=pinned_corpus(conn, evaluation["corpus_snapshot_id"]),
            comment=appeal["comment"],
            budget=budget,
        )
        run(
            conn,
            "INSERT INTO second_opinions (id,appeal_id,request_key,state,document_json,budget_json) VALUES (:id,:appeal,:key,'running',:document,:budget)",
            {
                "id": identity,
                "appeal": appeal_id,
                "key": key,
                "document": result.model_dump_json(),
                "budget": budget.model_dump_json(),
            },
        )
        return result, inputs


def _record_call(
    services: Services,
    identity: str,
    event: CallEvent,
    *,
    table: Literal["second_opinions", "criterion_suggestions"] = "second_opinions",
    record_type: type[SecondOpinion] | type[CriterionSuggestionRun] = SecondOpinion,
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


def _finish(
    services: Services,
    identity: str,
    proposal: CriterionProposal | None,
    fragments: list[SourceFragment],
    error: APIError | None,
) -> SecondOpinion:
    with services.db.write() as conn:
        stored = row(conn, "SELECT * FROM second_opinions WHERE id=:id", {"id": identity})
        assert stored is not None
        if stored["state"] != "running":
            return SecondOpinion.model_validate_json(stored["document_json"])
        record = SecondOpinion.model_validate_json(stored["document_json"]).model_copy(
            update={
                "state": "failed" if error else "succeeded",
                "finished_at": services.clock(),
                "proposal": proposal,
                "source_fragments": fragments,
                "error": error,
            }
        )
        run(
            conn,
            "UPDATE second_opinions SET state=:state,document_json=:document WHERE id=:id",
            {"id": identity, "state": record.state, "document": record.model_dump_json()},
        )
        return record


async def create(services: Services, appeal_id: str, key: str) -> SecondOpinion:
    record, inputs = await asyncio.to_thread(_prepare, services, appeal_id, key)
    if inputs is None:
        return record

    async def observer(event: CallEvent) -> ExecutionBudget:
        return await asyncio.to_thread(_record_call, services, record.id, event)

    proposal = None
    fragments: list[SourceFragment] = []
    error = None
    try:
        proposal, fragments = await second_opinion(
            inputs.conversation,
            inputs.checklist,
            record.criterion_id,
            inputs.profile,
            inputs.corpus,
            inputs.comment,
            inputs.budget,
            observer,
        )
    except ProviderFailure as failure:
        message = (
            "Недостаточно квоты провайдера. Подсказка не получена; решение остаётся за проверяющим."
            if failure.kind == "insufficient_quota"
            else "Провайдер не вернул подсказку. Проверьте ключ, доступ к модели и подключение."
        )
        error = make_error(ErrorCode.PROVIDER_ERROR, message)
    except ContractError as failure:
        error = (
            make_error(
                ErrorCode.CONFIGURATION_ERROR,
                "Ключ или настройки провайдера недоступны. Подсказка не выполнена; апелляцию можно рассмотреть вручную.",
            )
            if failure.error.code == ErrorCode.CONFIGURATION_ERROR
            else failure.error
        )
    except asyncio.CancelledError:
        _finish(
            services,
            record.id,
            None,
            [],
            make_error(
                ErrorCode.CANCELLED, "Подсказка прервана. Сохранённые результаты не изменены."
            ),
        )
        raise
    except Exception:
        error = make_error(
            ErrorCode.INTERNAL_ERROR, "Подсказка недоступна. Оценка и решения не изменены."
        )
    return await asyncio.to_thread(_finish, services, record.id, proposal, fragments, error)


def list_opinions(
    services: Services, appeal_id: str, limit: int, offset: int
) -> tuple[list[SecondOpinion], int]:
    with services.db.read() as conn:
        if row(conn, "SELECT id FROM appeals WHERE id=:id", {"id": appeal_id}) is None:
            raise not_found("Appeal")
        values = rows(
            conn,
            "SELECT document_json FROM second_opinions WHERE appeal_id=:id ORDER BY seq DESC LIMIT :limit OFFSET :offset",
            {"id": appeal_id, "limit": limit, "offset": offset},
        )
        total = row(
            conn, "SELECT COUNT(*) AS n FROM second_opinions WHERE appeal_id=:id", {"id": appeal_id}
        )
        return [SecondOpinion.model_validate_json(v["document_json"]) for v in values], int(
            total["n"]
        ) if total else 0


def recover(services: Services) -> None:
    """A restart never resends an uncertain paid request."""
    with services.db.write() as conn:
        for stored in rows(conn, "SELECT * FROM second_opinions WHERE state='running'"):
            record = SecondOpinion.model_validate_json(stored["document_json"])
            calls = [
                c.model_copy(update={"outcome": "unknown", "finished_at": services.clock()})
                if c.outcome == "started"
                else c
                for c in record.calls
            ]
            record = record.model_copy(
                update={
                    "state": "failed",
                    "calls": calls,
                    "finished_at": services.clock(),
                    "error": make_error(
                        ErrorCode.CANCELLED,
                        "Сервер перезапущен. Исход вызова может быть неизвестен; автоматического повтора нет.",
                    ),
                }
            )
            run(
                conn,
                "UPDATE second_opinions SET state='failed',document_json=:document WHERE id=:id",
                {"id": record.id, "document": record.model_dump_json()},
            )
