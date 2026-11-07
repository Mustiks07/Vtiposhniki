"""Real /api/v1 handlers. Signatures mirror cqa_contracts.operations exactly.

Runtime OpenAPI equals the generated contract (tests enforce it): keep parameter
names, operation IDs and response models, and add no handler docstrings.
"""

from typing import Annotated, Any, Literal, cast

from cqa_contracts import http_models as h
from cqa_contracts.http_models import ImportRequest, Page
from cqa_contracts.models import (
    APIError,
    Appeal,
    ChecklistDraft,
    ChecklistVersion,
    Conversation,
    Decision,
    DecisionRequest,
    EvaluationView,
    Job,
    SafeExport,
)
from cqa_contracts.operations import ERROR_RESPONSES, EXPORT_RESPONSE, Limit, Offset
from fastapi import APIRouter, Header, Query, Request
from fastapi.responses import Response

from . import (
    appeals,
    audio,
    checklists,
    conversations,
    evaluations,
    exports,
    importing,
    jobs,
    organizer,
    registry,
)
from .services import Services

router = APIRouter(prefix="/api/v1", responses=ERROR_RESPONSES)


def _services(request: Request) -> Services:
    return cast(Services, request.app.state.services)


def _export_response(export: SafeExport, output: str) -> Any:
    if output == "csv":
        return Response(exports.to_csv(export), media_type="text/csv; charset=utf-8")
    return export


@router.get("/health", operation_id="getHealth", response_model=h.Health)
def health(request: Request) -> h.Health:
    services = _services(request)
    return h.Health(
        phase="application",
        business_ready=request.app.state.domain_ready and registry.has_usable_profile(services),
        evaluator_mode=services.settings.mode,
    )


@router.post(
    "/imports", operation_id="createImport", response_model=h.ImportResult, status_code=201
)
def create_import(request: Request, body: ImportRequest) -> h.ImportResult:
    services = _services(request)
    if isinstance(body, h.JSONImport):
        sources = [
            importing.SourceRecord(index=index, record=record, raw_json=record.model_dump_json())
            for index, record in enumerate(body.records)
        ]
        return importing.import_sources(services, sources, source="json")
    payload = organizer.fetch_organizer_payload(
        services.settings, body.group_id, services.organizer_transport
    )
    adapted = organizer.adapt_organizer_payload(payload, services.settings.import_max_records)
    return importing.import_sources(
        services, adapted, source="organizer_api", group_id=body.group_id
    )


@router.get(
    "/conversations", operation_id="listConversations", response_model=Page[h.ConversationSummary]
)
def list_conversations(
    request: Request,
    limit: Limit = 50,
    offset: Offset = 0,
    language: Literal["RU", "KZ", "EN"] | None = None,
    channel: Literal["agent_chat", "voice_call"] | None = None,
    status: Literal["unevaluated", "pending", "complete", "partial", "failed"] | None = None,
) -> Page[h.ConversationSummary]:
    items, total = conversations.list_conversations(
        _services(request), limit, offset, language, channel, status
    )
    return Page[h.ConversationSummary](items=items, total=total, limit=limit, offset=offset)


@router.get("/conversations/{id}", operation_id="getConversation", response_model=Conversation)
def get_conversation(
    request: Request, id: str, revision: Annotated[int | None, Query(ge=1)] = None
) -> Conversation:
    return conversations.get_conversation(_services(request), id, revision)


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
    request: Request,
    id: str,
    revision: Annotated[int | None, Query(ge=1)] = None,
    range: Annotated[str | None, Header(alias="Range")] = None,
) -> Response:
    return await audio.stream_audio(_services(request), id, revision, range)


@router.get("/checklists", operation_id="listChecklists", response_model=Page[h.ChecklistSummary])
def list_checklists(
    request: Request, limit: Limit = 50, offset: Offset = 0
) -> Page[h.ChecklistSummary]:
    items, total = checklists.list_checklists(_services(request), limit, offset)
    return Page[h.ChecklistSummary](items=items, total=total, limit=limit, offset=offset)


@router.post(
    "/checklists", operation_id="createChecklist", response_model=ChecklistVersion, status_code=201
)
def create_checklist(request: Request, body: ChecklistDraft) -> ChecklistVersion:
    return checklists.create_checklist(_services(request), body)


@router.get(
    "/checklists/{id}/versions", operation_id="listChecklistVersions", response_model=h.VersionList
)
def list_versions(
    request: Request, id: str, limit: Limit = 50, offset: Offset = 0
) -> h.VersionList:
    items, total = checklists.list_versions(_services(request), id, limit, offset)
    return h.VersionList(items=items, total=total, limit=limit, offset=offset)


@router.post(
    "/checklists/{id}/versions",
    operation_id="createChecklistVersion",
    response_model=ChecklistVersion,
    status_code=201,
)
def create_version(request: Request, id: str, body: h.CreateChecklistVersion) -> ChecklistVersion:
    return checklists.create_version(
        _services(request), id, body.expected_latest_version_id, body.config
    )


@router.get(
    "/checklist-versions/{version_id}",
    operation_id="getChecklistVersion",
    response_model=ChecklistVersion,
)
def get_version(request: Request, version_id: str) -> ChecklistVersion:
    return checklists.get_version(_services(request), version_id)


@router.post(
    "/evaluation-batches",
    operation_id="createEvaluationBatch",
    response_model=h.EvaluationBatch,
    status_code=202,
)
def create_batch(
    request: Request,
    body: h.CreateBatch,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=200)],
) -> h.EvaluationBatch:
    return jobs.create_batch(_services(request), body, idempotency_key)


@router.get(
    "/evaluation-batches/{id}", operation_id="getEvaluationBatch", response_model=h.EvaluationBatch
)
def get_batch(request: Request, id: str) -> h.EvaluationBatch:
    return jobs.get_batch(_services(request), id)


@router.get("/jobs/{id}", operation_id="getJob", response_model=Job)
def get_job(request: Request, id: str) -> Job:
    return jobs.get_job(_services(request), id)


@router.post("/jobs/{id}/retry", operation_id="retryJob", response_model=Job, status_code=202)
def retry_job(request: Request, id: str) -> Job:
    return jobs.build_queue(_services(request)).retry_manually(id)


@router.get("/evaluations", operation_id="listEvaluations", response_model=Page[EvaluationView])
def list_evaluations(
    request: Request,
    limit: Limit = 50,
    offset: Offset = 0,
    conversation_id: str | None = None,
    batch_id: str | None = None,
    status: Literal["complete", "partial", "failed"] | None = None,
) -> Page[EvaluationView]:
    items, total = evaluations.list_evaluations(
        _services(request), limit, offset, conversation_id, batch_id, status
    )
    return Page[EvaluationView](items=items, total=total, limit=limit, offset=offset)


@router.get("/evaluations/{id}", operation_id="getEvaluation", response_model=EvaluationView)
def get_evaluation(request: Request, id: str) -> EvaluationView:
    return evaluations.get_evaluation(_services(request), id)


@router.post(
    "/evaluations/{id}/appeals", operation_id="createAppeal", response_model=Appeal, status_code=201
)
def create_appeal(request: Request, id: str, body: h.CreateAppeal) -> Appeal:
    return appeals.create_appeal(_services(request), id, body)


@router.get("/appeals", operation_id="listAppeals", response_model=Page[Appeal])
def list_appeals(
    request: Request,
    limit: Limit = 50,
    offset: Offset = 0,
    state: Literal["open", "resolved"] | None = None,
    evaluation_id: str | None = None,
) -> Page[Appeal]:
    items, total = appeals.list_appeals(_services(request), limit, offset, state, evaluation_id)
    return Page[Appeal](items=items, total=total, limit=limit, offset=offset)


@router.post("/appeals/{id}/decision", operation_id="decideAppeal", response_model=Decision)
def decide_appeal(request: Request, id: str, body: DecisionRequest) -> Decision:
    return appeals.decide_appeal(_services(request), id, body)


@router.get(
    "/evaluations/{id}/export",
    operation_id="exportEvaluation",
    response_model=SafeExport,
    responses=EXPORT_RESPONSE,
)
def export_evaluation(
    request: Request,
    id: str,
    scope: Literal["automatic", "effective"] = "automatic",
    format: Literal["json", "csv"] = "json",
) -> Any:
    return _export_response(exports.export_evaluation(_services(request), id, scope), format)


@router.get(
    "/evaluation-batches/{id}/export",
    operation_id="exportBatch",
    response_model=SafeExport,
    responses=EXPORT_RESPONSE,
)
def export_batch(
    request: Request,
    id: str,
    scope: Literal["automatic", "effective"] = "automatic",
    format: Literal["json", "csv"] = "json",
) -> Any:
    return _export_response(exports.export_batch(_services(request), id, scope), format)


@router.get(
    "/evaluator-profiles", operation_id="listEvaluatorProfiles", response_model=Page[h.ProfileSummary]
)
def list_profiles(
    request: Request, limit: Limit = 50, offset: Offset = 0
) -> Page[h.ProfileSummary]:
    items, total = registry.list_profiles(_services(request), limit, offset)
    return Page[h.ProfileSummary](items=items, total=total, limit=limit, offset=offset)


@router.get(
    "/knowledge-sources", operation_id="listKnowledgeSources", response_model=h.KnowledgeSources
)
def list_sources(
    request: Request, limit: Limit = 50, offset: Offset = 0, corpus_snapshot_id: str | None = None
) -> h.KnowledgeSources:
    items, total = registry.list_sources(_services(request), limit, offset, corpus_snapshot_id)
    return h.KnowledgeSources(items=items, total=total, limit=limit, offset=offset)
