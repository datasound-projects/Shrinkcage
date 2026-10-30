# Contributing

Use Node.js 22.13+ (CI: 22.14 and 24) and npm. Run `npm ci`, then `npm run build`; `./start.sh`, the Windows launchers or `node scripts/start.mjs` start the complete app. `npm run dev` serves only Vite and expects the local API server.

Before a PR, run `npm test`, `npm run coverage`, `npm run build`, `node scripts/check-public.mjs`, `npm run package`, `npm run smoke` and `npm run test:ui` after installing Playwright Chromium. Smoke needs port 8790 free; never terminate an unrelated listener. An optional real-terminal check is `node --import tsx scripts/tty-test.mjs`. See [Test matrix](docs/TEST_MATRIX.md).

Keep existing monitor API schemas, CLI no-argument startup, observed parsing and settings migration compatible. New control APIs live under `/api/control/v1`. Prefer fixed interfaces, strict schemas and small pure modules. New runtime dependencies need a clear purpose, maintained licensing and an archive smoke test. Packaging regenerates third-party notices; do not edit generated notices by hand.

A lifecycle adapter must implement detect/plan/apply/verify/observe/undo with version boundaries, scopes, permissions, provenance and child/file ownership. Add meaningful isolated tests, including failure/rollback/concurrency/security behavior. Never execute imported manifests, arbitrary install strings or browser commands. A catalog entry is guided until reviewed code actually activates and verifies it. Keep ≥85% statements/branches for planner and config transactions; coverage is not a substitute for ownership/security tests.

Use disposable app data, HOME/CODEX_HOME and synthetic fake CLIs/endpoints in tests. Do not require model credentials, alter a developer's live global hooks or send model requests to make tests pass. Keep actual counters separate from estimates, unknown from zero, and shared measurements separate from session evidence. Public screenshots must use visibly labeled synthetic sources, never live metrics.

Include the behavior change, validation commands/results and known limits in PRs. Keep unrelated user files out of commits, inspect the archive and staged diff for private paths/data, and avoid generated dependencies/test artifacts. CI must actually pass on all supported matrix jobs; do not hide a failure with a skip. No automatic repository, GitHub release or npm publication is part of build/test commands.

Contributions use the project's [MIT license](LICENSE). Report vulnerabilities through [SECURITY.md](SECURITY.md).

## Session control, billing and optimizer changes

Use the shared control engine for both CLI and UI changes. Add executable integrations only as reviewed TypeScript adapters in `server/control/optimizers`; imported JSON stays guided. Preserve native authentication/permissions, independent session configuration, external resource ownership and the additive SQLite compatibility floor. Never price a mixed-model session from its latest model, sum overlapping savings, or invent a missing token/cost value.

Run `npm ci`, `npm test`, `npm run coverage`, `npm run check`, `npm run package`, `node scripts/check-public.mjs`, `npm run smoke`, `npm run test:ui` and the TTY check. Tests must use isolated HOME/CODEX_HOME/CLAUDE_CONFIG_DIR, fixture CLIs and loopback services. Native read-only interface checks and authenticated model-backed tests are different evidence; report them separately. All macOS/Linux/Windows × Node 22.14/24 jobs and Chromium UI checks must pass for the pushed SHA.
# Plugin development

Start with [SDK v2](docs/PLUGINS.md), the [schema](sdk/optimizer.schema.json) and the [working MCP example](sdk/examples/line-window/). New executable templates need reviewed code, declared lifecycle support, isolation/ownership rules and security/conformance tests. Metadata import cannot execute code. Run `node --import tsx --test tests/plugin-sdk.test.ts` in addition to the normal release gates.
