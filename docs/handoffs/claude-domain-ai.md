# Claude A handoff — domain + AI (2026-11-07)

- Foundation SHA: `e526aef85ad9a368b7389488514f0d53ed531ef0` (verified with `git rev-parse HEAD` before work).
- Branch: `claude/domain-ai` (the assigned name; no remapping). Not merged into `main`.
- Stages: A0–A5 delivered as offline-verified code. Real provider runs: **not performed**.
- Commits: A1 `1bf14b8756d2eb7d89132ad17c6e75fa79f2a113` (first verified checkpoint for B);
  A2/A3 `a8e506c`; A4/A5 = the commit containing this file (a commit cannot embed its
  own SHA; the delivery report gives it, or `git log -1 -- docs/handoffs/claude-domain-ai.md`).
- Changed paths: only `packages/cqa_domain/**`, `packages/cqa_ai/**`, `fixtures/evaluation/**`
  and this file. No shared contract, manifest, lockfile, CI, README or foreign handoff edited.

## A0 — foundation review findings

Contracts, signatures, exceptions, observer/budget semantics, the synthetic
evaluator, commands and pinned versions were read before implementation. Gaps
found (requests for GPT Pro are collected below; nothing was changed locally):
contract fixtures carry placeholder hashes; `SyntheticEvaluator` emits
`profile_hash = "0"*64`; the profile has no tariff/price configuration; a token
cap cannot reserve input tokens in advance; pytest uses default `prepend` import
mode, so test basenames must be globally unique (A uses `test_domain_*`/`test_ai_*`
and `_cqa_*_helpers.py`, no `conftest.py`).

## Implemented interfaces

### cqa_domain (pure, single implementation)

| Function | Behaviour |
|---|---|
| `original_checklist()` | MASTER §4 rubric pinned as `cqa-original` / `cqa-original-v1`, created_at `2026-11-07T00:00:00Z`; snapshot `fixtures/evaluation/original-checklist.json` (drift-checked). Criteria `c1_contact`…`c8_gross_errors`; Yes/No choice ids `yes`/`no`; №4 `p0,p5,p10,p15,p20` (raw/20), №6 `p0,p4,p7,p10` (raw/10); №8 flag weight 0, `flag_when_choice_ids=["yes"]`; no sections. |
| `validate_checklist_draft(draft)` / `validate_checklist(version)` | Unique criterion/choice/section ids, unique labels and typed raw values, binary = 2 choices, non-flag fractions present and 0..1, flag weight 0 with null fractions and a non-trivial trigger subset, flag not in a section, N/A ⇔ non-blank `na_condition`, known section; version also checks both stored hashes. `DomainValidationError` with path-only details (no input echo). |
| `build_checklist_version(draft, checklist_id=, version_id=, created_at=)` | Validates and pins with computed hashes. B should use it for every new version. |
| `validate_proposals` / `score(checklist, proposals)` | Exactly one valid proposal per criterion, else `DomainValidationError`. Score per MASTER §5 (details in `packages/cqa_domain/README.md`). |
| `validate_artifact(conversation, checklist, corpus, artifact)` | Coverage, choices, N/A permission, AI N/A needs `not_applicable` code, `require_evidence` (message/range for applicable/N/A), missing action ⇒ range, `requires_reference` ⇒ source evidence, message ids exist/ordered, ranges ordered, source chunk ∈ pinned fragments ∈ corpus, fragments are exact corpus copies, automatic_final keeps initial decisions, review records consistent, finished call records, identity hashes recomputed, conversation/corpus integrity. |
| Hashes | `conversation_content_hash`, `checklist_semantic_hash`, `checklist_scoring_hash`, `profile_hash`, `corpus_snapshot_hash`, `evaluation_reuse_key`, `text_hash`, plus `canonical_json`/`canonical_decimal`. All six foundation vectors pass byte-for-byte. |
| `evidence_messages(conversation, evidence)` | Quotes derived from original messages (for B/C display). |

### cqa_ai

`evaluate(...)` (production, fails closed, no fixture fallback) and
`Evaluator(transports, ...)` (same pipeline over explicit transports). Behaviour,
budget/observer rules, providers and commands: `packages/cqa_ai/README.md`.
Failure semantics: `BudgetExceeded`/`EvaluationTimeout` raised when no valid
initial exists; `LeaseLost`, `ObserverPersistenceError`, `EvaluationCancelled`
always propagate; provider failure/invalid output after bounded repair and
fallbacks → `status="failed"` artifact with safe `error` (retryable only for
exhausted transient transport failures).

Stable limitation codes in artifacts: `test_evaluator`, `audio_not_analyzed`,
`knowledge_sources_empty`, `cost_unknown`, `review_unfinished`, `fallback_used`,
`fallback_after_<kind>`, `provider_<kind>`, `invalid_output_<diagnostic>`,
`context_limit_exceeded`. Proposal limitations come from
`cqa_domain.PROPOSAL_LIMITATION_CODES`; review markers from `REVIEW_REASON_CODES`.

## Acceptance mapping (01_CLAUDE_DOMAIN_AI §10, offline evidence only)

| # | Evidence |
|---|---|
| 1 | Diff limited to A paths; shared types imported. |
| 2 | `test_domain_rubric.py` (weights, choices, N/A, flag). Wording reproduced from MASTER §4; source PDF C is not in the repo — integrator should compare. |
| 3–4 | `test_domain_scoring.py`: 100 / 95.50 / 85.50 / 100 / 85.38, no_applicable_weight, incomplete_evaluation, ROUND_HALF_UP boundaries, context independence, sections/contributions without a second formula. |
| 5 | Reverse non-zero scale, NaN/Infinity/out-of-range rejected, duplicate ids, unknown choices. |
| 6 | `test_domain_hashing.py` mutation matrix + `test_weight_change_keeps_model_request_but_meaning_change_alters_it`. |
| 7, 15 | applicable/N/A/undetermined; invalid/missing after repair → failed (no fabricated partial); all-undetermined → partial. |
| 8 | `score` pure/deterministic; artifact has no total; effective after human completion scored by the same `score`. |
| 9 | Evidence/range/source/fragment checks and tamper tests. |
| 10–11 | Prompt rules (bot greeting, consent ≠ identification, ASR, no acoustic claims), roles preserved, `audio_not_analyzed`, empty corpus as limitation. Semantic quality of these rules is **not** measured. |
| 12 | Adapter tests: blank content, truncation, refusal/content filter/SAFETY, invalid JSON/choice, 429 + Retry-After, timeout, network, auth, cancellation. |
| 13 | Shared budget across attempts, awaited started, started/finished persistence failures, deadline. |
| 14, 17 | Blind reviewer prompt test, conflict keeps initial, failure/budget keeps initial with limitation; usage unknown ≠ 0. |
| 16 | Hashing only in cqa_domain; cache storage left to B. |
| 18 | `fixtures/evaluation/scenario-manifest.json` (frozen split, KZ/EN variants in one group, DEV family constraint `p1-kz-013`/`p1-en-013`), label provenance, replay report with `formal_check` metric kind. |
| 19–20 | All tests offline, no keys, no network; this handoff. |

## Commands and actual results (Windows 11, Python 3.13.5, uv 0.13.7, Node 26.1.0, npm 11.13.0)

| Command | Result |
|---|---|
| `uv sync --locked --all-packages --dev` | ok |
| `uv run pytest packages/cqa_domain` | 129 passed (at A1); current total below |
| `uv run pytest packages/cqa_ai` | 80 passed |
| `uv run pytest` | 279 passed, 1 foundation Starlette deprecation warning, exit 0 |
| `uv run ruff check .` | All checks passed, exit 0 |
| `uv run mypy` | Success, 34 source files, exit 0 |
| `uv run python scripts/generate_contracts.py --check` | no drift, exit 0 |
| `uv run python -m cqa_domain rubric --check fixtures/evaluation/original-checklist.json` | up to date, exit 0 |
| `uv run python scripts/check.py` (after `npm ci`, `npx playwright install chromium`) | "Foundation checks passed", exit 0 |
| Replay: `uv run python -m cqa_ai.experiments --dataset fixtures/evaluation --profile baseline=fixtures/evaluation/profiles/baseline.json --profile "b-light=fixtures/evaluation/profiles/b-light.json,fixtures/evaluation/corpus/manifest.json"` | exit 0; 6 synthetic cases, baseline 6 calls / B-light 8 calls (2 blind reviews: 1 agreed, 1 conflicted, initial kept), 0 changed decisions, cost null |

Not run: any real Gemini/DeepSeek/OpenRouter call; real DEV evaluation; GitHub CI
status for this branch was not inspected from here; Linux not run locally.

## Providers

Gemini / DeepSeek / OpenRouter adapters exist with declared capabilities and are
verified **only with httpx.MockTransport**. Endpoint shapes, JSON-mode support,
model IDs, quotas and tariffs must be re-verified before the first live run. No
model ID is chosen in code; no tariff is built in (`cost=null`, `cost_unknown`).
Full cost of actually executed runs: none executed, so none reported.

## Dataset, labels, profile and corpus versions

- Rubric `cqa-original-v1`; prompt `cqa-eval-v1`; preprocessing `identity-v1`.
- `fixtures/evaluation`: 6 synthetic cases (RU/KZ/EN chat, RU call), labels
  `rule_synthetic` authored by Claude A as constructions, not expert labels; one
  deliberately undetermined label (expert ambiguity not forced). Split
  `synthetic-split-v1`. Replay responses are synthetic, not model outputs.
- Corpus `synthetic-eval-corpus-v1` (one invented source). The official URLs of
  MASTER §11 are not fetched or committed; build a real corpus locally with
  `load_corpus_manifest` under `data/private/` after review of each page.
- Quality limitations: no human/official labels, KZ without a reviewer, five noisy
  calls, no measured accuracy. Nothing here supports an accuracy claim.

## What B must call / store

- Checklist create/edit: `build_checklist_version`; on load or before use: `validate_checklist`.
- Import revisions: `conversation_content_hash` (message ids `m0001…` assigned by B).
- Corpus snapshots: build with `cqa_ai.corpus.*`; `validate_corpus` before pinning.
- Evaluation: production `cqa_ai.evaluate`; test mode `Evaluator({"test": transport})`
  with a `mode="test"` profile (prompt `cqa-eval-v1`). Persist `artifact` as returned;
  `validate_artifact` before persisting is cheap and recommended.
- Reuse: `evaluation_reuse_key(artifact.identity)`; scoring-only changes are
  detectable via `checklist_scoring_hash` with equal `checklist_semantic_hash`.
- Scores: `automatic_score = score(checklist, artifact.automatic_final)` only for
  non-failed artifacts; `effective_score = score(checklist, effective_proposals)`.
- Observer: reserve on `call_started` atomically and return the budget with the
  same `logical_job_id`/`attempt_id`; on `call_finished` update `consumed_tokens`
  (input+output, `null` once any usage is unknown) and `consumed_cost` (`null` once
  any cost is unknown). Without that, token-capped jobs fail closed on the second
  call unless all consumed calls belong to the current attempt.
- Exceptions: `BudgetExceeded`/`EvaluationTimeout` → failed job, no automatic retry;
  failed artifact `error.retryable` drives retry_wait.
- Safe export limitation mapping suggestion: `test_evaluator`→`test_evaluator`,
  `review_unfinished`→`review_unfinished`, `cost_unknown`→`cost_unknown`,
  `factual_verification_limited`/`knowledge_sources_empty`→`factual_verification_limited`,
  partial→`incomplete`, everything else (incl. `audio_not_analyzed`)→`other`.

## What C receives

Shared fields only: proposals with `reason_codes`, `limitations` (codes above),
`review_reasons` (triggers + `reviewer_agreed`/`reviewer_disagreed`), evidence by
message ids/ranges/source chunk, `source_fragments`, reviews, calls with nullable
usage/cost, score contributions/sections/flags from `score`.

## Requests to GPT Pro (no local edits made)

1. Regenerate or annotate `fixtures/contracts` checklists/artifacts/corpus with real
   hashes from cqa_domain, or keep documenting them as wire-only (currently
   `validate_checklist` rejects their placeholder hashes, as intended).
2. `SyntheticEvaluator` could use cqa_domain hashes for `identity` so its artifacts
   pass `validate_artifact` (now `profile_hash="0"*64`).
3. Tariff configuration: a versioned price table (profile or separate config) is
   needed before any `max_cost` use; until then cost caps fail closed.
4. Token cap: decide on a conservative per-call input reservation; today a single
   call's input can exceed the remaining token budget (output is capped).
5. Confirm A's interpretations: `requires_reference` ⇒ applicable needs a source
   evidence; AI N/A needs `not_applicable` code; flags cannot belong to sections;
   binary has exactly two choices; `na_condition` must be blank when N/A is forbidden.
6. Optional: pytest `--import-mode=importlib` to remove basename coupling between packages.
7. Before any real run: approve production profile (exact model IDs, retries,
   reviewer), verify provider endpoints/quotas/tariffs, and the private DEV path.

## Residual risks and acceptance steps for GPT Pro

Prompt quality and rubric interpretation are unmeasured; the lexical retrieval is
deliberately simple; provider APIs may differ from the mocked shapes; Retry-After
HTTP-date form is ignored (backoff used). Acceptance: rerun the commands above on
Linux and Windows, review the diff paths, then coordinate a small live smoke with
explicit budget and keys outside Git.
