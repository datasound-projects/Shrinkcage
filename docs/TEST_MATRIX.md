# Release test matrix · 1.1

All fixtures are disposable test-only data. Production adapters have no synthetic fallback. `npm test` retains all 40 original tests and adds 40 control-plane tests (80 total). The separate coverage command runs 25 planner/transaction tests. Browser and package smoke checks are additional programs, not counted as unit tests.

| ID | Release criterion | Executed check / evidence |
|---|---|---|
| T01 | Existing monitor, parser, API, UI and startup regression | Original `tests/*.test.ts`, `scripts/ui-test.mjs`, legacy package startup/reuse in smoke |
| T02 | Strict schema/capability/version boundaries | `control-planner.test.ts`: hostile/oversized/unknown fields, manifests, version-family guards |
| T03 | Truthful detection and partial/offline sources | Original adapter/offline tests; CLI doctor, missing PATH, incompatible version, bounded probes; browser offline/recovery |
| T04 | Deterministic dependency/conflict planner | DAG/cycle/missing/required/optional/scope/proxy/hook cases plus 120 ordering permutations in planner tests |
| T05 | Profile persistence/CAS/import/export | Transaction CAS with 25 competing updates, reopen persistence, corrupt state and newer-schema refusal; CLI profile CRUD/export/import and immutable Baseline; browser real-API save |
| T06 | Scoped config safety | Synthetic TOML/hooks/MCP/AGENTS.md preservation, same-alias layering, disabled hooks, exact backups/undo, edited-owned-resource conflicts and unsafe parse tests |
| T07 | Concurrent managed sessions | Two distinct projects/profiles launched concurrently; isolated receipt/runtime/session ownership; external proxy survives |
| T08 | Terminal lifecycle | Fake agent real stdin/stdout/Unicode argv/cwd/nonzero exit; SIGINT/SIGTERM; separate allocated-PTY `scripts/tty-test.mjs` confirms inherited TTY identity |
| T09 | Ownership and recovery | Actual parent SIGKILL guardian cleanup, including the post-agent-exit/pre-owner-finalization window; child-handle/refcount/unowned tests; unknown/live/reused-PID locks; actual SIGKILL mid-transaction temp/journal recovery |
| T10 | RTK integration | Native JSON contract probe, reviewed shim registration, actual fake rewrite receipt, disabled/missing/duplicate hooks and original gain/history tests |
| T11 | Serena evidence | Real stdio relay with fake JSON-RPC initialize/initialized/list/call/failure; health alone never promoted; receipt names/counts |
| T12 | Headroom scope/failure | Fixed health checks, configured port guard, wrapper exit failure, external proxy survival, embedded-mode warning, isolated no-write real wrapper check |
| T13 | Memory/experimental tools | Guided-only detection; manifest execution rejection, memory-hook/proxy conflict tests; no capture/export paths |
| T14 | Security and bounds | Real control HTTP Host/Origin/CSRF/body/unknown/path/URL/exec rejection; symlink/junction parent swap; subprocess timeout/output cap; secret-marker receipt projection |
| T15 | Data accuracy | Original missing-vs-zero/cumulative/dedup/sampling tests; shared provenance, no combined savings or fictional session token deltas |
| T16 | UI E2E | Original browser suite + `control-ui-test.mjs`: real API profile/plan/setup/run/evidence/comparison, malicious import, approval gating, offline/recovery, keyboard, theme and phone/tablet/desktop |
| T17 | Install/archive/old and new CLI | `npm ci`, build/typecheck, public scan, package, smoke clean-installs actual TGZ and uses compiled adapters/server/CLI with fake binaries |
| T18 | Hosted platforms | `.github/workflows/ci.yml`: Linux/macOS/Windows × Node 22.14/24, plus Chromium; final actual run evidence in VALIDATION.md |
| T19 | Upgrade and interrupted writes | Existing legacy settings/app-data aliases and API tests; independent schema-versioned control DB; exact rollback and actual process-crash recovery |
| T20 | Honest comparisons | Parser validation; real completed-session references; task/model/Git/effort/quality attestations, shared-source confounders, elapsed-only UI comparison |

## Coverage and remaining boundaries

`npm run coverage` gates `server/control/planner.ts` and `transactions.ts` at ≥85% statements, branches, functions and lines. The measured local run achieved 100% statements/functions/lines and 92.69% aggregate branches (planner 100%; transactions 87.43%). Remaining transaction branches are mostly defensive filesystem/error alternatives; live-PID refusal, unowned locks, symlink swaps, concurrent edits, actual crash recovery and rollback are explicitly exercised. The newly added lock/temp identity-mismatch throw branches are not forced at that exact filesystem microstep; the strict inode/nonzero-device refusal matrix is exercised directly, alongside parent symlink/junction races. This is not whole-app coverage.

The OS matrix exercises Node filesystem/subprocess semantics and synthetic integrations. It does not prove every native tool build/version, administrator policy, terminal emulator, corporate endpoint or Codex authentication flow. TTY was tested on macOS; Linux/Windows hosted runners use ordinary process streams. No paid model call was made for this release. See [Validation](VALIDATION.md) for final command results and hosted evidence.
