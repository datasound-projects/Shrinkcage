# Session optimization control plane · 1.4

Shrinkcage composes, validates and observes optimization stacks around owned CLI processes. React, the Node server, SQLite, the existing collectors and the terminal CLI remain in the original project.

## One engine, two interfaces

`server/control/core.ts` coordinates discovery, profiles, projects and planning. The CLI and `/api/control/v1` use the same validated types and state. Browser actions save metadata, return previews and can open a reviewed native-terminal launch. They cannot execute arbitrary commands, install packages or stop processes. [Terminal launch design](TERMINALS.md) describes the strict fingerprint-only request, five-minute single-use approval, idempotency and fresh CLI validation. A narrowly scoped, explicitly approved SDK diagnostic can probe only an unchanged local program registered and approved previously in the terminal.

Each approved plan binds the application/adapter version, agent, executable identities, profile revision, project identity, billing evidence, model override, selected tools, tool configuration and inspected configuration hashes. The launcher rechecks the plan before spawning. A changed account, file, binary or profile invalidates approval.

```sh
shrinkcage plan codex --billing subscription --profile balanced --project .
shrinkcage run codex --billing subscription --profile balanced --project .
shrinkcage run claude --billing api --profile lean --project .
shrinkcage sessions show SESSION_ID
```

Interactive runs require review of the fingerprint. Noninteractive runs require `--approve FULL_FINGERPRINT` from a current preview. `--` passes native agent arguments, subject to ownership, routing and configuration guards. Native model/effort, sandbox and approval choices are preserved; Shrinkcage adds no permission bypass.

## Independent sessions

Every launch has a random ID, an ownership token whose hash is stored, an owned supervisor, a private runtime directory, independent tool settings and a recent owner heartbeat. Multiple sessions may run in the same project. They do not use temporary global configuration rewrites or a project-wide launch lock.

- **Codex:** embedded `--no-daemon` mode and documented process `--config` overrides. New RTK hooks need no project-file setup. Known external Serena/Headroom MCP aliases may be suppressed or replaced for this process only, with explicit plan warnings.
- **Claude:** a fresh `--session-id`, inline `--settings` hooks and a strict process MCP configuration. External MCP servers are omitted in this new process, including an empty baseline; native permission settings, inherited hooks and administrator restrictions still apply. Serena uses its native `claude-code` context.
- **RTK:** a reviewed native `rtk hook AGENT` subprocess rewrites input. Codex's PreToolUse contract requires `allow` with a rewrite; its result is not a PermissionRequest approval. Claude rewrites omit `allow`, preserving its permission evaluation. Original tool-input fields remain intact.
- **Serena:** a dedicated stdio server/relay belongs to the session. Project indexes or language-server dependencies remain Serena's behavior and can be shared on disk; process configuration isolation is not filesystem sandboxing.
- **Headroom:** Codex **API-billed** sessions can reuse an independently started, verified loopback proxy with `wrap codex --no-proxy --no-mcp --code-memory none`. No proxy ownership or subscription gateway is assumed. Proxy savings remain shared.

Native hook trust and managed policies are never bypassed. Unsupported interfaces block required tools or produce explicit optional omissions. A checkbox is intent, not proof of installation or execution.

## Exact isolation limits

Native configuration layers merge hooks. Individual external RTK hooks cannot reliably be suppressed by an overlay. The installed RTK 1.1.0 still rewrites hook input with `RTK_DISABLED=1`; Shrinkcage does not claim that variable disables an inherited hook. An unselected managed RTK tool can therefore remain externally inherited, and the plan states that limitation.

Codex user, ancestor and project configuration is inspected conservatively. Claude user/project/local settings are inspected without opening OAuth files. Unknown aliases, plugins and administrator policy can add behavior outside this audit. Native activation receipts remain required.

Existing Headroom routing is a separate dependency: its retrieval MCP is preserved when removing it would break external compression. Such a baseline is explicitly not isolated. Claude launches with externally inherited Headroom routing are blocked because this release cannot safely replace that integration.

Session stack edits are stored separately from running session records. They show **Requires restart** and produce a fresh, independent terminal launch plan. No hot reconfiguration or automatic restart is performed. Discarding a pending edit leaves both the current process and original launch configuration intact.

## Profiles and policy

| Profile | Policy |
|---|---|
| Baseline | No Shrinkcage-managed optimizers; inherited effects are disclosed |
| Lean | Optional RTK |
| Balanced | Compatible RTK, Serena and Headroom; optional omissions shown |
| Maximum Savings | Full reviewed stack; blocks any unavailable tool; currently Codex API only |
| Custom | Explicit tools and supported configuration |
| Memory | Backward-compatible RTK/Serena preset with guided codemem omission |

Custom profiles retain required/optional tools, priority and explicit/block fallback. Composition resolves dependencies, cycles, conflicts, duplicate hooks and mutually exclusive routes before launch. Codex MCP request timeouts can be configured from 5–120 seconds. Claude keeps its native timeout policy in this release. Maximum Savings is a stricter compatibility policy, not a guarantee of quality or a proven savings ranking.

## Evidence and accounting

Configured → connected → observed use are separate states. MCP receipts require matched initialization and successful responses. RTK receipts prove a native hook rewrite, not a successful terminal command or financial savings. Only safe names, counts and observation timestamps are retained.

Passive SessionStart/SessionEnd hooks correlate a native ID, approved transcript location and project to the owned launch. Existing bounded metadata parsers extract usage without retaining task payloads. Source formats are version-dependent; unavailable, stale or sampled records cannot establish a complete cost. [Accounting rules](ACCOUNTING.md) define overlapping token categories, billing evidence and price estimates.

Experiments compare native usage, qualified costs and whole-launch elapsed time. Model, project, agent/version, billing, successful exit, observed optimizer use, task quality and user-attested controls affect eligibility. Unrelated runs remain descriptive; no causal savings claim is generated. Recommendations are rule-based and never reconfigure or interrupt an agent.

## Storage, cleanup and compatibility

SDK v2 adds private optimizer registrations, approved executable bindings, pinned runtime snapshots, candidates and retained seven-gate reports. Semantic storage version 3 retains the v1 SQLite compatibility floor. Discovery limits native probe jobs to two at a time, caches version/help probes for 60 seconds and refreshes before launch; source changes cannot execute without renewed approval. The generic stdio template accepts typed configuration and uses a minimal environment/private HOME. Running sessions retain their version when a registration updates; removal refuses active/recovering references. [SDK lifecycle and trust model](PLUGINS.md).

Quick setup discovers native CLIs/billing, registers an explicitly approved project, recommends a deterministic compatible stack, and previews the next terminal run. The Library adds safe candidate inspection and typed options. The Validation center retains context-specific evidence; seven gates distinguish preflight, fixture/protocol tests, observed runtime use and unavailable quality proof. Recommendations are capability rules, not unmeasured savings rankings.

SQLite retains private profiles, project references, managed metadata, ownership proofs, receipts, comparisons, price settings and pending session preferences. Schema additions are transactional. The v1 SQLite compatibility floor is retained so an already-running legacy launcher or guardian can reopen its store while finishing; existing session JSON is not rewritten during migration. Existing-store opens perform no schema write once additions exist.

Cleanup signals live owned child handles, never a PID discovered from history. The guardian finalizes abandoned metadata after an owner crash. External Headroom proxies, Serena dashboards, installations and unrelated processes survive. Runtime receipts are bounded to 1 MiB/10,000 entries; native usage reads are bounded to 8 MiB or a sampled 64 KiB head/2 MiB tail and cached while unchanged.

Managed metadata defaults to 90 days, maximum 2,000 records. Profiles: 100; projects: 200; comparisons: 100; audit: 500; setup receipts: 200; imported guided entries: 30; exact-model prices: 64. The UI starts with 50 sessions and pages older records; CLI lists default to 200. Costs/charts summarize the latest 50 and budget recommendations the latest 200, explicitly excluding missing or older usage.

## Legacy persistent RTK setup

`tool setup rtk --project . --dry-run` and separately approved `tool undo rtk` remain available. The original lock, durable journal, private backup, inode/parent checks, compare-before-write, atomic rename and merge-aware rollback are preserved. Only recorded `.codex/hooks.json` and `.codex/shrinkcage-rtk.mjs` changes are owned. Unrelated hooks, global config, AGENTS.md and external binaries are preserved. An unsafe rollback reports a conflict instead of overwriting another edit.

The [1.1 architecture record](https://github.com/datasound-projects/Shrinkcage/blob/main/docs/history/CONTROL_PLANE_1_1.md) remains available for historical behavior. Current adapter capabilities are in [Optimizers](OPTIMIZERS.md).

## Curated registry architecture

`server/registry` separates public catalog types/schema, fixed-host metadata transport, deterministic discovery, eight-gate admission, scheduling and the local registry service. The versioned `registry/` snapshot is distributed with the app. Optional updates verify an immutable commit, Git blobs, SHA-256, schema and monotonic revision. SQLite schema 4 adds bounded private candidate/document/job/cache storage while retaining the compatibility floor.

The top-level Registry UI reads schema-driven metadata; the Local Library retains native discovery and seven integration gates. Public approval is scoped independently from local installation/activation. Add-to-Stack delegates to the existing control planner with a transient profile, rechecks inherited settings, and binds approval to the catalog digest and destination revision. Saves use profile revisions or pending-session compare-and-swap. A later terminal launch revalidates again. Suspended/deprecated adapters block new affected launches without touching running processes. No generic execution or installer route was added. See [registry contracts, admission and retention](REGISTRY.md).

## Focused frontend

Five primary destinations map existing hash IDs to contextual screens. Screen.tsx lazily mounts visited screens and retains drafts while hiding inactive controls. Native dialogs close on departure; metrics readiness no longer gates routing. The shared control hook stays mounted and top-level Refresh rechecks control discovery and read-only connectors alongside shared telemetry. Registry and all previous controls remain available through their existing deep links.

The pure usage-summary helper is shared by UI totals and backend budget recommendations. It deduplicates cumulative native identities, selects fresh observations and withholds conflicting billing attribution. Experiment eligibility additionally rejects stale, overlapping and mixed-model evidence. These changes do not rewrite stored session history or change launch/process permissions.
