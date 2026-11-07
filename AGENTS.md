# CQA foundation ownership

Read docs/specs/00_MASTER_SPEC.md and your role document before implementation.
The foundation is a contract scaffold, not the completed application.

- A: packages/cqa_domain, packages/cqa_ai, fixtures/evaluation, docs/handoffs/claude-domain-ai.md.
- B: apps/api, docs/handoffs/claude-b.md.
- C: apps/web, docs/handoffs/claude-web-e2e.md.
- Integrator: contracts, packages/cqa_contracts, fixtures/contracts, fixtures/hashing,
  scripts, all manifests/lockfiles, CI, root configuration and shared docs.

No independent copies of public DTOs, scoring or canonical hashing. Generated
artifacts are not edited manually. Request shared changes through your handoff.
Use an isolated clone/worktree and private data directory per executor. Never
force-push a shared/other executor branch. Keep ongoing branch history with merges.
Run the documented checks for your changes; full foundation check is
`uv run python scripts/check.py`. Do not describe foundation checks as R01–R26/E01–E20 acceptance.
Real transcripts, audio, keys, signed URLs and runtime databases stay out of Git.
