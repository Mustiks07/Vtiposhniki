# Foundation handoff — 2026-11-07

Scope: F0 only. A/B/C implementations have not been started. No R01–R26 or E01–E20
product acceptance is claimed. The five supplied specs are preserved in docs/specs.

Initial inspection found only those five local documents, no local Git metadata,
and an empty public remote with no branches. Connected GitHub grants push access.
The integrator initialized main; no prior repository work was overwritten.
Publication identity is the foundation commit linked in the delivery report and
the `foundation-v1.1` tag. Resolve the full SHA with `git rev-parse foundation-v1.1`.
The final SHA cannot be embedded in its own commit without changing it.

Initial tag foundation-v1 retains the first published scaffold. Its GitHub Linux
job exposed that ubuntu-latest had moved to 26.04, which has no setup-python build
for pinned Python 3.13.5. The final foundation pins Ubuntu 24.04 and Windows 2025;
official actions/python-versions metadata confirms 3.13.5 support. No published
commit/tag was rewritten. Start all executor branches from the final delivery SHA.

## Delivered foundation

- uv workspace: cqa_contracts, cqa_domain, cqa_ai, cqa_api; npm workspace apps/web.
- Python 3.13.5, uv 0.13.7, Node 26.1.0, npm 11.13.0; exact dependency versions and
  transitive lockfiles. No Docker dependency.
- Canonical Pydantic models, typed callable boundaries and exceptions, 23 HTTP
  operations, generated OpenAPI/JSON Schema/TypeScript. Decimal strings, UTC server
  time, inclusive whole-message evidence, versions, decisions and safe export DTOs.
- Shared job budget and started/finished observer contracts. Production credential
  gate plus separately constructed synthetic evaluator requiring explicit test mode.
- 45 synthetic contract DTO fixtures; six static content/semantic/scoring/profile/
  corpus/reuse hash vectors. Domain algorithms remain unimplemented.
- React page explicitly identifying the foundation, typed health request; FastAPI
  health, safe errors and 501 business placeholders; production static asset serving.
- README install/run/check commands, ownership rules, privacy ignores, safe .env
  template, documented precise decisions in docs/CONTRACTS.md, Windows/Linux CI.

## Validation and its scope

Clean Python `uv sync --locked --all-packages --dev`, Python dependency consistency,
all four package imports and `npm ci` passed. Pinned Python packages build during
workspace installation. Registry metadata came from PyPI/npm, not assumed versions.

Contract regeneration has no drift; all fixtures validate both through Pydantic
and generated JSON Schema. Ruff, strict mypy (13 source files), TypeScript,
70 Python checks, one component test and Vite production build passed. One
Playwright Chromium smoke uses the real foundation API and built assets, with no
intercepted success responses. It checks the page/health/501 boundary only.

`uv run python scripts/check.py` is the aggregate command. Browser installation
must precede it, as documented. The initial Windows browser invocation exposed an
unquoted executable path; the quoted absolute path was fixed and the smoke passed.
Generators force LF so a clean checkout has deterministic artifacts on both OSes.

The complete staged source was also exported into a separate clean directory.
Fresh uv/npm installs there and the full aggregate check passed with exit code 0,
including generation drift, all 70 Python checks, web build and real-server browser smoke.

Environment constraints: sandbox DNS and Windows loopback socketpair access were
blocked. Dependency downloads and HTTP/browser tests ran with approved execution
outside that sandbox. No credentials were printed or copied. Starlette emits a
deprecation warning for its httpx TestClient integration; current locked tests pass.
This warning is not an application failure or evidence of a live provider test.

## Deliberately outstanding

| Owner | Remaining implementation |
|---|---|
| A | Exact initial eight-criterion rubric; semantic/business validation; Decimal score; all runtime canonical/hash helpers; provider adapters; evaluator/reviewer; sources; quality experiments |
| B | Organizer/JSON import; SQLite WAL/migrations; persistent jobs, leases and observer reservations; retry/recovery/idempotency; versions/reuse; appeals; safe CSV/JSON conversion; audio fetch/stream |
| C | Product screens; editor; workflow states/accessibility; evidence navigation; audio UI; appeals/export UI; actual E01–E20 against real backend |
| Later integration | R01–R26 acceptance, real-provider smoke/quotas/costs, independent human/official labels and measured accuracy, final release/demo |

No real conversations/audio, runtime DB, API keys, signed organizer URL or private
artifacts are included. No live AI call was performed; cost and quality are not
measured. Worker exits with explicit NotImplemented status. Foundation does not
load/create SQLite or silently evaluate data.

## Common starting point

All four remote branches must point to the same published foundation SHA:
`claude/domain-ai`, `claude/api-jobs`, `claude/web-e2e`, `integration/gpt-pro`.
Actual names equal these requested names; no cloud branch remapping is needed.
Each executor uses a separate clone/worktree and isolated private data directory.
Keep the starting SHA in the executor's own handoff, use small commits and preserve
ancestry when integrating continuing branches. Changes to shared contracts,
manifests and locks go through the integrator.

The external delivery report includes exact published SHA, commit URL, branch
verification and three separate start messages. Foundation work stops there.
