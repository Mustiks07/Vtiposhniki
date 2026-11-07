"""Bounded lexical retrieval over a pinned corpus snapshot (no vector DB, no web).

Deterministic: token-overlap score between conversation text and chunk text,
ties broken by chunk_id. Source text is untrusted data, never instructions.

Date applicability: when the conversation date is known, a source version whose
effective period excludes that date is not offered at all. Unknown dates are
never invented: such sources stay available but are labelled so the evaluator
cannot treat them as proven current (MASTER §11).
"""

import re
from dataclasses import dataclass
from datetime import date
from typing import Literal

from cqa_contracts.models import Conversation, CorpusSnapshot, SourceChunk, SourceVersion

_WORD = re.compile(r"\w{3,}", re.UNICODE)


@dataclass(frozen=True)
class RetrievalPolicy:
    max_chunks: int = 6
    max_chars: int = 8000
    min_overlap: int = 2


DateStatus = Literal["in_effect", "conversation_date_unknown", "effective_period_unknown"]


@dataclass(frozen=True)
class RetrievedChunk:
    chunk: SourceChunk
    source: SourceVersion
    overlap: int
    date_status: DateStatus = "effective_period_unknown"


def conversation_day(conversation: Conversation) -> date | None:
    """Known calendar date in the conversation's own offset; None when unknown."""
    return None if conversation.occurred_at is None else conversation.occurred_at.date()


def date_status(source: SourceVersion, day: date | None) -> DateStatus | None:
    """None means the source version was not in effect on the conversation date."""
    if source.effective_from is None and source.effective_until is None:
        return "effective_period_unknown"
    if day is None:
        return "conversation_date_unknown"
    if source.effective_from is not None and day < source.effective_from:
        return None
    if source.effective_until is not None and day > source.effective_until:
        return None
    return "in_effect"


def sources_not_in_effect(
    conversation: Conversation, corpus: CorpusSnapshot
) -> list[tuple[str, str]]:
    day = conversation_day(conversation)
    return sorted((s.source_id, s.version) for s in corpus.sources if date_status(s, day) is None)


def _terms(text: str) -> set[str]:
    return {w.casefold() for w in _WORD.findall(text)}


def retrieve(
    conversation: Conversation,
    corpus: CorpusSnapshot,
    policy: RetrievalPolicy | None = None,
) -> list[RetrievedChunk]:
    policy = policy or RetrievalPolicy()
    day = conversation_day(conversation)
    sources = {(s.source_id, s.version): s for s in corpus.sources}
    query = _terms(" ".join(m.text for m in conversation.messages if m.speaker == "client"))
    query |= _terms(" ".join(m.text for m in conversation.messages if m.speaker == "operator"))
    scored: list[tuple[int, str, SourceChunk]] = []
    for chunk in corpus.chunks:
        overlap = len(query & _terms(chunk.text))
        if overlap >= policy.min_overlap:
            scored.append((-overlap, chunk.chunk_id, chunk))
    scored.sort()
    result: list[RetrievedChunk] = []
    used = 0
    for negative, _, chunk in scored:
        source = sources.get((chunk.source_id, chunk.source_version))
        if source is None:
            continue
        status = date_status(source, day)
        if status is None:
            continue  # not in effect on the known conversation date
        if len(result) >= policy.max_chunks or used + len(chunk.text) > policy.max_chars:
            break
        result.append(
            RetrievedChunk(chunk=chunk, source=source, overlap=-negative, date_status=status)
        )
        used += len(chunk.text)
    return result
