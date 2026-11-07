"""Atomic import: validate the entire payload first, then one short transaction."""

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import uuid4

from cqa_contracts.http_models import ImportedRevision, ImportRecord, ImportResult
from cqa_contracts.models import (
    AudioMetadata,
    Conversation,
    ErrorDetail,
    Message,
)
from sqlalchemy import Connection

from .audio import AUDIO_SOURCE_WARNING, initial_audio_metadata
from .db import row, run, to_wire_time
from .errors import validation_failure
from .services import Services

RELATIVE_TIME = re.compile(r"^\d{1,4}:[0-5]\d(:[0-5]\d)?$")
ZERO_HASH = "0" * 64


@dataclass(frozen=True)
class SourceRecord:
    index: int
    record: ImportRecord
    raw_json: str
    audio_url: str | None = None


@dataclass(frozen=True)
class NormalizedRecord:
    conversation: Conversation  # id/revision are assigned during persistence
    audio_url: str | None
    sources: list[SourceRecord]


def parse_timestamp(original: str) -> tuple[datetime | None, bool]:
    """Return (parsed_time, understood). MM:SS is valid but has no calendar date."""
    if RELATIVE_TIME.match(original):
        return None, True
    try:
        parsed = datetime.fromisoformat(original)
    except ValueError:
        return None, False
    # A time without an offset would need an invented time zone.
    return (parsed, True) if parsed.tzinfo is not None else (None, False)


def normalize(services: Services, source: SourceRecord) -> Conversation:
    record = source.record
    messages: list[Message] = []
    warnings: list[str] = []
    for position, message in enumerate(record.messages):
        message_id = f"m{position + 1:04d}"
        parsed, understood = parse_timestamp(message.timestamp_original)
        if message.timestamp_original.strip() and not understood:
            warnings.append(f"{message_id}: source time not parsed; original preserved")
        messages.append(
            Message(
                id=message_id,
                ordinal=position + 1,
                speaker=message.speaker,
                text=message.text,
                timestamp_original=message.timestamp_original,
                parsed_time=parsed,
                source_index=position,
            )
        )
    audio, audio_warnings = initial_audio_metadata(services.settings, source.audio_url)
    warnings.extend(audio_warnings)
    pending = Conversation(
        id="pending",
        external_id=record.external_id,
        revision=1,
        content_hash=ZERO_HASH,
        channel=record.channel,
        language=record.language,
        messages=messages,
        occurred_at=record.occurred_at,
        audio=audio,
        warnings=warnings,
    )
    return pending.model_copy(
        update={"content_hash": services.domain.conversation_content_hash(pending)}
    )


def normalize_payload(services: Services, sources: list[SourceRecord]) -> list[NormalizedRecord]:
    details: list[ErrorDetail] = []
    by_external_id: dict[str, NormalizedRecord] = {}
    for source in sources:
        conversation = normalize(services, source)
        known = by_external_id.get(source.record.external_id)
        if known is None:
            by_external_id[source.record.external_id] = NormalizedRecord(
                conversation, source.audio_url, [source]
            )
        elif known.conversation.content_hash != conversation.content_hash:
            details.append(
                ErrorDetail(index=source.index, field="external_id", reason="conflicting_duplicate")
            )
        else:
            known.sources.append(source)
    if details:
        raise validation_failure("Payload has conflicting records for one external ID", details)
    return list(by_external_id.values())


def _with_identity(conversation: Conversation, conversation_id: str, revision: int) -> Conversation:
    audio: AudioMetadata = conversation.audio
    if audio.access_path is not None:
        audio = audio.model_copy(
            update={"access_path": f"/api/v1/conversations/{conversation_id}/audio"}
        )
    return conversation.model_copy(
        update={"id": conversation_id, "revision": revision, "audio": audio}
    )


def _store(
    conn: Connection, services: Services, item: NormalizedRecord
) -> tuple[str, int, Literal["created", "new_revision", "unchanged"]]:
    now = to_wire_time(services.clock())
    external_id = item.conversation.external_id
    existing = row(
        conn,
        "SELECT id, latest_revision FROM conversations WHERE external_id = :external_id",
        {"external_id": external_id},
    )
    if existing is None:
        conversation_id, revision = f"conv_{uuid4().hex}", 1
        disposition: Literal["created", "new_revision", "unchanged"] = "created"
        run(
            conn,
            "INSERT INTO conversations (id, external_id, latest_revision, created_at) "
            "VALUES (:id, :external_id, 1, :now)",
            {"id": conversation_id, "external_id": external_id, "now": now},
        )
    else:
        conversation_id = str(existing["id"])
        latest = int(existing["latest_revision"])
        current = row(
            conn,
            "SELECT content_hash, document_json, audio_source_url FROM conversation_revisions "
            "WHERE conversation_id = :id AND revision = :revision",
            {"id": conversation_id, "revision": latest},
        )
        if current is not None and current["content_hash"] == item.conversation.content_hash:
            if item.audio_url is not None:
                document = Conversation.model_validate_json(current["document_json"])
                if (
                    current["audio_source_url"] != item.audio_url
                    or document.audio.access_path is None
                ):
                    # A new/rotated source is not a text revision. Its availability and
                    # alignment must be confirmed again; never retain the old recording's map.
                    audio, audio_warnings = initial_audio_metadata(
                        services.settings, item.audio_url
                    )
                    refreshed = document.model_copy(
                        update={
                            "audio": audio,
                            "warnings": [
                                *[w for w in document.warnings if w != AUDIO_SOURCE_WARNING],
                                *audio_warnings,
                            ],
                        }
                    )
                    document = _with_identity(refreshed, conversation_id, latest)
                run(
                    conn,
                    "UPDATE conversation_revisions SET audio_source_url = :url, "
                    "document_json = :document "
                    "WHERE conversation_id = :id AND revision = :revision",
                    {
                        "url": item.audio_url,
                        "document": document.model_dump_json(),
                        "id": conversation_id,
                        "revision": latest,
                    },
                )
            return conversation_id, latest, "unchanged"
        revision, disposition = latest + 1, "new_revision"
        run(
            conn,
            "UPDATE conversations SET latest_revision = :revision WHERE id = :id",
            {"revision": revision, "id": conversation_id},
        )
    document = _with_identity(item.conversation, conversation_id, revision)
    run(
        conn,
        "INSERT INTO conversation_revisions (conversation_id, revision, content_hash, channel, "
        "language, document_json, audio_source_url, created_at) VALUES (:id, :revision, :hash, "
        ":channel, :language, :document, :url, :now)",
        {
            "id": conversation_id,
            "revision": revision,
            "hash": document.content_hash,
            "channel": document.channel,
            "language": document.language,
            "document": document.model_dump_json(),
            "url": item.audio_url,
            "now": now,
        },
    )
    return conversation_id, revision, disposition


def persist_import(
    services: Services,
    items: list[NormalizedRecord],
    *,
    source: Literal["json", "organizer_api"],
    group_id: str | None,
    received_count: int,
) -> ImportResult:
    import_id = f"imp_{uuid4().hex}"
    results: list[ImportedRevision] = []
    with services.db.write() as conn:
        run(
            conn,
            "INSERT INTO import_runs (id, source, group_id, received_count, created_at) "
            "VALUES (:id, :source, :group_id, :count, :now)",
            {
                "id": import_id,
                "source": source,
                "group_id": group_id,
                "count": received_count,
                "now": to_wire_time(services.clock()),
            },
        )
        for item in items:
            conversation_id, revision, disposition = _store(conn, services, item)
            for origin in item.sources:
                run(
                    conn,
                    "INSERT INTO raw_import_records (import_id, source_index, external_id, "
                    "raw_json, conversation_id, revision) VALUES (:import_id, :index, "
                    ":external_id, :raw, :conversation_id, :revision)",
                    {
                        "import_id": import_id,
                        "index": origin.index,
                        "external_id": origin.record.external_id,
                        "raw": origin.raw_json,
                        "conversation_id": conversation_id,
                        "revision": revision,
                    },
                )
            results.append(
                ImportedRevision(
                    conversation_id=conversation_id,
                    revision=revision,
                    disposition=disposition,
                    source_indices=[origin.index for origin in item.sources],
                )
            )
    return ImportResult(
        items=results,
        received_count=received_count,
        deduplicated_count=received_count - len(items),
    )


def import_sources(
    services: Services,
    sources: list[SourceRecord],
    *,
    source: Literal["json", "organizer_api"],
    group_id: str | None = None,
) -> ImportResult:
    items = normalize_payload(services, sources)
    return persist_import(
        services, items, source=source, group_id=group_id, received_count=len(sources)
    )
