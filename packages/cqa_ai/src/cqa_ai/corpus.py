"""Versioned knowledge sources: pinned SourceVersion/SourceChunk/CorpusSnapshot.

No crawler: sources are supplied as already-reviewed local texts with explicit
provenance (MASTER §11). Unknown dates stay null; nothing is declared current.
"""

import json
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Literal

from cqa_contracts.models import CorpusSnapshot, SourceChunk, SourceVersion
from cqa_domain import corpus_snapshot_hash, text_hash

DEFAULT_CHUNK_CHARS = 1200


@dataclass(frozen=True)
class SourceDocument:
    source_id: str
    version: str
    provenance: Literal["organizer", "official_public", "synthetic"]
    title: str
    text: str
    retrieved_at: datetime
    safe_url: str | None = None
    legal_entity: str | None = None
    product: str | None = None
    published_at: date | None = None
    effective_from: date | None = None
    effective_until: date | None = None


def chunk_text(text: str, max_chars: int = DEFAULT_CHUNK_CHARS) -> list[str]:
    """Split on blank lines, packing paragraphs up to max_chars; text is not rewritten."""
    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        pieces = [paragraph[i : i + max_chars] for i in range(0, len(paragraph), max_chars)]
        for piece in pieces:
            if current and len(current) + 2 + len(piece) > max_chars:
                chunks.append(current)
                current = piece
            else:
                current = f"{current}\n\n{piece}" if current else piece
    if current:
        chunks.append(current)
    return chunks


def build_source(
    document: SourceDocument, max_chars: int = DEFAULT_CHUNK_CHARS
) -> tuple[SourceVersion, list[SourceChunk]]:
    source = SourceVersion(
        source_id=document.source_id,
        version=document.version,
        content_hash=text_hash(document.text),
        provenance=document.provenance,
        title=document.title,
        safe_url=document.safe_url,
        legal_entity=document.legal_entity,
        product=document.product,
        published_at=document.published_at,
        effective_from=document.effective_from,
        effective_until=document.effective_until,
        retrieved_at=document.retrieved_at,
    )
    chunks = [
        SourceChunk(
            chunk_id=f"{document.source_id}@{document.version}#{n:03d}",
            source_id=document.source_id,
            source_version=document.version,
            text=piece,
            content_hash=text_hash(piece),
            locator=f"part {n}",
        )
        for n, piece in enumerate(chunk_text(document.text, max_chars), start=1)
    ]
    return source, chunks


def build_corpus_snapshot(
    snapshot_id: str,
    documents: list[SourceDocument],
    *,
    applicability_policy: str,
    priority_policy: str,
    max_chars: int = DEFAULT_CHUNK_CHARS,
) -> CorpusSnapshot:
    sources: list[SourceVersion] = []
    chunks: list[SourceChunk] = []
    for document in documents:
        source, parts = build_source(document, max_chars)
        sources.append(source)
        chunks.extend(parts)
    draft = CorpusSnapshot(
        id=snapshot_id,
        content_hash="0" * 64,
        sources=sources,
        chunks=chunks,
        applicability_policy=applicability_policy,
        priority_policy=priority_policy,
    )
    return draft.model_copy(update={"content_hash": corpus_snapshot_hash(draft)})


def empty_corpus(snapshot_id: str = "empty-corpus") -> CorpusSnapshot:
    return build_corpus_snapshot(
        snapshot_id,
        [],
        applicability_policy="No knowledge sources; factual checks are limited.",
        priority_policy="No sources.",
    )


def load_corpus_manifest(path: Path) -> CorpusSnapshot:
    """Build a snapshot from a local manifest (JSON) whose texts live next to it.

    Manifest: {"id", "applicability_policy", "priority_policy", "documents": [
    {"source_id", "version", "provenance", "title", "text_file", "retrieved_at",
    "safe_url"?, "legal_entity"?, "product"?, "published_at"?, ...}]}. Private
    material belongs under data/private/, never in Git.
    """
    data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    documents = []
    for item in data["documents"]:
        text = (path.parent / item["text_file"]).read_text(encoding="utf-8")
        documents.append(
            SourceDocument(
                source_id=item["source_id"],
                version=item["version"],
                provenance=item["provenance"],
                title=item["title"],
                text=text,
                retrieved_at=datetime.fromisoformat(item["retrieved_at"]),
                safe_url=item.get("safe_url"),
                legal_entity=item.get("legal_entity"),
                product=item.get("product"),
                published_at=_date(item.get("published_at")),
                effective_from=_date(item.get("effective_from")),
                effective_until=_date(item.get("effective_until")),
            )
        )
    return build_corpus_snapshot(
        data["id"],
        documents,
        applicability_policy=data["applicability_policy"],
        priority_policy=data["priority_policy"],
    )


def _date(value: str | None) -> date | None:
    return None if value is None else date.fromisoformat(value)
