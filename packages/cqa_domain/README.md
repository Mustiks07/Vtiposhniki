# cqa_domain (owner: Claude A)

Pure domain module: no network, ORM, HTTP routes or UI. Shared DTOs are imported
from `cqa_contracts`; nothing here redefines public types.

| Function | Purpose |
|---|---|
| `original_checklist()` / `original_checklist_draft()` | Starting rubric, MASTER §4 (8 criteria, weights 10/15/20/20/15/15/5, flag №8 weight 0) |
| `validate_checklist_draft(draft)` | Rule validation of an editor draft; raises `DomainValidationError` |
| `validate_checklist(version)` | Rules + stored `semantic_hash`/`scoring_config_hash` integrity |
| `build_checklist_version(draft, checklist_id=, version_id=, created_at=)` | Validates and pins a version with computed hashes |
| `validate_proposals(checklist, proposals)` | Exactly one valid proposal per criterion (choice exists, N/A allowed) |
| `score(checklist, proposals)` | The single Decimal scorer → `ScoreSummary` |
| `validate_artifact(conversation, checklist, corpus, artifact)` | Cross-object artifact checks (A2) |
| `conversation_content_hash`, `checklist_semantic_hash`, `checklist_scoring_hash`, `profile_hash`, `corpus_snapshot_hash`, `evaluation_reuse_key` | The single canonical-hash implementation (docs/CONTRACTS.md) |
| `canonical_json`, `canonical_hash`, `canonical_decimal`, `text_hash` | Canonicalization primitives |

## Scoring rules

`total = 100 × Σ(weight × score_fraction) / Σ(applicable weight)`, flags excluded,
N/A removes numerator and denominator. Decimal arithmetic in a fixed private
context (independent of the caller's thread context), no intermediate rounding,
final total and section percent `ROUND_HALF_UP` to 2 places.

- Any `undetermined` (including a flag) → `incomplete_evaluation`, `total_score=null`.
- Otherwise zero applicable weight → `no_applicable_weight`, `total_score=null`.
- Contributions cover non-flag criteria in checklist order: applicable →
  `earned=weight×fraction`, `applicable_weight=weight`; N/A → `0/0`;
  undetermined → `earned=null`, `applicable_weight=0`. `normalized_contribution`
  (= 100×earned/total applicable, exact, unrounded) only when status is complete.
- Sections: own denominator; `section_percent=null` when the section contains an
  undetermined criterion or has zero applicable weight. Section percents are not summed.
- Flags: `detected = answer ∈ flag_when_choice_ids`, `null` for undetermined/N/A.
- An invalid or incomplete set (missing/duplicate/unknown criterion, unknown
  choice, forbidden N/A) raises `DomainValidationError`; it is never scored.

## Commands

```sh
uv run pytest packages/cqa_domain
uv run python -m cqa_domain rubric fixtures/evaluation/original-checklist.json --check
```
