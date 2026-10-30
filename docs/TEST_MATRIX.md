# Release test matrix · 1.3

The 121-test suite retains the original monitor/control-plane coverage and adds billing-aware managed sessions and the optimizer SDK. Fixtures never become live dashboard values. Detailed executed results and limits are in [VALIDATION.md](VALIDATION.md); the [1.1 matrix](history/TEST_MATRIX_1_1.md) remains historical evidence.

| Area | Evidence |
|---|---|
| Original monitoring, local history, services, privacy and offline sources | Existing adapter/discovery/session/API tests and legacy browser suite |
| Profile schema, dependencies, conflicts, compatibility and inheritance | control-planner.test.ts; 120 ordering permutations and hostile metadata cases |
| Owned setup, atomic rollback, concurrency, symlinks and recovery | control-transactions.test.ts; existing security/guardian checks |
| Native launch, terminal, interruptions and external-service ownership | control-cli.test.ts and real-PTY tty-test.mjs |
| Four Codex/Claude × subscription/API paths | control-session.test.ts with actual isolated subprocesses and native-format usage |
| Accounting, cache categories, mixed models, malformed/stale usage and no shared-savings allocation | control-session.test.ts and browser pricing/comparison flows |
| SDK schema, capability conformance and safe candidate inspection | plugin-sdk.test.ts with known/unknown/malicious fixtures |
| Future tool registration, actual MCP handshake, options, tool activity and owned uninstall | plugin-sdk.test.ts using a random ID absent from core code |
| Concurrent plugin upgrade, pinned source, baseline isolation, failed update and rollback | plugin-sdk.test.ts; unexpected user files prevent removal |
| Version/billing/platform context, changed bindings and seven gates | SDK context tests, retained plan reports and Validation center browser checks |
| Onboarding, recommendations, candidate import/proposal, typed settings and explicit launch review | control-ui-test.mjs through the real backend/SQLite |
| Installation and archive entry points | smoke.mjs installs the real .tgz, then exercises both agents, SDK lifecycle, accounting and frontend/API |
| Registry schema/admission | registry.test.ts: strict structured metadata, all eight gates, held/rejected submissions, scoped maintainer review/fingerprint, license/provenance, malicious fields/URLs |
| Discovery and updates | Public-only metadata, auth host isolation, ETag/offline dates, rate limits, package mismatch, alias/fork dedup, incremental batch progress, SHA/blob integrity, revocation and invalid cache |
| Registry scenarios A–F | registry-ui-test.mjs: RTK/Serena isolated launches, unknown rejected candidate, future plugin, changed version, offline cache, search/filter/details, keyboard and 320–1440 px light/dark |
| Cross-platform release | Required CI: macOS/Windows/Linux × Node 22.14/24; Linux Chromium browser job |
| Optional upstream interfaces | Manual approved workflow; official package version/help only; no automatic promotion or model requests |

Critical planner/transaction coverage remains at least 85% branches. Native model-backed quality, invoice costs, quota savings and arbitrary new mechanism support are not implied by passing fixture tests. See [compatibility](COMPATIBILITY.md) and [SDK boundaries](PLUGINS.md).
