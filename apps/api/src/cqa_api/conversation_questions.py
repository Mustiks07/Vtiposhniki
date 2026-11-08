"""Durable, scope-pinned Q&A; all assessment and decision rows remain read-only."""

import asyncio
import json
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from cqa_ai.conversation_questions import answer_question
from cqa_ai.transport import ProviderFailure
from cqa_contracts.http_models import (
    ConversationAnswer,
    ConversationQuestionRequest,
    ConversationQuestionRun,
)
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
    ScoreSummary,
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
class Inputs:
    conversation: Conversation
    checklist: ChecklistVersion
    proposals: list[CriterionProposal]
    score: ScoreSummary
    profile: EvaluatorProfile
    budget: ExecutionBudget


def _prepare(
    services: Services, evaluation_id: str, body: ConversationQuestionRequest, key: str
) -> tuple[ConversationQuestionRun, Inputs | None]:
    request_json = json.dumps(
        {"evaluation_id": evaluation_id, "body": body.model_dump(mode="json")}, sort_keys=True
    )
    with services.db.write() as conn:
        stored = row(
            conn, "SELECT * FROM conversation_questions WHERE request_key=:key", {"key": key}
        )
        if stored:
            if stored["request_json"] != request_json:
                raise ApiFailure(
                    make_error(
                        ErrorCode.IDEMPOTENCY_CONFLICT, "Ключ запроса относится к другому вопросу."
                    )
                )
            return ConversationQuestionRun.model_validate_json(stored["document_json"]), None
        found = row(conn, "SELECT * FROM evaluations WHERE id=:id", {"id": evaluation_id})
        if found is None:
            raise not_found("Evaluation")
        evaluation = view_from_row(conn, found)
        if evaluation.revision != body.expected_revision:
            raise ApiFailure(
                make_error(
                    ErrorCode.REVISION_CONFLICT,
                    "Оценка изменена. Обновите карточку перед вопросом.",
                ),
                status=409,
            )
        if row(
            conn,
            "SELECT id FROM conversation_questions WHERE evaluation_id=:id AND state='running'",
            {"id": evaluation_id},
        ):
            raise ApiFailure(
                make_error(ErrorCode.INVALID_STATE, "Ответ на предыдущий вопрос ещё выполняется."),
                status=409,
            )
        profile = pinned_profile(conn, evaluation.profile_id, evaluation.profile_version)
        if profile.mode != services.settings.mode:
            raise ApiFailure(
                make_error(
                    ErrorCode.CONFIGURATION_ERROR, "Режим профиля не совпадает с режимом сервера."
                )
            )
        now = services.clock()
        identity = f"question_{uuid4().hex}"
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
        result = ConversationQuestionRun(
            id=identity,
            evaluation_id=evaluation_id,
            evaluation_revision=evaluation.revision,
            scope=body.scope,
            question=body.question,
            profile_id=profile.id,
            profile_version=profile.version,
            mode=profile.mode,
            state="running",
            created_at=now,
        )
        inputs = Inputs(
            pinned_conversation(conn, evaluation.conversation_id, evaluation.conversation_revision),
            pinned_checklist(conn, evaluation.checklist_version_id),
            evaluation.artifact.automatic_final
            if body.scope == "automatic"
            else evaluation.effective_proposals,
            evaluation.automatic_score if body.scope == "automatic" else evaluation.effective_score,
            profile,
            budget,
        )
        run(
            conn,
            "INSERT INTO conversation_questions (id,evaluation_id,request_key,request_json,state,document_json,budget_json) VALUES (:id,:evaluation,:key,:request,'running',:document,:budget)",
            {
                "id": identity,
                "evaluation": evaluation_id,
                "key": key,
                "request": request_json,
                "document": result.model_dump_json(),
                "budget": budget.model_dump_json(),
            },
        )
        return result, inputs


def _finish(
    services: Services, identity: str, answer: ConversationAnswer | None, error: APIError | None
) -> ConversationQuestionRun:
    with services.db.write() as conn:
        stored = row(conn, "SELECT * FROM conversation_questions WHERE id=:id", {"id": identity})
        assert stored is not None
        result = ConversationQuestionRun.model_validate_json(stored["document_json"])
        if result.state != "running":
            return result
        result = result.model_copy(
            update={
                "state": "failed" if error else "succeeded",
                "answer": answer,
                "error": error,
                "finished_at": services.clock(),
            }
        )
        run(
            conn,
            "UPDATE conversation_questions SET state=:state,document_json=:document WHERE id=:id",
            {"state": result.state, "document": result.model_dump_json(), "id": identity},
        )
        return result


async def create(
    services: Services, evaluation_id: str, body: ConversationQuestionRequest, key: str
) -> ConversationQuestionRun:
    record, inputs = await asyncio.to_thread(_prepare, services, evaluation_id, body, key)
    if inputs is None:
        return record

    async def observer(event: CallEvent) -> ExecutionBudget:
        return await asyncio.to_thread(
            _record_call,
            services,
            record.id,
            event,
            table="conversation_questions",
            record_type=ConversationQuestionRun,
        )

    answer = None
    error = None
    try:
        answer = await answer_question(
            body,
            inputs.conversation,
            inputs.checklist,
            inputs.proposals,
            inputs.score,
            inputs.profile,
            inputs.budget,
            observer,
        )
    except ProviderFailure as failure:
        error = make_error(
            ErrorCode.PROVIDER_ERROR,
            "Недостаточно квоты провайдера. Оценка и доказательства остаются доступны."
            if failure.kind == "insufficient_quota"
            else "AI-подсказка недоступна. Проверьте доступ к модели и подключение; оценка сохранена.",
        )
    except ContractError as failure:
        error = (
            make_error(
                ErrorCode.CONFIGURATION_ERROR,
                "Ключ или настройки провайдера недоступны. Оценка и апелляции работают как обычно.",
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
            ErrorCode.INTERNAL_ERROR, "AI-подсказка недоступна. Оценка и решения не изменены."
        )
    return await asyncio.to_thread(_finish, services, record.id, answer, error)


def list_questions(
    services: Services, evaluation_id: str, limit: int, offset: int
) -> tuple[list[ConversationQuestionRun], int]:
    with services.db.read() as conn:
        if row(conn, "SELECT id FROM evaluations WHERE id=:id", {"id": evaluation_id}) is None:
            raise not_found("Evaluation")
        records = rows(
            conn,
            "SELECT document_json FROM conversation_questions WHERE evaluation_id=:id ORDER BY seq DESC LIMIT :limit OFFSET :offset",
            {"id": evaluation_id, "limit": limit, "offset": offset},
        )
        total = row(
            conn,
            "SELECT COUNT(*) AS n FROM conversation_questions WHERE evaluation_id=:id",
            {"id": evaluation_id},
        )
        return [
            ConversationQuestionRun.model_validate_json(r["document_json"]) for r in records
        ], int(total["n"]) if total else 0


def recover(services: Services) -> None:
    with services.db.write() as conn:
        for stored in rows(conn, "SELECT * FROM conversation_questions WHERE state='running'"):
            result = ConversationQuestionRun.model_validate_json(stored["document_json"])
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
                "UPDATE conversation_questions SET state='failed',document_json=:document WHERE id=:id",
                {"id": result.id, "document": result.model_dump_json()},
            )
