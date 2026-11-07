# Shared implementation decisions

HTTP contract 1.1.0 adds the scoped flag query and optional `flag_summary` documented
in [FLAG_FILTER_CONTRACT.md](FLAG_FILTER_CONTRACT.md). Domain DTO schema_version stays
1.0. The original decisions below continue to apply. The organizer/user clarification
is preserved in [spec 05](specs/05_ORGANIZER_ADDENDUM.md).

Pydantic models in `cqa_contracts` are the only type definitions. `operations.py`
is the HTTP operation contract; generated JSON Schema/OpenAPI/TS are checked for
drift. All nested DTOs carry schema_version=1.0; unknown fields are rejected.
Decimal wire values are finite strings. Raw scale values may be JSON bool/number/string.
Server timestamps are UTC ISO 8601; source timestamps and text are preserved.
JSON Schema handles field shapes; Pydantic additionally checks local invariants.
Cross-object business validity is the responsibility of A's `validate_*` functions.

## Operations and error policy

All 23 operations live under /api/v1. Stable operation IDs, request/response models,
status codes and parameters are in generated OpenAPI. Pagination: limit=50,
1..200, offset>=0; total is the number of matching records. Conversation read/audio
accept optional revision; absent means latest. Evaluation references remain pinned.
Batch creation uses required `Idempotency-Key` header; first call and identical
replay return 202, differing payload returns 409. Revision/open-appeal/state
conflicts return 409. Create import/checklist/version/appeal returns 201; decision
returns 200; retry returns 202. Invalid payload returns safe APIError 422, oversize
413, missing object 404, absent provider config 503. Business placeholders return 501.
Errors never echo request input or provider responses. B must apply these mappings.

Portable JSON import is JSONImport (`source=json`, `records`), not an undocumented
copy of organizer payload. It preserves roles/text/timestamps; normalized message
IDs/revisions/hashes are assigned by B. OrganizerImport accepts only group_id; B
privately adapts organizer `isSuccess/data.records` into this representation and
retains the original privately. No arbitrary URL field is accepted from the UI.
Default payload limit: 10 MiB and 1000 records; whole-payload atomicity, duplicate
handling and safe indexed errors follow MASTER. Audio import is through organizer
metadata, not a user-supplied proxy URL.

Audio endpoint streams verified bytes (200/206, Range supported by B), 416 for
invalid range, 503/audio_unavailable when access is unavailable. No external
redirect is required or allowed to expose a signed URL. When playing a historical
evaluation, C appends `?revision=<pinned conversation_revision>` to access_path;
without that parameter the route resolves the latest revision. Audio mapping is nullable
and only exists with verified alignment. Media type is actual content type;
OpenAPI audio/mpeg documents the base binary response, not an MP3-only restriction.

Export JSON is SafeExport, never EvaluationView. CSV is a flattening of the same
DTO: one row per criterion, plus a row with empty criterion fields for pending/
failed/no-proposal items. Columns in order: schema_version,scope,batch_id,job_id,
evaluation_id,conversation_id,conversation_revision,checklist_version_id,profile_id,
profile_version,corpus_snapshot_id,evaluation_revision,job_state,evaluation_status,
score_status,total_score,criterion_id,applicability,answer_choice_id,origin,
reason_codes,evidence,score_fraction,earned_weight,applicable_weight,
normalized_contribution,flag_detected,decisions,error_code,limitation_codes,cost,
cost_complete,currency. Arrays are compact JSON inside quoted CSV cells. Empty
nullable cells stay empty; UTF-8, RFC4180 quoting, CRLF rows; cells beginning with
=,+,-,@,tab,CR are prefixed with apostrophe to prevent spreadsheet formulas.
Free text, external_id, source fragments, transcripts and URLs are excluded.
This is the team's format, not a claimed organizer format.

## Hash projections (implementation belongs to A)

Shapes are in hash_inputs.py and EvaluationIdentity. Static fixture vectors are
in fixtures/hashing/vectors.json; scripts/build_hash_vectors.py only builds these
expectations and is not imported by production packages. A supplies the single
runtime projection/hash implementation. SHA-256 over UTF-8 JSON: ensure_ascii=False,
sorted object keys, separators=(',', ':'), no nonfinite values. Include defaults
and nulls from schema; schema_version participates. Decimal strings canonicalize
to fixed notation without insignificant trailing zeros, zero as "0". Text is not
Unicode-normalized or trimmed; timestamp_original is not parsed/reformatted.

- Content: channel, language, occurred_at and ordered messages containing speaker,
  text, timestamp_original. Exclude IDs, ordinal/source_index, parsed_time, warnings,
  external_id, revision and audio URL. No dates are invented. Known occurred_at
  uses its DTO ISO representation. Message list order is significant.
- Semantic: criteria sorted by id, choices sorted by id; all SemanticCriterion
  fields (including titles, definitions, labels, anchors, raw values, channel/N/A/
  evidence/reference/flag policies). flag_when_choice_ids sorted. Exclude weights,
  fractions, sections and display order; checklist title is display-only.
- Scoring: criteria/choices/sections sorted by stable id, weights, score_fraction,
  section assignments, section titles and rounding. Exclude display array order.
- Profile: entire EvaluatorProfile JSON including all defaults/settings/versions.
  Corpus: pinned CorpusHashInput JSON, excluding the top-level content_hash itself
  (avoids self-reference), sources sorted by (source_id,version),
  chunks by chunk_id; include policies. Neither embeds credentials.
- Reuse: EvaluationIdentity (content, semantic, profile, corpus, used audio hash).
  No audio analysis means audio_content_hash=null. Provider/model actually used
  stays in CallRecord; compatible identity is not proof of immutable model aliases.

A's acceptance must also mutate inputs: weights/fractions/sections/display order
preserve semantic; title/label/anchor/raw/definition/N/A/channel/evidence/reference/
flag changes invalidate it; external ID leaves content stable, changed text/role/
time/order invalidates it. Scoring changes invalidate scoring; profile/corpus/audio
changes invalidate reuse. Foundation only checks the vector bytes and input shapes.

## Execution, scoring and provenance boundaries

`validate_checklist(config)->None` and `validate_artifact(conversation,checklist,
corpus,artifact)->None` raise DomainValidationError. `score(checklist,proposals)`
returns ScoreSummary; `await evaluate(conversation,checklist,profile,corpus,budget,
call_observer)` returns EvaluationArtifact without totals. Interfaces are in
interfaces.py; A implements domain/AI, B calls them without copying arithmetic.

Observer is async `(CallEvent)->ExecutionBudget`. B atomically checks current
attempt/lease, reserves one call and persists started before returning the current
budget; A waits before sending. Duplicate same call event is idempotent. Finished
failure, lease loss and cancellation propagate; no success after failed persistence.
Budget persists across every retry/recovery, including manual retry. Call limits
and fixed deadline never reset. Unknown usage/cost is null, not zero; if a requested
token/cost cap cannot be enforced because usage/tariff is unknown, fail closed
before another call (or use a known conservative reservation approved in profile).

Finite RetryPolicy defaults: 3 job attempts, 1 format repair, 1 transport retry,
60 seconds per call, 300 seconds per logical job, 8 provider calls total, 65536
tokens. Every primary/review/repair/fallback counts. Reviewer <=2 criteria and
keep_valid_initial_v1, blind. No production model ID is invented or enabled by
foundation. Real adapters and live configuration validation remain A/B work.

SyntheticEvaluator requires explicit app_mode=test and profile.mode=test. It emits
test-origin proposals and simulated callbacks, uses no network, has no score, and
does not claim known provider cost. Production `cqa_ai.evaluate` is now implemented
by A and checks credentials and pinned profile settings. No implicit test fallback.

B's `CQA_DEADLINE_GRACE_SECONDS` (default 10) allows a valid initial answer to be
persisted after optional reviewer deadline handling. This is a finalization grace,
not extra provider-call time: `call_started` still refuses calls after deadline.
The worker cancels at deadline plus grace; cancellation, lease loss and persistence
failure cannot be turned into success.

Complete/partial must contain one valid proposal per requested criterion (A checks
against rubric); partial has undetermined, failed is not repaired by filling gaps.
Automatic remains immutable; effective proposals are supplied separately after B's
human decisions. Human completion may produce complete effective while automatic
stays partial/null. Confirmed leaves the current proposal intact; changed uses
origin=human, human_changed. Expected revision refers to EvaluationView.revision.
Optional review failure can retain valid initial; this does not hide cancellation,
lease loss or observer failure. Fixture scores are illustrative constants, not a
second scoring implementation or proof of the official rubric's arithmetic.
