> Historical reference for Shrinkcage 1.1. See the current documentation for shipped behavior.

# Optimization control plane · 1.1

The monitor and the control plane are separate. Existing collectors remain read-only. New browser actions save Shrinkcage metadata or produce previews; they cannot execute commands, install tools, start/stop agents, or write agent configuration. Approved terminal commands perform managed launches and the narrowly scoped RTK setup transaction.

## Onboarding and commands

Use `shrinkcage --help` for exact supported syntax. From a built source checkout, substitute `node bin/shrinkcage.mjs` for `shrinkcage`.

```sh
shrinkcage doctor --json
shrinkcage tools --json
shrinkcage tool inspect serena
shrinkcage tool verify headroom
shrinkcage profile list --json
shrinkcage profile show balanced
shrinkcage profile create review --tools rtk,serena --required rtk
shrinkcage profile edit review --name "Code review" --fallback explicit
shrinkcage profile export review
shrinkcage profile import ./review.json
shrinkcage plan codex --profile review --project . --json
shrinkcage run codex --profile review --project . -- --model YOUR_MODEL
shrinkcage sessions --json
shrinkcage sessions export SESSION_UUID
shrinkcage sessions remove SESSION_UUID
shrinkcage sessions prune --days 90
```

`tool verify` checks the installed fixed interface and service evidence; it does not contact a model or prove Codex used a tool. Installation, upgrade and binary removal are **guided** through each tool's official documentation. Unsupported lifecycle commands fail with guidance; there is no general-purpose installer.

Profiles are versioned JSON with strict unknown-key validation. Baseline is immutable. Presets can be customized; custom profiles can be removed. Revisions use compare-and-swap so a stale browser cannot overwrite a later edit. Import cannot add executable code. Example:

```json
{
  "schemaVersion": 1,
  "id": "review",
  "name": "Code review",
  "description": "RTK required; Serena optional",
  "agent": "codex",
  "scope": "process",
  "fallback": "explicit",
  "tools": [
    {"id": "rtk", "enabled": true, "required": true, "priority": 0},
    {"id": "serena", "enabled": true, "required": false, "priority": 1}
  ]
}
```

Supported preset intent: Baseline selects no optimizers; Lean selects RTK; Balanced selects RTK/Serena/Headroom; Memory adds guided codemem to RTK/Serena and explicitly reports its omission. Baseline does not disable existing external hooks, MCP or provider routing; these appear as confounders. `fallback: block` blocks unavailable selected tools; `explicit` permits only reported optional omissions. Mandatory tools always block on incompatibility.

## Preview and approval

A plan contains selected/omitted tools, scopes, ordered actions, dependency/conflict checks, configuration digests, executable identities, version compatibility, project reference, warnings and a deterministic fingerprint. Observation timestamps do not change the fingerprint. Configuration, profile revision, executable identity or relevant availability changes do.

`plan --project .` validates and privately registers the canonical project directory. The browser receives an opaque project ID and basename, not its full path. Browser project choices come from this registry; the control API does not accept arbitrary roots or URLs. Later commands may use `--project-id ID`.

An interactive run asks for the first eight characters of the current fingerprint. For deliberate noninteractive execution, use `--approve FULL_FINGERPRINT`. Setup/undo always require the full preview fingerprint. Approval is checked again immediately before resource creation. A failed preflight creates no phantom managed run.

The browser requires a review checkbox before copying an approved launch/setup command. Copying is the final browser action: run that command yourself in the project terminal. There is no browser shell endpoint and no automatic process launch on a tool toggle.

## RTK project setup and recovery

```sh
shrinkcage tool setup rtk --project . --scope project --dry-run
shrinkcage tool setup rtk --project . --approve FULL_FINGERPRINT
shrinkcage tool undo rtk --project . --dry-run
shrinkcage tool undo rtk --project . --approve FULL_FINGERPRINT
```

Only these owned project files can be changed:

- `.codex/hooks.json`: append one reviewed native PreToolUse/Bash hook group while preserving unrelated hooks and top-level keys.
- `.codex/shrinkcage-rtk.mjs`: reviewed adapter shim that calls fixed `rtk hook codex` with bounded stdin/output and records only successful rewrite names/counts for a verified managed owner.

Codex still requires its normal hook trust. Shrinkcage never writes trust approval, flips disabled hook policies, edits `AGENTS.md`, rewrites global `config.toml`, installs RTK or changes authentication. JSON formatting may be normalized during setup; exact original bytes are backed up and restored when safe.

The transaction uses a project lock plus a private SQLite ownership proof, durable journal, restrictive backups, parent/file identity checks, compare-before-write and atomic rename. A concurrent edit or symlink swap aborts. An owned interrupted lock can be reclaimed only after its recorded process is gone; an unknown lock or an alive/reused PID is never treated as ownership. Persisted PIDs are never used to terminate processes.

After a partial failure, completed writes are rolled back if unchanged. A fresh setup preview can recover an owned interrupted receipt and temporary inode. Undo restores exact original bytes when possible, or removes only the exact owned hook while retaining unrelated later edits. Modified/duplicated owned files cause a conflict requiring manual review. Keep the private backups; do not erase app data before undoing project hooks.

Windows Node 22 can report a missing path-stat device while handle-stat supplies the volume identity; the compatibility guard permits only that missing-device case. Inodes remain exact BigInts for bounded reads; nonzero device mismatches, symlink/replacement changes and canonical-path changes still fail. Lock/temp receipts compare identity captured from the same path-stat API. This addresses the hosted Windows failure without disabling file ownership checks. See the [libuv Windows filesystem implementation](https://github.com/libuv/libuv/blob/v1.49.2/src/win/fs.c) and the PR validation history.

## Managed runtime and ownership

Codex inherits terminal stdin/stdout/stderr, project working directory, model/policy arguments and exit code. `--` separates Shrinkcage arguments from Codex arguments. No shell is used. Project-changing/remote/worktree flags are rejected because they invalidate approved project scope. For optimized runs, conflicting Codex profiles/provider/MCP/hook overrides are rejected too; ordinary model and reasoning-effort choices remain yours.

Managed optimizers require Codex **`--no-daemon`**: scoped `--config` overrides apply to the embedded process, not a shared background server. This tradeoff is included in the plan. Shrinkcage does not bypass sandboxing, approvals or hook trust.

Each launch has a random session ID and owner token, hashed ownership record, heartbeat and private runtime directory. A child supervisor owns the real process handle. On Windows it is a hidden detached guardian with inherited streams and live IPC so the owner’s libuv job teardown cannot kill the guardian before recovery; the agent itself remains its owned child. It remains alive until the owner acknowledges durable final metadata/runtime cleanup; owner loss during final snapshots still triggers guardian recovery. Ctrl+C/SIGTERM propagate to that owned child; unexpected owner disconnection invokes its guardian. Cleanup never rediscovers a PID to kill and never stops an external proxy/dashboard. Stale heartbeat becomes abandoned metadata, not proof a historical PID is safe to signal. Resource-pool tests cover reference counting and unowned resources; this release reuses an external Headroom proxy and does not own a shared proxy daemon.

Serena/Headroom MCP relays forward stdio in memory. Only successful protocol initialization and safe tool names from matched successful responses become receipts. Startup configuration is not a handshake; a handshake is not usage; a tool call is not token savings. Unexpected child exit or failed responses can degrade evidence. Receipt timestamps are observation times, not recovered execution timestamps.

## Tool-specific limits

- **RTK 1.1.x:** native Codex rewrite interface; existing external native hooks are detected and reused rather than duplicated. External hooks may not emit Shrinkcage receipts, so usage remains inconclusive. No inferred session token reduction.
- **Serena 2.x, minimum 2.1.0:** launches its supported stdio server with project-from-cwd, Codex context and dashboard/log-window suppression. Serena may create project metadata/indexes and prepare language-server dependencies. Such agent/tool behavior is outside Shrinkcage's metadata store.
- **Headroom 0.42.x:** uses `wrap codex --no-proxy --no-mcp --code-memory none --port PORT -- ...` and a separately owned retrieval MCP. A verified existing local proxy is required. `SHRINKCAGE_HEADROOM_PORT` accepts only a numeric loopback port 1024–65535 excluding 8790; default 8787. No proxy installation, auto-start, auto-stop, persistent provider edits or extra memory setup. Headroom's own upstream/provider behavior and proxy privacy settings remain the owner's responsibility.
- A conventional existing MCP alias named `serena` or `headroom` may be disabled **only for this process** and replaced with the owned relay after an explicit plan warning. Saved entries remain untouched. Ambiguous aliases, duplicate hooks, reserved names, malformed config and incompatible versions fail closed or omit optional tools.
- Detection inspects the known user/project Codex config and hook files. Enterprise policies, ancestor-project config, arbitrary plugins, unusual aliases and future CLI behavior may add settings not fully modeled. Receipt evidence is required before claiming actual use. Do not treat a successful plan as a complete audit of external agent configuration.
- **codemem / LiteLLM / Langfuse:** guided only. No plugin setup, memory capture, account setup, gateway chaining or trace transmission occurs. Memory hook conflicts and exclusive routing conflicts are modeled even though these adapters cannot activate.

## Extending the catalog

`shrinkcage extension inspect FILE.json` validates without importing; `extension import` saves declarative preview metadata only. The full versioned schema requires catalog metadata (identity, HTTPS source, layers, permissions, supported agents/platforms, mechanism, guidance and limitations) with guided mode and no executable dependency graph. It rejects unknown fields, executable/install/hook/environment payloads, reserved IDs and unsupported capabilities. It never fetches a URL or loads code from a manifest. HTTPS links are documentation, not executable sources.

A working lifecycle adapter requires a reviewed code change implementing `detect`, `plan`, `apply`, `verify`, `observe`, `undo`; ownership and version contracts; and isolated regression/security/platform tests. Do not promote a guided catalog entry merely because a binary or HTTP page exists. See `server/control/types.ts`, `catalog.ts`, `adapters.ts`, the pure planner and the T01–T20 matrix.

## Benchmarks and metrics

A comparison references two actual completed managed records. It retains explicit user attestations of task/Git/model/effort equivalence and a quality result. The UI warns about missing attestations, shared/external hooks/routing and elapsed-launch overhead. No prompt/task content, Git checkout, pricing lookup or model request is needed to save a comparison.

Metrics include source, observation time, scope, method, confidence, coverage, version availability and estimate flag. Shared RTK/Headroom snapshots are context, not deltas attributed to the run. Managed hook/MCP observations are operational counts. No total combines overlapping savings; no synthetic cost or token reduction is produced for Serena or memory tools.
