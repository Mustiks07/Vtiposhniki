"""Private adapter from the organizer payload to the portable import representation.

The secret dataset URL is server configuration; the client supplies only group_id.
Nothing from the upstream response or URL reaches an error message or a log.

ASSUMPTION (docs/handoffs/claude-b.md, request R-2): the repository documents only
isSuccess/data.records, the "agent chat"/"voice call" values and audio_url. Record
field names below are aliases, not a verified organizer schema. Unknown values fail
the whole import with an indexed error instead of being guessed.
"""

import json
from collections.abc import Mapping
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
from cqa_contracts.http_models import ImportMessage, ImportRecord
from cqa_contracts.models import ErrorCode, ErrorDetail
from pydantic import ValidationError

from .errors import ApiFailure, make_error, too_large, validation_failure
from .importing import SourceRecord
from .settings import Settings

CHANNELS = {
    "agent chat": "agent_chat",
    "agent_chat": "agent_chat",
    "voice call": "voice_call",
    "voice_call": "voice_call",
}
LANGUAGES = {"ru": "RU", "kz": "KZ", "en": "EN"}
SPEAKERS = {"client", "operator", "bot", "system"}

ID_FIELDS = ("external_id", "id", "record_id", "conversation_id")
CHANNEL_FIELDS = ("channel", "type", "record_type")
LANGUAGE_FIELDS = ("language", "lang")
MESSAGE_FIELDS = ("messages", "transcript", "dialog")
OCCURRED_FIELDS = ("occurred_at", "started_at")
SPEAKER_FIELDS = ("speaker", "role")
TEXT_FIELDS = ("text", "message", "content")
TIME_FIELDS = ("timestamp_original", "timestamp", "time")


def _first(record: Mapping[str, Any], names: tuple[str, ...]) -> Any:
    for name in names:
        if name in record and record[name] is not None:
            return record[name]
    return None


def _dataset_url(settings: Settings, group_id: str) -> str:
    if settings.dataset_url is None:
        raise ApiFailure(
            make_error(ErrorCode.CONFIGURATION_ERROR, "Organizer dataset is not configured")
        )
    template = settings.dataset_url.get_secret_value()
    if "{group_id}" in template:
        return template.replace("{group_id}", group_id)
    parts = urlsplit(template)
    query = [*parse_qsl(parts.query, keep_blank_values=True), ("group_id", group_id)]
    return urlunsplit(parts._replace(query=urlencode(query)))


def _upstream_failure(message: str, *, retryable: bool) -> ApiFailure:
    return ApiFailure(make_error(ErrorCode.PROVIDER_ERROR, message, retryable=retryable))


def fetch_organizer_payload(
    settings: Settings, group_id: str, transport: httpx.BaseTransport | None
) -> bytes:
    url = _dataset_url(settings, group_id)
    limit = settings.import_max_bytes
    try:
        with httpx.Client(
            transport=transport,
            timeout=settings.organizer_timeout_seconds,
            follow_redirects=False,
        ) as client:
            with client.stream("GET", url) as response:
                if response.status_code == 429:
                    raise ApiFailure(
                        make_error(
                            ErrorCode.PROVIDER_ERROR,
                            "Organizer API rate limit reached",
                            retryable=True,
                        ),
                        status=429,
                    )
                if response.status_code != 200:
                    raise _upstream_failure(
                        "Organizer API rejected the request",
                        retryable=response.status_code >= 500,
                    )
                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > limit:
                        raise too_large("Organizer payload exceeds the configured limit")
                return bytes(body)
    except httpx.TimeoutException as exc:
        raise ApiFailure(
            make_error(ErrorCode.TIMEOUT, "Organizer API timed out", retryable=True)
        ) from exc
    except httpx.HTTPError as exc:
        raise _upstream_failure("Organizer API is unreachable", retryable=True) from exc


def _invalid_shape(message: str) -> ApiFailure:
    return _upstream_failure(message, retryable=False)


def _adapt_record(index: int, record: Any, details: list[ErrorDetail]) -> SourceRecord | None:
    def problem(field: str, reason: Any = "invalid") -> None:
        details.append(ErrorDetail(index=index, field=field, reason=reason))

    if not isinstance(record, dict):
        problem("record")
        return None
    channel = CHANNELS.get(str(_first(record, CHANNEL_FIELDS)).strip().lower())
    language = LANGUAGES.get(str(_first(record, LANGUAGE_FIELDS)).strip().lower())
    external_id = _first(record, ID_FIELDS)
    messages = _first(record, MESSAGE_FIELDS)
    before = len(details)
    if channel is None:
        problem("channel", "unsupported")
    if language is None:
        problem("language", "unsupported")
    if external_id is None or external_id == "":
        problem("external_id", "missing")
    if not isinstance(messages, list) or not messages:
        problem("messages", "missing")
    if len(details) > before:
        return None

    adapted: list[ImportMessage] = []
    for position, message in enumerate(messages):
        speaker = _first(message, SPEAKER_FIELDS) if isinstance(message, dict) else None
        text = _first(message, TEXT_FIELDS) if isinstance(message, dict) else None
        moment = _first(message, TIME_FIELDS) if isinstance(message, dict) else None
        normalized = speaker.strip().lower() if isinstance(speaker, str) else None
        if normalized not in SPEAKERS:
            problem(f"messages.{position}.speaker", "unsupported")
            continue
        if not isinstance(text, str):
            problem(f"messages.{position}.text", "missing")
            continue
        adapted.append(
            ImportMessage(
                speaker=normalized,  # type: ignore[arg-type]  # membership checked above
                text=text,
                timestamp_original="" if moment is None else str(moment),
            )
        )
    if len(details) > before:
        return None
    try:
        import_record = ImportRecord.model_validate(
            {
                "external_id": str(external_id),
                "channel": channel,
                "language": language,
                "messages": adapted,
                "occurred_at": _first(record, OCCURRED_FIELDS),
            }
        )
    except ValidationError as exc:
        for error in exc.errors():
            problem(".".join(str(part) for part in error["loc"]))
        return None
    audio_url = record.get("audio_url")
    return SourceRecord(
        index=index,
        record=import_record,
        raw_json=json.dumps(record, ensure_ascii=False, sort_keys=True),
        audio_url=audio_url if isinstance(audio_url, str) and audio_url else None,
    )


def adapt_organizer_payload(body: bytes, max_records: int) -> list[SourceRecord]:
    try:
        payload = json.loads(body)
    except (ValueError, UnicodeDecodeError) as exc:
        raise _invalid_shape("Organizer API returned malformed JSON") from exc
    if not isinstance(payload, dict) or payload.get("isSuccess") is not True:
        raise _invalid_shape("Organizer API reported an unsuccessful response")
    data = payload.get("data")
    records = data.get("records") if isinstance(data, dict) else None
    if not isinstance(records, list):
        raise _invalid_shape("Organizer API response has no record list")
    if not records:
        raise validation_failure(
            "Organizer API returned no records", [ErrorDetail(field="records", reason="missing")]
        )
    if len(records) > max_records:
        raise too_large("Organizer payload has more records than the configured limit")
    details: list[ErrorDetail] = []
    adapted = [_adapt_record(index, record, details) for index, record in enumerate(records)]
    if details:
        raise validation_failure("Organizer payload contains invalid records", details)
    return [item for item in adapted if item is not None]
