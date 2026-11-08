"""CQA API application. Importing this module opens nothing: startup is in the lifespan."""

import asyncio
import logging
import os
from collections.abc import AsyncIterator, Awaitable, Callable, MutableMapping
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
from cqa_contracts import API_VERSION
from cqa_contracts.interfaces import Evaluator
from cqa_contracts.models import AudioMetadata, Conversation, ErrorCode, Message
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .assistance import recover as recover_assistance
from .checklists import seed_original_checklist
from .errors import install_error_handlers, make_error
from .ports import DomainPort, production_domain
from .registry import sync_registry
from .routes import router
from .services import Clock, build_services, utc_now
from .settings import Settings, load_settings
from .worker import Worker

Scope = MutableMapping[str, Any]
Message_ = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message_]]
Send = Callable[[Message_], Awaitable[None]]

logger = logging.getLogger("cqa_api")


class BodyLimitMiddleware:
    """Refuse oversized request bodies before they are parsed or buffered further."""

    def __init__(self, app: Callable[[Scope, Receive, Send], Awaitable[None]]) -> None:
        self.app = app

    async def _refuse(self, send: Send) -> None:
        error = make_error(ErrorCode.PAYLOAD_TOO_LARGE, "Payload exceeds the configured limit")
        response = JSONResponse(error.model_dump(mode="json"), status_code=413)
        await send(
            {
                "type": "http.response.start",
                "status": response.status_code,
                "headers": response.raw_headers,
            }
        )
        await send({"type": "http.response.body", "body": response.body})

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] != "POST":
            await self.app(scope, receive, send)
            return
        limit = scope["app"].state.services.settings.import_max_bytes
        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > limit:
            await self._refuse(send)
            return
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] != "http.request":
                break
            body.extend(message.get("body", b""))
            if len(body) > limit:
                await self._refuse(send)
                return
            if not message.get("more_body"):
                break
        replayed = False

        async def replay() -> Message_:
            nonlocal replayed
            if replayed:
                return await receive()
            replayed = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self.app(scope, replay, send)


def _domain_ready() -> bool:
    """True only when the real content hash runs: a stand-in is not business readiness."""
    probe = Conversation(
        id="probe",
        external_id="probe",
        revision=1,
        content_hash="0" * 64,
        channel="agent_chat",
        language="EN",
        messages=[
            Message(
                id="m0001",
                ordinal=1,
                speaker="client",
                text="",
                timestamp_original="",
                source_index=0,
            )
        ],
        audio=AudioMetadata(availability="unavailable", alignment_status="unavailable"),
    )
    try:
        production_domain().conversation_content_hash(probe)
    except NotImplementedError:
        return False
    return True


def create_app(
    settings: Settings | None = None,
    *,
    domain: DomainPort | None = None,
    evaluator: Evaluator | None = None,
    clock: Clock = utc_now,
    organizer_transport: httpx.BaseTransport | None = None,
    audio_transport: httpx.AsyncBaseTransport | None = None,
    host_resolver: Callable[[str], list[str]] | None = None,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # httpx logs full request URLs at INFO, which would expose the secret dataset URL.
        logging.getLogger("httpx").setLevel(logging.WARNING)
        services = build_services(
            settings if settings is not None else load_settings(),
            domain=domain,
            evaluator=evaluator,
            clock=clock,
            organizer_transport=organizer_transport,
            audio_transport=audio_transport,
            host_resolver=host_resolver,
        )
        services.db.migrate()
        recover_assistance(services)
        sync_registry(services)
        seed_original_checklist(services)
        worker = Worker(services)
        app.state.services = services
        app.state.worker = worker
        app.state.domain_ready = _domain_ready()
        stop = asyncio.Event()
        task = asyncio.create_task(worker.run(stop)) if services.settings.worker_enabled else None
        try:
            yield
        finally:
            stop.set()
            if task is not None:
                await task
            services.db.dispose()

    app = FastAPI(
        title="CQA API",
        version=API_VERSION,
        separate_input_output_schemas=False,
        lifespan=lifespan,
    )
    app.add_middleware(BodyLimitMiddleware)
    install_error_handlers(app)
    app.include_router(router)
    web_dist = Path(os.environ.get("CQA_WEB_DIST", "apps/web/dist"))
    if web_dist.is_dir():
        app.mount("/", StaticFiles(directory=web_dist, html=True), name="web")
    return app


app = create_app()
