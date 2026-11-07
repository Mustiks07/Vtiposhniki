import json
from pathlib import Path

import pytest
from _cqa_ai_helpers import NOW, conversation, corpus
from cqa_ai.corpus import SourceDocument, build_corpus_snapshot, chunk_text, load_corpus_manifest
from cqa_ai.retrieval import RetrievalPolicy, retrieve
from cqa_contracts.interfaces import DomainValidationError
from cqa_domain import corpus_snapshot_hash, text_hash, validate_corpus


def test_chunking_preserves_text_and_bounds_size() -> None:
    text = "Первый абзац.\n\n" + ("x" * 2500) + "\n\nПоследний абзац."
    chunks = chunk_text(text, max_chars=1000)
    assert all(len(c) <= 1000 for c in chunks)
    assert "".join(chunks).replace("\n\n", "") == text.replace("\n\n", "")


def test_snapshot_hashes_are_consistent_and_tamper_evident() -> None:
    snapshot = corpus()
    validate_corpus(snapshot)
    assert snapshot.content_hash == corpus_snapshot_hash(snapshot)
    chunk = snapshot.chunks[0]
    assert chunk.content_hash == text_hash(chunk.text)
    tampered = snapshot.model_copy(
        update={"chunks": [chunk.model_copy(update={"text": chunk.text + " (изменено)"})]}
    )
    with pytest.raises(DomainValidationError):
        validate_corpus(tampered)


def test_unknown_dates_stay_null_and_version_change_changes_hash() -> None:
    snapshot = corpus()
    assert snapshot.sources[0].published_at is None
    assert snapshot.sources[0].effective_from is None
    newer = build_corpus_snapshot(
        "synthetic-corpus",
        [
            SourceDocument(
                "synthetic-faq",
                "v2",
                "synthetic",
                "Вымышленная справка",
                "Новая редакция текста.",
                NOW,
            )
        ],
        applicability_policy="Synthetic test corpus only.",
        priority_policy="Single synthetic source.",
    )
    assert newer.content_hash != snapshot.content_hash


def test_retrieval_is_deterministic_and_bounded() -> None:
    conv = conversation()
    first = retrieve(conv, corpus())
    assert first == retrieve(conv, corpus())
    assert first and first[0].chunk.chunk_id.startswith("synthetic-faq@v1#")
    assert retrieve(conv, corpus(), RetrievalPolicy(max_chunks=0)) == []
    assert retrieve(conv, corpus(with_source=False)) == []


def test_manifest_loader(tmp_path: Path) -> None:
    (tmp_path / "doc.txt").write_text("Синтетический текст источника.", encoding="utf-8")
    manifest = {
        "id": "local-corpus",
        "applicability_policy": "Synthetic.",
        "priority_policy": "Synthetic.",
        "documents": [
            {
                "source_id": "s1",
                "version": "2026-11",
                "provenance": "synthetic",
                "title": "Doc",
                "text_file": "doc.txt",
                "retrieved_at": "2026-11-07T00:00:00+00:00",
                "safe_url": "https://example.com/doc",
            }
        ],
    }
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")
    snapshot = load_corpus_manifest(path)
    validate_corpus(snapshot)
    assert snapshot.sources[0].safe_url == "https://example.com/doc"
