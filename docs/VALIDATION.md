# Validation record · 1.5.0

Release checks cover the existing monitor and the session optimization control plane. Production adapters never substitute fixture measurements. The [historical 1.1 record](history/VALIDATION_1_1.md) is preserved.

## Reproduce

```sh
npm ci
npm run check
npm run registry:validate
npm test
npm run coverage
npm run package
node scripts/check-public.mjs
npm run smoke
npm run test:ui
node --import tsx scripts/tty-test.mjs
```

Run heavy build/test/browser gates sequentially. Native probes deliberately time out; CPU saturation can invalidate fixture discovery rather than make an unavailable tool appear healthy. Browser suites now use isolated ephemeral ports, so an existing dashboard can remain running. Package smoke checks still require a free 8790 and are exercised in isolated cross-platform CI; no suite stops unrelated listeners. Playwright needs installed Chromium or SHRINKCAGE_BROWSER_EXECUTABLE pointing to a compatible browser.

## Evidence

| Check | Exercised behavior |
|---|---|
| Unit/integration | 141 tests covering original collectors, malformed/offline sources, sessions, billing/cache/prices, strict manifests, compatibility/dependencies/conflicts, inheritance, isolation, permissions and ownership |
| Exhaustive stack matrix | 192 agent/billing/platform/tool-subset combinations; twenty supported Codex/Claude API/subscription stacks through real isolated subprocesses, receipt counts, exact cache accounting, permissions and owned cleanup |
| Usage-scope regression | Seven tests for freshest cumulative records, cross-agent identity, stale data, conflicting billing, budget deduplication, cache pricing and qualified experiment rejection |
| Critical coverage | 25 planner/transaction tests; 100% statements/lines/functions and over 85% branches; threshold retained |
| Managed mechanics | Real isolated fake Codex/Claude subprocesses, four agent × billing paths, parallel same-project sessions, native hooks/MCP, failures, interruption/owner crash, cleanup and external-service survival |
| Future SDK plugin | Random previously unknown ID, real initialize/tools/list, typed configuration, compact_output receipt, independent baseline, disabling/removal; concurrent update pins the original session version |
| SDK security | Malicious manifests/URLs/options, incompatible contexts, malformed JSON-RPC, changed source, failed upgrade, rollback, refusal to delete unknown files, private HOME and stripped provider keys |
| Registry | Eighteen unit/integration/security cases: schemas, provenance/license distinctions, public-only discovery, aliases/forks, bounded incremental batches, ETags/rate limits, maintained approval artifacts, immutable update integrity, offline cache, revocation, stale approvals and independently launched stacks |
| Registry browser A–F | Real backend/SQLite; RTK and Serena in separate stacks, rejected unknown submission, future SDK tool with data-driven UI, changed version incompatibility, offline catalog, filters/details/modal keyboard/responsive layouts |
| Clean package | Actual .tgz install with production dependencies; CLI version/dispatch, doctor/tools/profiles/setup/plans, Codex/Claude runs, SDK register/check/run/remove, accounting, packaged curated registry CLI/API, built frontend/API and reuse/shutdown |
| Browser | Actual backend/SQLite, onboarding, recommendations, manifest import/proposal, future-plugin settings/checks, preview/copy approvals, profiles, session stacks, tool log, cache/subscription estimates, comparisons, recovery, keyboard and 320–1440 px silver/graphite layouts |
| Public source | Whitespace and credential/private-path pattern scan plus staged/archive review; scans do not prove absence |

Seven retained integration gates distinguish discovery, compatibility, security, configuration, integration, runtime effectiveness and quality. Built-ins explicitly label fixture conformance; SDK registration requires a real isolated protocol check. Runtime receipts do not prove quality or savings. Gate 7 remains unavailable without a qualified task-quality comparison.

## Platform and native scope

Local validation used **macOS, Node 22.14.0**, and Chromium-compatible Helium. The required [Verify Shrinkcage workflow](https://github.com/datasound-projects/Shrinkcage/actions/workflows/ci.yml) runs **six OS/runtime jobs** (macOS, Windows and Linux × Node 22.14/24) and a Linux Chromium browser job. Publication requires all jobs on the pushed head to pass; use the commit/PR checks for exact results.

The optional manually approved [upstream-interface workflow](https://github.com/datasound-projects/Shrinkcage/actions/workflows/upstream-compatibility.yml) checks official Codex/Claude package version/help interfaces. It never authenticates, requests a model, promotes adapter code or publishes a release.

Read-only native checks on the development host found Codex 0.165.0, RTK 1.1.0, Serena 2.1.0 and Headroom 0.42.0. Installed Claude 0.2.29 is too old for modern managed interfaces and is reported unsupported. CLI installation, a healthy dashboard, confirmed MCP connection and observed tool use remain separate facts.

## Limits

- No paid authenticated/model-backed task-quality or savings benchmark was run. Fake CLIs validate mechanics, not every native account/OS/model combination.
- Generic SDK execution supports foreground stdio MCP only. Unknown patterns remain Integration required with review scaffolding/tests. No arbitrary GitHub code or executable update runs automatically.
- A private workspace/environment is not an OS sandbox. Approved programs retain user permissions. Fingerprints cover the executable/entry script, not transitive imports or a whole installation.
- External hooks, native trust and administrator policy can limit isolation. Current sessions are never silently restarted or reconfigured.
- Headroom managed routing is Codex API only. Shared Headroom/RTK counters are not assigned to sessions or summed. Serena calls do not imply token/cash savings.
- Provider limits, invoice charges, inference latency, optimizer overhead and causal quality improvements stay N/A without genuine sources/qualified experiments. Mixed, sampled or stale usage cannot become a complete cost estimate.

See [compatibility](COMPATIBILITY.md), [SDK](PLUGINS.md), [accounting](ACCOUNTING.md), [architecture](CONTROL_PLANE.md) and [security](../SECURITY.md).

## Registry research scope

The initial 30 October 2026 review queried canonical public GitHub metadata/READMEs/licenses/releases/CI/advisories and official npm/PyPI/crates provenance. Ten scoped catalog reviews are retained in registry/reviews/initial-review.json; Token Savior remains under review for unreproducible/withdrawn benchmark evidence. Versioned source/package observations are separate. Read-only live discovery is tested without running upstream candidate code. No complete dependency vulnerability audit, independent security certification or model-backed efficiency benchmark was performed. Returned advisory records provide partial coverage only.

The required CI includes registry validation and all three browser suites. The scheduled metadata workflow is review-only and cannot approve entries or install updates. Exact CI evidence is attached to the published commit/PR; local checks alone are not cross-platform validation.

Windows CI exposed automatic CRLF conversion of the digest-covered catalog. Registry JSON now explicitly uses LF through `.gitattributes`; integrity verification remains byte-exact. A forced `core.autocrlf=true` checkout is checked locally, then the full OS/runtime matrix verifies the correction.

The first real scheduled discovery inspected eight upstreams, retained nine unapproved candidates and passed catalog validation with no metadata errors. GitHub Actions PR creation is disabled by repository policy. The workflow now reports that specific condition as an explicit manual-review warning with a saved branch/artifact; unexpected publication failures still fail. Two isolated publication tests cover fixed argv, policy handling, unsafe branch rejection and transport failure. Repository permissions are unchanged.

## 1.4 workspace and native checks · 31 October 2026

The silver redesign exposes five primary destinations and one focused view at a time. Browser coverage visits all seventeen existing screens on desktop/mobile, checks deep links, retained drafts, offline metrics navigation, dialog cleanup, global refresh and readable panel contrast. All previous monitor, registry and control browser flows remain required.

Read-only installed interfaces: Codex 0.165.0, Claude Code 0.2.29, RTK 1.1.0, Serena 2.1.0 and Headroom CLI 0.42.0. Native RTK hook JSON successfully rewrote synthetic git-status input for both agents without executing that command. Actual Serena and Headroom MCP processes passed initialize/tools/list in a temporary canonical private HOME; no models, existing project contents or proxy records were requested. Serena reported server version 2.1.0; Headroom's MCP component reported 1.30.0, separately from CLI package 0.42.0. Owned probe processes were closed and temporary files removed.

Installed Claude 0.2.29 remains unsupported for modern managed launches. The UI blocks its launch preview and recovers after compatible discovery; automated subprocess tests use modern isolated fake CLIs. No native authenticated/model-backed task-quality, cost-minimization or paid savings benchmark was run. Passing mechanical and protocol tests does not establish task quality or universal compatibility.

Current official npm packages were also installed into an owned temporary prefix with installation scripts disabled: Codex 0.166.0 and Claude Code 2.1.316. Both passed the actual detector in a private HOME. Modern Claude's native optional dependency was checked directly because ignore-scripts intentionally leaves its launcher as a placeholder; no downloaded installer or model request ran. Codex support now explicitly includes reviewed 0.165 and 0.166 families, retaining rejection of unreviewed 0.167/prerelease versions. A regression test covers the native Windows Claude npm launcher, installer-stub rejection and symlink refusal. Cross-platform upstream-interface CI remains separately reported.

Native agent version/help checks are now sequential within each agent, with an eight-second cold-version bound and four-second help bound. This reduces concurrent native process pressure and avoids false cold-start incompatibility without relaxing version/feature requirements.

## 1.5 reviewed terminal launches

Eight new tests cover one-time/idempotent approvals, real managed fake-agent execution, all four agent/billing combinations including a full Headroom/RTK/Serena API stack, expired/stale approvals, wrong targets and arbitrary fields, non-interactive refusal, symlink launch roots, redacted desktop failures, and the real HTTP Origin/capability boundary. The fourth browser suite covers Sessions Start, tool selection, explicit review, missing Herdr, different same-project stacks, and launching a saved pending stack through real API/SQLite/subprocesses. Only its desktop opener is synthetic.

On this macOS host, the actual Terminal app and native Herdr 0.9.5 each launched isolated fake Codex sessions with RTK/Serena usage receipts and clean exits. A separate real Codex 0.165.0 subscription session reached running state with selected RTK/Serena configuration and was closed cleanly without sending a task. Those real tools remained configured rather than falsely marked used; native hook/MCP policy and inherited external optimizers were disclosed. No paid task-quality, cost-savings or native Windows/Linux GUI benchmark is claimed. Herdr Windows and automatic restoration remain unsupported.
