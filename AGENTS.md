# CQA integration ownership

Read docs/specs/00_MASTER_SPEC.md and your role document before implementation.
Read docs/specs/05_ORGANIZER_ADDENDUM.md and docs/FLAG_FILTER_CONTRACT.md for the
current extension. The integration branch contains the A/B/C flag-search deliveries
and joint U01-U06 automated acceptance. Read docs/handoffs/gpt-pro.md for the
verified heads, integration fixes and remaining human/live acceptance limits.

- A: packages/cqa_domain, packages/cqa_ai, fixtures/evaluation, docs/handoffs/claude-domain-ai.md.
- B: apps/api, docs/handoffs/claude-b.md.
- C: apps/web, docs/handoffs/claude-web-e2e.md.
- Integrator: contracts, packages/cqa_contracts, fixtures/contracts, fixtures/hashing,
  packages/cqa_submission, fixtures/submission, scripts, all manifests/lockfiles,
  CI, root configuration and shared docs. Official submission has separate DTOs;
  read docs/SUBMISSION.md and docs/specs/06_OFFICIAL_SUBMISSION_ADDENDUM.md.

No independent copies of public DTOs, scoring or canonical hashing. Generated
artifacts are not edited manually. Request shared changes through your handoff.
Use an isolated clone/worktree and private data directory per executor. Never
force-push a shared/other executor branch. Keep ongoing branch history with merges.
Run the documented checks for your changes; the aggregate check is
`uv run python scripts/check.py`. Record actual acceptance coverage; automated
synthetic checks do not prove live-provider readiness or AI accuracy.
Real transcripts, audio, keys, signed URLs and runtime databases stay out of Git.
The explicitly authorized organizer results are a separate public export: only
reviewed short rationales and required external IDs, never full source transcripts.
