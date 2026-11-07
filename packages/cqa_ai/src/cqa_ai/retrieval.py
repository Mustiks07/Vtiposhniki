"""Bounded lexical retrieval over a pinned corpus snapshot (no vector DB, no web).

Deterministic: token-overlap score between conversation text and chunk text,
ties broken by chunk_id. Source text is untrusted data, never instructions.
"""

import re
from dataclasses import dataclass

from cqa_contracts.models import Conversation, CorpusSnapshot, SourceChunk, SourceVersion

_WORD = re.compile(r"\w{3,}", re.UNICODE)


@dataclass(frozen=True)
class RetrievalPolicy:
    max_chunks: int = 6
    max_chars: int = 8000
    min_overlap: int = 2


@dataclass(frozen=True)
class RetrievedChunk:
    chunk: SourceChunk
    source: SourceVersion
    overlap: int


def _terms(text: str) -> set[str]:
    return {w.casefold() for w in _WORD.findall(text)}


def retrieve(
    conversation: Conversation,
    corpus: CorpusSnapshot,
    policy: RetrievalPolicy | None = None,
) -> list[RetrievedChunk]:
    policy = policy or RetrievalPolicy()
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
        if len(result) >= policy.max_chunks or used + len(chunk.text) > policy.max_chars:
            break
        result.append(RetrievedChunk(chunk=chunk, source=source, overlap=-negative))
        used += len(chunk.text)
    return result
