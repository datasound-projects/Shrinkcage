# Contributing

Use Node.js 22.13+ (CI: 22.14 and 24) and npm. Run `npm ci`, then `npm run build`; `./start.sh`, the Windows launchers or `node scripts/start.mjs` start the complete app. `npm run dev` serves only Vite and expects the local API server.

Before a PR, run `npm test`, `npm run coverage`, `npm run build`, `node scripts/check-public.mjs`, `npm run package`, `npm run smoke` and `npm run test:ui` after installing Playwright Chromium. Smoke needs port 8790 free; never terminate an unrelated listener. An optional real-terminal check is `node --import tsx scripts/tty-test.mjs`. See [Test matrix](docs/TEST_MATRIX.md).

Keep existing monitor API schemas, CLI no-argument startup, observed parsing and settings migration compatible. New control APIs live under `/api/control/v1`. Prefer fixed interfaces, strict schemas and small pure modules. New runtime dependencies need a clear purpose, maintained licensing and an archive smoke test. Packaging regenerates third-party notices; do not edit generated notices by hand.

A lifecycle adapter must implement detect/plan/apply/verify/observe/undo with version boundaries, scopes, permissions, provenance and child/file ownership. Add meaningful isolated tests, including failure/rollback/concurrency/security behavior. Never execute imported manifests, arbitrary install strings or browser commands. A catalog entry is guided until reviewed code actually activates and verifies it. Keep ≥85% statements/branches for planner and config transactions; coverage is not a substitute for ownership/security tests.

Use disposable app data, HOME/CODEX_HOME and synthetic fake CLIs/endpoints in tests. Do not require model credentials, alter a developer's live global hooks or send model requests to make tests pass. Keep actual counters separate from estimates, unknown from zero, and shared measurements separate from session evidence. Public screenshots must use visibly labeled synthetic sources, never live metrics.

Include the behavior change, validation commands/results and known limits in PRs. Keep unrelated user files out of commits, inspect the archive and staged diff for private paths/data, and avoid generated dependencies/test artifacts. CI must actually pass on all supported matrix jobs; do not hide a failure with a skip. No automatic repository, GitHub release or npm publication is part of build/test commands.

Contributions use the project's [MIT license](LICENSE). Report vulnerabilities through [SECURITY.md](SECURITY.md).
