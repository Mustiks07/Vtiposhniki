# cqa_ai (owner: Claude A)

Evaluator, provider adapters, prompts, knowledge sources, blind reviewer and the
offline comparison runner. Shared DTOs/exceptions come from `cqa_contracts`;
rubric rules, scoring and hashing come from `cqa_domain`. No ORM, routes or UI.

## Entry points

| Symbol | Use |
|---|---|
| `cqa_ai.evaluate(...)` | Production: fails closed without credentials (`require_production_configuration`), builds only the profile's adapters, empty tariff table (cost `null`). Never falls back to fixtures. |
| `cqa_ai.Evaluator(transports, prices=, retrieval=, clock=, id_factory=)` | Same pipeline over explicit transports (tests, replay, early B/C integration in test mode). |
| `cqa_ai.testing.ScriptedTransport`, `ok`, `answer_all` | Offline fake transport and synthetic model answers. |
| `cqa_ai.testing.InMemoryObserver` | Reference model of B's observer duties for unit tests only. |
| `cqa_ai.corpus.build_corpus_snapshot`, `load_corpus_manifest`, `empty_corpus` | Pinned `CorpusSnapshot` with real chunk/corpus hashes. |
| `python -m cqa_ai.experiments` | Baseline vs B-light replay report (see below). |

## Pipeline (versioned prompt, preprocessing `identity-v1`)

Profiles pin their prompt version: `cqa-eval-v2` preserves the original instructions,
`cqa-eval-v3` adds applicability → conditions → evidence → answer discipline, and
`cqa-eval-v4` adds consistency across criteria, including account-specific disclosure
and identification order. Both primary and blind-review calls use that pinned
version. Older profile hashes and saved results do not change. No conversation IDs,
expected labels or rubric weights are added to the instructions.

1. Preconditions without calls: supported prompt/preprocessing versions, profile
   pinned to the given corpus id, transports exist, `validate_checklist`,
   `validate_corpus`, stored conversation hash equals the recomputed content hash.
2. Deterministic bounded lexical retrieval over the pinned corpus (no web, no vector DB).
3. One primary call with the FULL conversation; the rubric part is the semantic
   projection only (no weights/fractions/sections/order). Conversation and sources
   are untrusted JSON data. Over `MAX_PROMPT_CHARS` → failed with
   `context_limit_exceeded`, nothing is cut silently.
4. Strict parsing to `CriterionProposal` (`origin` ai/test) + the same domain
   checks `validate_artifact` uses. Invalid/empty/truncated/missing → bounded
   repair (`max_format_repairs`), then pinned fallbacks (`profile.fallbacks`),
   then a failed artifact with a safe error. Never fabricated undetermined/zeros.
5. Optional blind reviewer (`reviewer_policy.enabled`): selection by trigger flags
   (`potential_violation` > `identification_order` > `observed_contradiction` >
   `source_conflict` > `disputed_applicability` > `unresolved_request_at_maximum` >
   `ambiguous_ending_or_role`), max `max_criteria`; prompt contains no initial
   answer/rationale/evidence; no format repair; disagreement keeps the initial
   (`reviewer_disagreed`), failure/budget keeps the initial (`review_unfinished`).
6. Artifact: `identity` from cqa_domain hashes (`audio_content_hash=null`, no
   acoustic analysis), `source_fragments` = pinned chunks given to the model,
   self-validated with `validate_artifact`. No total score.

## Budget and observer

Before every call: deadline (`EvaluationTimeout`), call count, token cap and cost
cap (`BudgetExceeded`). Unknown earlier usage with a token cap, or a cost cap
without a verified tariff, fails closed. `call_started` is awaited before network
IO; the returned budget replaces the local one (another attempt id → `LeaseLost`).
`call_finished` is awaited; its failure propagates. Cancellation records a
best-effort `cancelled` call and raises `EvaluationCancelled`. Transport retries
(`max_transport_retries`) only for 429/5xx/network/timeout, honour numeric
`Retry-After`, never beyond the deadline. Budget/deadline exhaustion before a
valid initial is raised; after it, only the review is skipped.

## Providers

| Provider | Endpoint (re-verify before a real run) | Declared capabilities |
|---|---|---|
| gemini | `POST {base}/models/{model}:generateContent`, `x-goog-api-key` | JSON mime type, seed, usage incl. thoughts; SAFETY/RECITATION → refusal |
| deepseek | `POST https://api.deepseek.com/chat/completions`, Bearer | `json_object` (may return blank content: treated as invalid output), cache-hit usage |
| openrouter | `POST https://openrouter.ai/api/v1/chat/completions`, Bearer | `json_object` depends on routed endpoint; floating `openrouter/free`/`auto` rejected; routed model recorded |
| xerosharc | `POST {XEROSHARC_BASE_URL}/chat/completions`, Bearer | Separate gateway identity; `json_object`, no seed; reported model and usage preserved |

Usage normalization: `input_tokens` includes cached, `output_tokens` includes
reasoning. Tariffs are never built in: `PriceTable()` is empty → `cost=null`.
Offline adapter tests use `httpx.MockTransport`. Separate production smoke runs
are documented in [live-config](../../examples/live-config/README.md) and
[xerosharc-config](../../examples/xerosharc-config/README.md); they do not measure accuracy.

## Offline commands

```sh
uv run pytest packages/cqa_ai
uv run python -m cqa_ai.experiments --dataset fixtures/evaluation \
  --profile baseline=fixtures/evaluation/profiles/baseline.json \
  --profile "b-light=fixtures/evaluation/profiles/b-light.json,fixtures/evaluation/corpus/manifest.json" \
  --out data/private/reports/offline-replay.json
```

The replay report uses synthetic `rule_synthetic` labels: metric kind is
`formal_check`, not accuracy. `accuracy` appears only for official/human labels,
`agreement` for model_generated labels. Real DEV runs need a private dataset
under `data/private/`, keys and an integrator-approved production profile.
