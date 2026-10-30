# Historical 1.1 upgrade baseline

Current release evidence is in [VALIDATION.md](VALIDATION.md). This document records the earlier 1.1 starting point.

Starting commit: `4619fb158e382ecfb7861f81aaf9474735cc422a` on `origin/main`.
Branch: `feat/optimization-control-plane`. The two user-provided specification files in the working directory were preserved and excluded from publication.

Executed on macOS with Node 22.14.0 before changing application behavior:

| Command | Result |
|---|---|
| `npm ci` | Passed |
| `npm test` | 40 tests passed; zero failed, skipped or cancelled |
| `npm run build` | TypeScript and production frontend/server builds passed |
| `node scripts/check-public.mjs` | Passed |
| `npm run package` | Passed |
| `npm run smoke` | Clean archive install, CLI version, server and frontend passed |
| `node scripts/ui-test.mjs` | Passed using a local Chromium-compatible browser, with isolated synthetic sources |

The browser executable override was used instead of downloading another browser. Port 8790 was freed by stopping the known Shrinkcage launcher owned by this task; no unrelated process was killed. Node's existing experimental SQLite warning was present. No baseline test failures were found.

Existing hosted main verification: https://github.com/datasound-projects/Shrinkcage/actions/runs/40955019805 (success on all six OS/Node combinations and the browser job).

Installed interface checks: Codex 0.165.0, RTK 1.1.0, Headroom 0.42.0, Serena 2.1.0. codemem was absent. All checks were read-only. A disposable HOME/project and fake Codex confirmed the Headroom wrapper's `--no-proxy --no-mcp --code-memory none` mode made no configuration writes. No real credentials, model requests or global hooks were used in that test.
