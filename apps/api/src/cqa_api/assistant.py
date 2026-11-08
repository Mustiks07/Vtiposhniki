"""AI suggestions live beside evaluations, never inside their scoring artifacts."""

import asyncio
import json
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from cqa_ai.coaching import coach
from cqa_ai.transport import ProviderFailure
from cqa_contracts.http_models import AssistantRun, CoachingRequest, CoachingResult
from cqa_contracts.interfaces import ContractError
from cqa_contracts.models import (
    APIError,
    CallEvent,
    ChecklistVersion,
    Conversation,
    CriterionProposal,
    ErrorCode,
    EvaluatorProfile,
    ExecutionBudget,
)

from .assistance import _record_call
from .checklists import pinned_checklist
from .conversations import pinned_conversation
from .db import row, rows, run
from .errors import ApiFailure, make_error, not_found
from .evaluations import view_from_row
from .registry import pinned_profile
from .services import Services


@dataclass(frozen=True)
class CoachingInputs:
    conversation: Conversation
    checklist: ChecklistVersion
    proposal: CriterionProposal
    profile: EvaluatorProfile
    budget: ExecutionBudget


def _prepare(
    services: Services, evaluation_id: str, body: CoachingRequest, key: str
) -> tuple[AssistantRun, CoachingInputs | None]:
    request_json = json.dumps(
        {"evaluation_id": evaluation_id, "body": body.model_dump(mode="json")}, sort_keys=True
    )
    with services.db.write() as conn:
        stored = row(conn, "SELECT * FROM assistant_runs WHERE request_key=:key", {"key": key})
        if stored:
            if stored["request_json"] != request_json:
                raise ApiFailure(
                    make_error(
                        ErrorCode.IDEMPOTENCY_CONFLICT,
                        "Ключ запроса уже использован для другой подсказки.",
                    )
                )
            return AssistantRun.model_validate_json(stored["document_json"]), None
        found = row(conn, "SELECT * FROM evaluations WHERE id=:id", {"id": evaluation_id})
        if found is None:
            raise not_found("Evaluation")
        evaluation = view_from_row(conn, found)
        if evaluation.revision != body.expected_revision:
            raise ApiFailure(
                make_error(
                    ErrorCode.REVISION_CONFLICT,
                    "Оценка изменена. Обновите карточку перед запросом подсказки.",
                ),
                status=409,
            )
        score = (
            evaluation.automatic_score if body.scope == "automatic" else evaluation.effective_score
        )
        contribution = next(
            (c for c in score.contributions if c.criterion_id == body.criterion_id), None
        )
        if (
            contribution is None
            or contribution.applicability != "applicable"
            or contribution.earned_weight is None
            or contribution.original_weight <= 0
            or contribution.earned_weight >= contribution.original_weight
        ):
            raise ApiFailure(
                make_error(
                    ErrorCode.INVALID_STATE,
                    "Подсказка доступна для критерия с потерянными баллами.",
                )
            )
        proposals = (
            evaluation.artifact.automatic_final
            if body.scope == "automatic"
            else evaluation.effective_proposals
        )
        proposal = next(p for p in proposals if p.criterion_id == body.criterion_id)
        conversation = pinned_conversation(
            conn, evaluation.conversation_id, evaluation.conversation_revision
        )
        if not any(m.speaker == "operator" for m in conversation.messages):
            raise ApiFailure(
                make_error(
                    ErrorCode.INVALID_STATE, "В разговоре нет реплики оператора для подсказки."
                )
            )
        if row(
            conn,
            "SELECT id FROM assistant_runs WHERE context_key=:id AND state='running'",
            {"id": evaluation_id},
        ):
            raise ApiFailure(
                make_error(ErrorCode.INVALID_STATE, "Для этой оценки уже выполняется подсказка."),
                status=409,
            )
        profile = pinned_profile(conn, evaluation.profile_id, evaluation.profile_version)
        if profile.mode != services.settings.mode:
            raise ApiFailure(
                make_error(
                    ErrorCode.CONFIGURATION_ERROR, "Режим профиля не совпадает с режимом сервера."
                )
            )
        identity = f"advice_{uuid4().hex}"
        now = services.clock()
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
        result = AssistantRun(
            id=identity,
            kind="coaching",
            evaluation_id=evaluation_id,
            evaluation_revision=evaluation.revision,
            criterion_id=body.criterion_id,
            scope=body.scope,
            profile_id=profile.id,
            profile_version=profile.version,
            mode=profile.mode,
            state="running",
            created_at=now,
        )
        inputs = CoachingInputs(
            conversation,
            pinned_checklist(conn, evaluation.checklist_version_id),
            proposal,
            profile,
            budget,
        )
        run(
            conn,
            "INSERT INTO assistant_runs (id,context_key,request_key,request_json,state,document_json,budget_json) VALUES (:id,:context,:key,:request,'running',:document,:budget)",
            {
                "id": identity,
                "context": evaluation_id,
                "key": key,
                "request": request_json,
                "document": result.model_dump_json(),
                "budget": budget.model_dump_json(),
            },
        )
        return result, inputs


def _finish(
    services: Services, identity: str, coaching: CoachingResult | None, error: APIError | None
) -> AssistantRun:
    with services.db.write() as conn:
        stored = row(conn, "SELECT * FROM assistant_runs WHERE id=:id", {"id": identity})
        assert stored is not None
        result = AssistantRun.model_validate_json(stored["document_json"])
        if result.state != "running":
            return result
        result = result.model_copy(
            update={
                "state": "failed" if error else "succeeded",
                "finished_at": services.clock(),
                "coaching": coaching,
                "error": error,
            }
        )
        run(
            conn,
            "UPDATE assistant_runs SET state=:state,document_json=:document WHERE id=:id",
            {"state": result.state, "document": result.model_dump_json(), "id": identity},
        )
        return result


async def create_coaching(
    services: Services, evaluation_id: str, body: CoachingRequest, key: str
) -> AssistantRun:
    record, inputs = await asyncio.to_thread(_prepare, services, evaluation_id, body, key)
    if inputs is None:
        return record

    async def observer(event: CallEvent) -> ExecutionBudget:
        return await asyncio.to_thread(
            _record_call,
            services,
            record.id,
            event,
            table="assistant_runs",
            record_type=AssistantRun,
        )

    result = None
    error = None
    try:
        result = await coach(
            inputs.conversation,
            inputs.checklist,
            inputs.proposal,
            inputs.profile,
            inputs.budget,
            observer,
        )
    except ProviderFailure as failure:
        error = make_error(
            ErrorCode.PROVIDER_ERROR,
            "Недостаточно квоты провайдера для подсказки. Оценка сохранена."
            if failure.kind == "insufficient_quota"
            else "Подсказка недоступна. Проверьте доступ к модели и подключение.",
        )
    except ContractError as failure:
        error = (
            make_error(
                ErrorCode.CONFIGURATION_ERROR,
                "Ключ или настройки провайдера недоступны. Оценку можно просматривать и оспаривать как обычно.",
            )
            if failure.error.code == ErrorCode.CONFIGURATION_ERROR
            else failure.error
        )
    except asyncio.CancelledError:
        _finish(
            services,
            record.id,
            None,
            make_error(ErrorCode.CANCELLED, "Подсказка прервана. Оценка не изменена."),
        )
        raise
    except Exception:
        error = make_error(
            ErrorCode.INTERNAL_ERROR, "Подсказка недоступна. Оценка и решения не изменены."
        )
    return await asyncio.to_thread(_finish, services, record.id, result, error)


def list_runs(
    services: Services, evaluation_id: str, limit: int, offset: int
) -> tuple[list[AssistantRun], int]:
    with services.db.read() as conn:
        if row(conn, "SELECT id FROM evaluations WHERE id=:id", {"id": evaluation_id}) is None:
            raise not_found("Evaluation")
        values = rows(
            conn,
            "SELECT document_json FROM assistant_runs WHERE context_key=:id ORDER BY seq DESC LIMIT :limit OFFSET :offset",
            {"id": evaluation_id, "limit": limit, "offset": offset},
        )
        total = row(
            conn,
            "SELECT COUNT(*) AS n FROM assistant_runs WHERE context_key=:id",
            {"id": evaluation_id},
        )
        return [AssistantRun.model_validate_json(v["document_json"]) for v in values], int(
            total["n"]
        ) if total else 0


def recover(services: Services) -> None:
    with services.db.write() as conn:
        for stored in rows(conn, "SELECT * FROM assistant_runs WHERE state='running'"):
            result = AssistantRun.model_validate_json(stored["document_json"])
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
                "UPDATE assistant_runs SET state='failed',document_json=:document WHERE id=:id",
                {"id": result.id, "document": result.model_dump_json()},
            )
