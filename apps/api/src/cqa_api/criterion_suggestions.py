"""Durable criterion drafts; no writes to checklists, evaluations or decisions."""

import asyncio
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from cqa_ai.criterion_design import suggest_criterion
from cqa_ai.transport import ProviderFailure
from cqa_contracts.http_models import (
    CriterionBlueprint,
    CriterionSuggestionRun,
    SuggestCriterionRequest,
)
from cqa_contracts.interfaces import ContractError
from cqa_contracts.models import APIError, CallEvent, ErrorCode, EvaluatorProfile, ExecutionBudget

from .assistance import _record_call
from .db import row, rows, run
from .errors import ApiFailure, make_error
from .registry import latest_profile
from .services import Services


def _prepare(
    services: Services, body: SuggestCriterionRequest, key: str
) -> tuple[CriterionSuggestionRun, EvaluatorProfile | None, ExecutionBudget | None]:
    request_json = body.model_dump_json()
    with services.db.write() as conn:
        stored = row(
            conn, "SELECT * FROM criterion_suggestions WHERE request_key=:key", {"key": key}
        )
        if stored:
            if stored["request_json"] != request_json:
                raise ApiFailure(
                    make_error(
                        ErrorCode.IDEMPOTENCY_CONFLICT,
                        "Ключ уже относится к другому предложению критерия.",
                    )
                )
            return CriterionSuggestionRun.model_validate_json(stored["document_json"]), None, None
        profile = latest_profile(conn, body.profile_id)
        if profile.mode != services.settings.mode:
            raise ApiFailure(
                make_error(
                    ErrorCode.CONFIGURATION_ERROR, "Режим профиля не совпадает с режимом сервера."
                )
            )
        now = services.clock()
        identity = f"design_{uuid4().hex}"
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
        result = CriterionSuggestionRun(
            id=identity,
            title=body.title,
            profile_id=profile.id,
            profile_version=profile.version,
            mode=profile.mode,
            state="running",
            created_at=now,
        )
        run(
            conn,
            "INSERT INTO criterion_suggestions (id,request_key,request_json,state,document_json,budget_json) VALUES (:id,:key,:request,'running',:document,:budget)",
            {
                "id": identity,
                "key": key,
                "request": request_json,
                "document": result.model_dump_json(),
                "budget": budget.model_dump_json(),
            },
        )
        return result, profile, budget


def _finish(
    services: Services, identity: str, suggestion: CriterionBlueprint | None, error: APIError | None
) -> CriterionSuggestionRun:
    with services.db.write() as conn:
        stored = row(conn, "SELECT * FROM criterion_suggestions WHERE id=:id", {"id": identity})
        assert stored is not None
        result = CriterionSuggestionRun.model_validate_json(stored["document_json"])
        if result.state != "running":
            return result
        result = result.model_copy(
            update={
                "state": "failed" if error else "succeeded",
                "suggestion": suggestion,
                "error": error,
                "finished_at": services.clock(),
            }
        )
        run(
            conn,
            "UPDATE criterion_suggestions SET state=:state,document_json=:document WHERE id=:id",
            {"state": result.state, "document": result.model_dump_json(), "id": identity},
        )
        return result


async def create(
    services: Services, body: SuggestCriterionRequest, key: str
) -> CriterionSuggestionRun:
    record, profile, budget = await asyncio.to_thread(_prepare, services, body, key)
    if profile is None or budget is None:
        return record

    async def observer(event: CallEvent) -> ExecutionBudget:
        return await asyncio.to_thread(
            _record_call,
            services,
            record.id,
            event,
            table="criterion_suggestions",
            record_type=CriterionSuggestionRun,
        )

    suggestion = None
    error = None
    try:
        suggestion = await suggest_criterion(body, profile, budget, observer)
    except ProviderFailure as failure:
        error = make_error(
            ErrorCode.PROVIDER_ERROR,
            "Недостаточно квоты провайдера. Черновик можно заполнить вручную."
            if failure.kind == "insufficient_quota"
            else "AI-подсказка недоступна. Проверьте доступ к модели и подключение; редактор работает как обычно.",
        )
    except ContractError as failure:
        error = (
            make_error(
                ErrorCode.CONFIGURATION_ERROR,
                "Ключ или настройки провайдера недоступны. Редактор работает как обычно.",
            )
            if failure.error.code == ErrorCode.CONFIGURATION_ERROR
            else failure.error
        )
    except asyncio.CancelledError:
        _finish(
            services,
            record.id,
            None,
            make_error(ErrorCode.CANCELLED, "Подсказка прервана. Черновик не изменён."),
        )
        raise
    except Exception:
        error = make_error(
            ErrorCode.INTERNAL_ERROR, "AI-подсказка недоступна. Черновик не изменён."
        )
    return await asyncio.to_thread(_finish, services, record.id, suggestion, error)


def list_suggestions(
    services: Services, limit: int, offset: int
) -> tuple[list[CriterionSuggestionRun], int]:
    with services.db.read() as conn:
        records = rows(
            conn,
            "SELECT document_json FROM criterion_suggestions ORDER BY seq DESC LIMIT :limit OFFSET :offset",
            {"limit": limit, "offset": offset},
        )
        total = row(conn, "SELECT COUNT(*) AS n FROM criterion_suggestions")
        return [
            CriterionSuggestionRun.model_validate_json(r["document_json"]) for r in records
        ], int(total["n"]) if total else 0


def recover(services: Services) -> None:
    with services.db.write() as conn:
        for stored in rows(conn, "SELECT * FROM criterion_suggestions WHERE state='running'"):
            result = CriterionSuggestionRun.model_validate_json(stored["document_json"])
            calls = [
                c.model_copy(update={"outcome": "unknown", "finished_at": services.clock()})
                if c.outcome == "started"
                else c
                for c in result.calls
            ]
            result = result.model_copy(
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
                "UPDATE criterion_suggestions SET state='failed',document_json=:document WHERE id=:id",
                {"id": result.id, "document": result.model_dump_json()},
            )
