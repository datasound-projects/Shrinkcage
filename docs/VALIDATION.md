# Validation evidence · Shrinkcage 1.1.0

## Baseline

The starting main commit was `4619fb158e382ecfb7861f81aaf9474735cc422a`. Before implementation, all 40 original tests passed with zero skips, as did clean install, build, public scan, packaging, actual archive smoke and the original browser suite. See [BASELINE.md](BASELINE.md). Existing main's [hosted baseline run](https://github.com/datasound-projects/Shrinkcage/actions/runs/40955019805) passed. No history reset or unrelated user-file cleanup was used.

## Local release checks

Executed on macOS arm64 with Node **22.14.0**, October 30, 2026. The local browser was the installed Chromium-compatible Helium executable, selected through `SHRINKCAGE_BROWSER_EXECUTABLE`; Playwright's own downloaded Chromium was absent. The first default-browser attempt failed for that missing executable; rerunning both suites with the installed browser passed. Hosted browser CI installs Playwright Chromium explicitly.

| Command | Result |
|---|---|
| `npm ci` | Locked dependency clean install succeeded |
| `npm test` | 79 passed, 0 failed, 0 skipped (40 original + 39 new isolated tests) |
| `npm run coverage` | Planner/transaction gate passed; 100% statements/functions/lines and 92.69% aggregate branches in the final 24-test coverage run |
| `npm run build` | Frontend/backend TypeScript and production Vite build passed; control workspace split into a separate chunk |
| `node scripts/check-public.mjs` | No recognized credential/private-user-path patterns in distributable source |
| `npm run package` | Versioned actual TGZ, SHA256SUMS and regenerated third-party notices |
| `npm run smoke` | Actual archive installed in a disposable prefix; legacy launch/reuse, doctor/tools/profile/setup/plan/run/session evidence, compiled frontend/APIs and external-service survival passed |
| `SHRINKCAGE_BROWSER_EXECUTABLE=... npm run test:ui` | Original dashboard + real-control-API browser suites passed; synthetic screenshots reviewed; no external browser requests |
| `node --import tsx scripts/tty-test.mjs` (allocated terminal) | Real inherited stdin/stdout/stderr TTY identity passed with fake Codex; no model call |
| `npm audit --json` | Zero reported vulnerabilities |

The control browser suite uses the actual local control API, SQLite store, planner, setup CLI, runner and MCP/hook relays with isolated fake executable sources. Only legacy metric/workspace views are mocked for public screenshot privacy. It checks profiles, plans, stale/explicit approvals, copied commands, actual managed runs/evidence, comparisons, hostile imports, offline recovery, keyboard, dark/light and 320/390/768/1024/1440-pixel layouts.

Automated ownership checks include real SIGINT/SIGTERM, parent SIGKILL, mid-transaction process SIGKILL, temporary inode/journal recovery, concurrent project setup, two simultaneous managed profiles/projects, unowned-service survival and live/reused-PID lock refusal. Tests use isolated HOME/CODEX_HOME/app-data and do not edit live agent settings. [T01–T20 mapping](TEST_MATRIX.md).

## Native interfaces checked locally

Read-only `doctor` detected Codex **0.165.0**, RTK **1.1.0**, Serena **2.1.0**, Headroom **0.42.0**, and a healthy existing Headroom proxy. Claude was present on PATH but has no managed-version compatibility claim; Gemini and guided codemem/LiteLLM/Langfuse executables were not detected. Observed saved-history parsing remains covered by synthetic fixtures.

- RTK's real native Codex hook returned the expected rewrite when supplied its actual required permission/event fields.
- The real Headroom wrapper was exercised with isolated HOME and fake Codex using all managed no-write flags; it exited successfully and created no files in that isolated home.
- Actual installed Serena and Headroom stdio MCP servers completed initialize/initialized/tools-list handshakes with a disposable synthetic project and isolated HOME. Each supplied three tools. No successful native tool invocation or live model-session savings is claimed from those checks.
- The original monitor reads real local endpoints/binaries; unavailable fields are preserved as unavailable. No live metrics or transcripts are shipped in public screenshots or fixtures.

No paid model requests, real interactive Codex optimizer task, Claude/Gemini managed run, native Windows/Linux tool build or remote Langfuse/LiteLLM/codemem activation was exercised. Native authentication/trust/provider behavior and unreviewed versions remain explicit integration limits, not test successes. Windows guardian detachment is exercised by hosted forced-termination tests; native Windows console/TTY behavior still requires manual verification on a Windows terminal.

## Hosted platform verification

The existing [Verify Shrinkcage workflow](https://github.com/datasound-projects/Shrinkcage/actions/workflows/ci.yml) runs macOS, Windows and Ubuntu × Node 22.14/24, with real clean install/unit/coverage/package/scan/archive-smoke steps and an additional Chromium browser job. A configured workflow alone is not a passed run. Publication must inspect the exact pushed PR head and then main; the verified run links/commit are recorded with the published PR and final release report.

Release artifacts are prepared by a separate manually triggered workflow. Source builds and archive creation do not publish an npm package or GitHub release.
