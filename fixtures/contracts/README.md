# Synthetic contract fixtures

Every example in this directory is invented. These are typed wire examples for
independent development, not real conversations, predictions, or acceptance of
the domain arithmetic. `manifest.json` maps each fixture file to its canonical
Pydantic class in `cqa_contracts.models` or `cqa_contracts.http_models`.

Regenerate with `python scripts/build_fixtures.py` after installing the workspace.
All generated JSON files are validated before writing. To compare without
overwriting, use `python scripts/build_fixtures.py --output <temporary-directory>`.

The rubric is a custom three-criterion binary/scale/flag example; the original
eight-criterion rubric remains Claude A's implementation. Score summaries are
handwritten illustrative constants, not an alternative scoring function.
Hash-shaped values are explicit placeholders, not canonical hash vectors or
claims about the fixture contents; use the separately documented hash vectors
when implementing domain hashing.

Scenarios cover complete, legal N/A, missing action with a checked range,
partial/all-undetermined, failed/retry/pending jobs, confirmed/changed decisions,
human completion of a partial automatic result, unavailable/unverified audio,
an unfamiliar reverse-scale criterion, pinned synthetic source fragments, and
an unfinished optional reviewer which preserves valid initial proposals.
Audio fixtures contain no recordings or invented seek mapping. Test calls have
unknown usage/cost, not a claim that an actual provider call was free.

`safe-export-*.json` demonstrate an allowlist DTO that retains failed/pending
items and reason codes while excluding free text, transcript, source text,
signed URLs, and credentials. `PRIVATE_TEXT_SENTINEL` is an intentionally
synthetic marker in local-only appeal/decision fields used to detect accidental
copying into export examples.

`SyntheticEvaluator` is available only with explicit app mode and profile mode
`test`. Fixtures are never a production fallback. Foundation validation checks
schema/shape and declared scenarios; it does not validate business references,
compute canonical hashes, run the official rubric, or measure AI quality.
