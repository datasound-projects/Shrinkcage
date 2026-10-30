# Validation record · 1.2.0

Release checks cover the existing monitor and the session optimization control plane. Production adapters never substitute fixture measurements. The [historical 1.1 record](history/VALIDATION_1_1.md) is preserved.

## Reproduce

```sh
npm ci
npm run check
npm test
npm run coverage
npm run package
node scripts/check-public.mjs
npm run smoke
npm run test:ui
node --import tsx scripts/tty-test.mjs
```

Run heavy build/test/browser gates sequentially. Native probes deliberately time out; CPU saturation can invalidate fixture discovery rather than make an unavailable tool appear healthy. Package/browser suites require port 8790 to be free and never stop unrelated listeners. Playwright needs installed Chromium or SHRINKCAGE_BROWSER_EXECUTABLE pointing to a compatible browser.

## Evidence

| Check | Exercised behavior |
|---|---|
| Unit/integration | 103 tests covering original collectors, malformed/offline sources, sessions, billing/cache/prices, strict manifests, compatibility/dependencies/conflicts, inheritance, isolation, permissions and ownership |
| Critical coverage | 25 planner/transaction tests; 100% statements/lines/functions and over 85% branches; threshold retained |
| Managed mechanics | Real isolated fake Codex/Claude subprocesses, four agent × billing paths, parallel same-project sessions, native hooks/MCP, failures, interruption/owner crash, cleanup and external-service survival |
| Future SDK plugin | Random previously unknown ID, real initialize/tools/list, typed configuration, compact_output receipt, independent baseline, disabling/removal; concurrent update pins the original session version |
| SDK security | Malicious manifests/URLs/options, incompatible contexts, malformed JSON-RPC, changed source, failed upgrade, rollback, refusal to delete unknown files, private HOME and stripped provider keys |
| Clean package | Actual .tgz install with production dependencies; CLI version/dispatch, doctor/tools/profiles/setup/plans, Codex/Claude runs, SDK register/check/run/remove, accounting, built frontend/API and reuse/shutdown |
| Browser | Actual backend/SQLite, onboarding, recommendations, manifest import/proposal, future-plugin settings/checks, preview/copy approvals, profiles, session stacks, tool log, cache/subscription estimates, comparisons, recovery, keyboard and 320–1440 px light/dark layouts |
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
