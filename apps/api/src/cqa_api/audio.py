"""Verified audio delivery. The route takes a conversation ID, never a client URL.

The signed source URL stays private: it never appears in responses, logs or errors,
and no redirect exposes it. Every hop is checked: HTTPS only, an allowlisted host, no
credentials, and no address that resolves outside the public internet.
"""

import ipaddress
import re
import socket
from collections.abc import AsyncIterator, Callable
from urllib.parse import urljoin, urlsplit

import httpx
from cqa_contracts.models import AudioMetadata, Conversation, ErrorCode
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import Connection
from starlette.concurrency import run_in_threadpool

from .db import row, run
from .errors import ApiFailure, make_error, not_found
from .services import Services
from .settings import Settings

PENDING_ACCESS_PATH = "/api/v1/conversations/pending/audio"
AUDIO_SOURCE_WARNING = "Audio source not confirmed; evaluation uses the text only"
MAX_REDIRECTS = 3
SINGLE_RANGE = re.compile(r"^bytes=(\d+-\d*|-\d+)$")
ALLOWED_PREFIXES = ("audio/", "application/octet-stream")
CHUNK_BYTES = 64 * 1024


def _unavailable() -> ApiFailure:
    return ApiFailure(
        make_error(ErrorCode.AUDIO_UNAVAILABLE, "Audio is not available", retryable=True)
    )


def _host_allowed(url: str, hosts: frozenset[str]) -> bool:
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return False
    return (
        parts.scheme == "https"
        and parts.hostname is not None
        and parts.hostname.lower() in hosts
        and parts.username is None
        and parts.password is None
        and port in (None, 443)
    )


def initial_audio_metadata(
    settings: Settings, source_url: str | None
) -> tuple[AudioMetadata, list[str]]:
    """Access is never confirmed at import: an expired link does not prove absence."""
    if source_url is None:
        return AudioMetadata(availability="unavailable", alignment_status="unavailable"), []
    if _host_allowed(source_url, settings.audio_hosts):
        return (
            AudioMetadata(
                availability="unknown",
                access_path=PENDING_ACCESS_PATH,
                alignment_status="unverified",
            ),
            [],
        )
    return (
        AudioMetadata(availability="unknown", alignment_status="unverified"),
        [AUDIO_SOURCE_WARNING],
    )


def _default_resolver(host: str) -> list[str]:
    return [str(info[4][0]) for info in socket.getaddrinfo(host, 443)]


def _resolves_public(host: str, resolver: Callable[[str], list[str]]) -> bool:
    try:
        addresses = resolver(host)
    except OSError:
        return False
    if not addresses:
        return False
    try:
        return all(ipaddress.ip_address(address).is_global for address in addresses)
    except ValueError:
        return False


def _check_target(url: str, services: Services) -> None:
    if not _host_allowed(url, services.settings.audio_hosts):
        raise _unavailable()
    host = urlsplit(url).hostname
    resolver = services.host_resolver or _default_resolver
    if host is None or not _resolves_public(host, resolver):
        raise _unavailable()


def _set_state(
    conn: Connection,
    conversation_id: str,
    revision: int,
    source_url: str,
    availability: str,
    media_type: str | None,
) -> None:
    found = row(
        conn,
        "SELECT document_json, audio_source_url FROM conversation_revisions "
        "WHERE conversation_id = :id AND revision = :revision",
        {"id": conversation_id, "revision": revision},
    )
    if found is None or found["audio_source_url"] != source_url:
        # A reimport may replace the source while an older request is in flight.
        return
    document = Conversation.model_validate_json(found["document_json"])
    audio = document.audio.model_copy(
        update={"availability": availability, "media_type": media_type}
    )
    if availability == "available" and audio.access_path is None:
        # Repair metadata left by an older import after a source was added later.
        audio = audio.model_copy(
            update={
                "access_path": f"/api/v1/conversations/{conversation_id}/audio",
                "alignment_status": "unverified",
                "mapping": None,
                "content_hash": None,
            }
        )
    if audio == document.audio:
        return
    run(
        conn,
        "UPDATE conversation_revisions SET document_json = :document "
        "WHERE conversation_id = :id AND revision = :revision",
        {
            "document": document.model_copy(update={"audio": audio}).model_dump_json(),
            "id": conversation_id,
            "revision": revision,
        },
    )


def _resolve_source(
    services: Services, conversation_id: str, revision: int | None
) -> tuple[int, str | None]:
    with services.db.read() as conn:
        known = row(
            conn,
            "SELECT latest_revision FROM conversations WHERE id = :id",
            {"id": conversation_id},
        )
        if known is None:
            raise not_found("Conversation")
        selected = revision if revision is not None else int(known["latest_revision"])
        found = row(
            conn,
            "SELECT audio_source_url FROM conversation_revisions "
            "WHERE conversation_id = :id AND revision = :revision",
            {"id": conversation_id, "revision": selected},
        )
        if found is None:
            raise not_found("Conversation revision")
        return selected, found["audio_source_url"]


def _record_state(
    services: Services,
    conversation_id: str,
    revision: int,
    source_url: str,
    available: bool,
    media_type: str | None,
) -> None:
    with services.db.write() as conn:
        _set_state(
            conn,
            conversation_id,
            revision,
            source_url,
            "available" if available else "unknown",
            media_type if available else None,
        )


async def _open_upstream(
    client: httpx.AsyncClient, source_url: str, range_header: str | None, services: Services
) -> httpx.Response:
    headers = {"Range": range_header} if range_header else {}
    url = source_url
    for _ in range(MAX_REDIRECTS + 1):
        await run_in_threadpool(_check_target, url, services)
        request = client.build_request("GET", url, headers=headers)
        response = await client.send(request, stream=True)
        if not response.is_redirect:
            return response
        location = response.headers.get("location")
        await response.aclose()
        if location is None:
            raise _unavailable()
        url = urljoin(url, location)
    raise _unavailable()


async def stream_audio(
    services: Services,
    conversation_id: str,
    revision: int | None,
    range_header: str | None,
) -> Response:
    selected, source_url = await run_in_threadpool(
        _resolve_source, services, conversation_id, revision
    )
    if range_header is not None and not SINGLE_RANGE.match(range_header.strip()):
        raise ApiFailure(make_error(ErrorCode.VALIDATION_ERROR, "Invalid byte range"), status=416)
    if source_url is None:
        raise _unavailable()

    settings = services.settings
    client = httpx.AsyncClient(
        transport=services.audio_transport,
        timeout=settings.audio_timeout_seconds,
        follow_redirects=False,
    )
    upstream: httpx.Response | None = None
    try:
        try:
            upstream = await _open_upstream(client, source_url, range_header, services)
        except httpx.HTTPError as exc:
            raise _unavailable() from exc
        if upstream.status_code == 416:
            raise ApiFailure(
                make_error(ErrorCode.VALIDATION_ERROR, "Invalid byte range"), status=416
            )
        media_type = upstream.headers.get("content-type", "").split(";")[0].strip().lower()
        declared = upstream.headers.get("content-length")
        too_big = (
            declared is not None
            and declared.isdigit()
            and (int(declared) > settings.audio_max_bytes)
        )
        if (
            upstream.status_code not in (200, 206)
            or not media_type.startswith(ALLOWED_PREFIXES)
            or too_big
        ):
            raise _unavailable()
    except ApiFailure as failure:
        if upstream is not None:
            await upstream.aclose()
        await client.aclose()
        if failure.error.code == ErrorCode.AUDIO_UNAVAILABLE:
            await run_in_threadpool(
                _record_state, services, conversation_id, selected, source_url, False, None
            )
        raise
    await run_in_threadpool(
        _record_state, services, conversation_id, selected, source_url, True, media_type
    )

    assert upstream is not None
    opened = upstream

    async def body() -> AsyncIterator[bytes]:
        sent = 0
        try:
            async for chunk in opened.aiter_bytes(CHUNK_BYTES):
                sent += len(chunk)
                if sent > settings.audio_max_bytes:
                    # Aborting the stream is the only honest signal once headers are out.
                    raise RuntimeError("audio exceeded the configured limit")
                yield chunk
        finally:
            await opened.aclose()
            await client.aclose()

    headers = {"Accept-Ranges": "bytes", "Cache-Control": "no-store"}
    if declared is not None and declared.isdigit():
        headers["Content-Length"] = declared
    content_range = upstream.headers.get("content-range")
    if upstream.status_code == 206 and content_range is not None:
        headers["Content-Range"] = content_range
    return StreamingResponse(
        body(), status_code=upstream.status_code, media_type=media_type, headers=headers
    )
