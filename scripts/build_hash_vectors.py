"""Build static foundation vectors; NOT a runtime domain hash implementation.

Projection dictionaries are explicitly constructed fixture expectations. Claude A
must independently implement the projection helpers against these expected bytes.
"""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    return json.loads((ROOT / "fixtures/contracts" / f"{name}.json").read_text(encoding="utf-8"))


def main():
    conversation = load("conversation-chat")
    checklist = load("checklist-custom")
    content = {
        "schema_version": "1.0",
        "channel": conversation["channel"],
        "language": conversation["language"],
        "occurred_at": conversation["occurred_at"],
        "messages": [
            {key: m[key] for key in ("schema_version", "speaker", "text", "timestamp_original")}
            for m in conversation["messages"]
        ],
    }
    semantic = {"schema_version": "1.0", "criteria": []}
    scoring = {
        "schema_version": "1.0",
        "criteria": [],
        "sections": sorted(checklist["sections"], key=lambda s: s["id"]),
        "rounding": checklist["rounding"],
    }
    for c in sorted(checklist["criteria"], key=lambda c: c["id"]):
        semantic["criteria"].append(
            {
                key: c[key]
                for key in (
                    "schema_version",
                    "id",
                    "title",
                    "definition",
                    "response_type",
                    "allow_na",
                    "na_condition",
                    "channel_instructions",
                    "evidence_policy",
                    "requires_reference",
                    "flag_when_choice_ids",
                )
            }
            | {
                "choices": [
                    {
                        key: choice[key]
                        for key in ("schema_version", "id", "label", "raw_value", "anchor")
                    }
                    for choice in sorted(c["choices"], key=lambda choice: choice["id"])
                ]
            }
        )
        scoring["criteria"].append(
            {key: c[key] for key in ("schema_version", "id", "weight", "section_id")}
            | {
                "choices": [
                    {key: choice[key] for key in ("schema_version", "id", "score_fraction")}
                    for choice in sorted(c["choices"], key=lambda choice: choice["id"])
                ]
            }
        )
    identity = load("artifact-complete")["identity"]
    profile = load("profile-test")
    corpus = load("corpus-synthetic")
    corpus_projection = {key: value for key, value in corpus.items() if key != "content_hash"}
    corpus_projection["sources"] = sorted(
        corpus["sources"], key=lambda s: (s["source_id"], s["version"])
    )
    corpus_projection["chunks"] = sorted(corpus["chunks"], key=lambda c: c["chunk_id"])
    vectors = []
    for kind, source, projection in [
        ("content", conversation, content),
        ("semantic", checklist, semantic),
        ("scoring", checklist, scoring),
        ("profile", profile, profile),
        ("corpus", corpus, corpus_projection),
        ("reuse", identity, identity),
    ]:
        canonical = json.dumps(
            projection, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False
        )
        vectors.append(
            {
                "kind": kind,
                "input": source,
                "projection": projection,
                "canonical_json": canonical,
                "sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
            }
        )
    output = ROOT / "fixtures/hashing"
    output.mkdir(parents=True, exist_ok=True)
    (output / "vectors.json").write_text(
        json.dumps(
            {"schema_version": "1.0", "synthetic": True, "vectors": vectors},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    main()
