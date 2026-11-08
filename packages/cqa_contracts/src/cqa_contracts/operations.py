"""The v1 operation contract. Business handlers intentionally return HTTP 501.

B replaces implementations, keeping paths, IDs, query parameters and schemas.
This module is also the sole OpenAPI source for the foundation generator.
"""

from typing import Annotated, Any, Literal
from uuid import uuid4

from fastapi import APIRouter, FastAPI, Header, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from starlette.exceptions import HTTPException

from . import API_VERSION
from .http_models import (
    ChecklistSummary,
    ConversationQuestionRequest,
    ConversationQuestionRun,
    ConversationSort,
    ConversationSummary,
    CreateAppeal,
    CreateBatch,
    CreateChecklistVersion,
    CriterionSuggestionRun,
    EvaluationBatch,
    FlagScope,
    FlagStatus,
    Health,
    ImportRequest,
    ImportResult,
    KnowledgeSources,
    Page,
    ProfileSummary,
    SecondOpinion,
    SuggestCriterionRequest,
    VersionList,
    WorkQueue,
)
from .interfaces import ContractError
from .models import (
    APIError,
    Appeal,
    ChecklistDraft,
    ChecklistVersion,
    Conversation,
    Decision,
    DecisionRequest,
    ErrorCode,
    ErrorDetail,
    EvaluationView,
    Job,
    SafeExport,
)
from .queries import conversation_flag_query

ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    status: {"model": APIError, "description": description}
    for status, description in {
        400: "Invalid operation",
        404: "Not found",
        409: "Version/state conflict",
        413: "Payload limit exceeded",
        422: "Invalid request (no input values echoed)",
        429: "Rate limited",
        500: "Internal failure",
        501: "Foundation placeholder",
        503: "Unavailable or configuration error",
        504: "Timeout",
    }.items()
}
router = APIRouter(prefix="/api/v1", responses=ERROR_RESPONSES)
Limit = Annotated[int, Query(ge=1, le=200)]
Offset = Annotated[int, Query(ge=0)]


def unimplemented() -> None:
    raise ContractError(
        APIError(
            code=ErrorCode.NOT_IMPLEMENTED,
            message="Foundation: operation is not implemented",
            retryable=False,
            correlation_id=str(uuid4()),
        )
    )


@router.get("/health", operation_id="getHealth", response_model=Health)
async def health() -> Health:
    return Health()


@router.post("/imports", operation_id="createImport", response_model=ImportResult, status_code=201)
async def create_import(body: ImportRequest) -> None:
    unimplemented()


@router.get(
    "/conversations", operation_id="listConversations", response_model=Page[ConversationSummary]
)
async def list_conversations(
    limit: Limit = 50,
    offset: Offset = 0,
    language: Literal["RU", "KZ", "EN"] | None = None,
    channel: Literal["agent_chat", "voice_call"] | None = None,
    status: Literal["unevaluated", "pending", "complete", "partial", "failed"] | None = None,
    checklist_version_id: Annotated[str | None, Query(min_length=1, max_length=200)] = None,
    flag_criterion_id: Annotated[str | None, Query(min_length=1, max_length=200)] = None,
    flag_status: FlagStatus | None = None,
    flag_scope: FlagScope = "automatic",
    q: Annotated[str | None, Query(max_length=200)] = None,
    work_queue: WorkQueue | None = None,
    sort: ConversationSort = "newest",
    max_score: Annotated[float | None, Query(ge=0, le=100, allow_inf_nan=False)] = None,
    result_scope: FlagScope = "automatic",
) -> None:
    conversation_flag_query(checklist_version_id, flag_criterion_id, flag_status, flag_scope)
    unimplemented()


@router.get("/conversations/{id}", operation_id="getConversation", response_model=Conversation)
async def get_conversation(id: str, revision: Annotated[int | None, Query(ge=1)] = None) -> None:
    unimplemented()


@router.get(
    "/conversations/{id}/audio",
    operation_id="getConversationAudio",
    response_class=Response,
    responses={
        200: {"content": {"audio/mpeg": {"schema": {"type": "string", "format": "binary"}}}},
        206: {
            "description": "Verified byte range",
            "content": {"audio/mpeg": {"schema": {"type": "string", "format": "binary"}}},
        },
        416: {"model": APIError, "description": "Invalid byte range"},
    },
)
async def get_audio(
    id: str,
    revision: Annotated[int | None, Query(ge=1)] = None,
    range: Annotated[str | None, Header(alias="Range")] = None,
) -> None:
    unimplemented()


@router.get("/checklists", operation_id="listChecklists", response_model=Page[ChecklistSummary])
async def list_checklists(limit: Limit = 50, offset: Offset = 0) -> None:
    unimplemented()


@router.post(
    "/checklists", operation_id="createChecklist", response_model=ChecklistVersion, status_code=201
)
async def create_checklist(body: ChecklistDraft) -> None:
    unimplemented()


@router.get(
    "/checklists/{id}/versions", operation_id="listChecklistVersions", response_model=VersionList
)
async def list_versions(id: str, limit: Limit = 50, offset: Offset = 0) -> None:
    unimplemented()


@router.post(
    "/checklists/{id}/versions",
    operation_id="createChecklistVersion",
    response_model=ChecklistVersion,
    status_code=201,
)
async def create_version(id: str, body: CreateChecklistVersion) -> None:
    unimplemented()


@router.get(
    "/checklist-versions/{version_id}",
    operation_id="getChecklistVersion",
    response_model=ChecklistVersion,
)
async def get_version(version_id: str) -> None:
    unimplemented()


@router.post(
    "/evaluation-batches",
    operation_id="createEvaluationBatch",
    response_model=EvaluationBatch,
    status_code=202,
)
async def create_batch(
    body: CreateBatch,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=200)],
) -> None:
    unimplemented()


@router.get(
    "/evaluation-batches/{id}", operation_id="getEvaluationBatch", response_model=EvaluationBatch
)
async def get_batch(id: str) -> None:
    unimplemented()


@router.get("/jobs/{id}", operation_id="getJob", response_model=Job)
async def get_job(id: str) -> None:
    unimplemented()


@router.post("/jobs/{id}/retry", operation_id="retryJob", response_model=Job, status_code=202)
async def retry_job(id: str) -> None:
    unimplemented()


@router.get("/evaluations", operation_id="listEvaluations", response_model=Page[EvaluationView])
async def list_evaluations(
    limit: Limit = 50,
    offset: Offset = 0,
    conversation_id: str | None = None,
    batch_id: str | None = None,
    status: Literal["complete", "partial", "failed"] | None = None,
) -> None:
    unimplemented()


@router.get("/evaluations/{id}", operation_id="getEvaluation", response_model=EvaluationView)
async def get_evaluation(id: str) -> None:
    unimplemented()


@router.post(
    "/evaluations/{id}/appeals", operation_id="createAppeal", response_model=Appeal, status_code=201
)
async def create_appeal(id: str, body: CreateAppeal) -> None:
    unimplemented()


@router.get("/appeals", operation_id="listAppeals", response_model=Page[Appeal])
async def list_appeals(
    limit: Limit = 50,
    offset: Offset = 0,
    state: Literal["open", "resolved"] | None = None,
    evaluation_id: str | None = None,
) -> None:
    unimplemented()


@router.get("/appeals/{id}", operation_id="getAppeal", response_model=Appeal)
async def get_appeal(id: str) -> None:
    unimplemented()


@router.post("/appeals/{id}/decision", operation_id="decideAppeal", response_model=Decision)
async def decide_appeal(id: str, body: DecisionRequest) -> None:
    unimplemented()


EXPORT_RESPONSE: dict[int | str, dict[str, Any]] = {
    200: {
        "content": {"text/csv": {"schema": {"type": "string"}}},
        "description": "Safe v1 JSON DTO or documented CSV projection",
    }
}


@router.get(
    "/evaluations/{id}/export",
    operation_id="exportEvaluation",
    response_model=SafeExport,
    responses=EXPORT_RESPONSE,
)
async def export_evaluation(
    id: str,
    scope: Literal["automatic", "effective"] = "automatic",
    format: Literal["json", "csv"] = "json",
) -> None:
    unimplemented()


@router.get(
    "/evaluation-batches/{id}/export",
    operation_id="exportBatch",
    response_model=SafeExport,
    responses=EXPORT_RESPONSE,
)
async def export_batch(
    id: str,
    scope: Literal["automatic", "effective"] = "automatic",
    format: Literal["json", "csv"] = "json",
) -> None:
    unimplemented()


@router.get(
    "/evaluator-profiles", operation_id="listEvaluatorProfiles", response_model=Page[ProfileSummary]
)
async def list_profiles(limit: Limit = 50, offset: Offset = 0) -> None:
    unimplemented()


@router.get(
    "/knowledge-sources", operation_id="listKnowledgeSources", response_model=KnowledgeSources
)
async def list_sources(
    limit: Limit = 50, offset: Offset = 0, corpus_snapshot_id: str | None = None
) -> None:
    unimplemented()


@router.post(
    "/appeals/{id}/second-opinions",
    operation_id="createSecondOpinion",
    response_model=SecondOpinion,
    status_code=201,
)
async def create_second_opinion(
    id: str,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=200)],
) -> None:
    unimplemented()


@router.get(
    "/appeals/{id}/second-opinions",
    operation_id="listSecondOpinions",
    response_model=Page[SecondOpinion],
)
async def list_second_opinions(id: str, limit: Limit = 50, offset: Offset = 0) -> None:
    unimplemented()


@router.post(
    "/criterion-suggestions",
    operation_id="suggestCriterion",
    response_model=CriterionSuggestionRun,
    status_code=201,
)
async def suggest_criterion(
    body: SuggestCriterionRequest,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=200)],
) -> None:
    unimplemented()


@router.get(
    "/criterion-suggestions",
    operation_id="listCriterionSuggestions",
    response_model=Page[CriterionSuggestionRun],
)
async def list_criterion_suggestions(limit: Limit = 50, offset: Offset = 0) -> None:
    unimplemented()


@router.post(
    "/evaluations/{id}/questions",
    operation_id="askConversation",
    response_model=ConversationQuestionRun,
    status_code=201,
)
async def ask_conversation(
    id: str,
    body: ConversationQuestionRequest,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=200)],
) -> None:
    unimplemented()


@router.get(
    "/evaluations/{id}/questions",
    operation_id="listConversationQuestions",
    response_model=Page[ConversationQuestionRun],
)
async def list_conversation_questions(id: str, limit: Limit = 50, offset: Offset = 0) -> None:
    unimplemented()


def create_contract_app() -> FastAPI:
    app = FastAPI(title="CQA API", version=API_VERSION, separate_input_output_schemas=False)
    app.include_router(router)

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        error = APIError(
            code=ErrorCode.INTERNAL_ERROR,
            message="Internal server error",
            retryable=False,
            correlation_id=str(uuid4()),
        )
        return JSONResponse(status_code=500, content=error.model_dump(mode="json"))

    @app.exception_handler(ContractError)
    async def contract_error(request: Request, exc: ContractError) -> JSONResponse:
        status = {
            ErrorCode.NOT_IMPLEMENTED: 501,
            ErrorCode.VALIDATION_ERROR: 422,
        }.get(exc.error.code, 503)
        return JSONResponse(status_code=status, content=exc.error.model_dump(mode="json"))

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        error = APIError(
            code=ErrorCode.VALIDATION_ERROR,
            message="Invalid request",
            details=[
                ErrorDetail(field=".".join(str(v) for v in e["loc"]), reason="invalid")
                for e in exc.errors()
            ],
            retryable=False,
            correlation_id=str(uuid4()),
        )
        return JSONResponse(status_code=422, content=error.model_dump(mode="json"))

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        error = APIError(
            code=ErrorCode.NOT_FOUND if exc.status_code == 404 else ErrorCode.INVALID_STATE,
            message="Resource not found" if exc.status_code == 404 else "Request rejected",
            retryable=False,
            correlation_id=str(uuid4()),
        )
        return JSONResponse(status_code=exc.status_code, content=error.model_dump(mode="json"))

    return app
