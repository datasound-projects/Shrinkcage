# Install and use Shrinkcage

## Source / ZIP install

Install [Node.js 22.13+ with npm](https://nodejs.org/en/download). Download and extract the [main-branch ZIP](https://github.com/datasound-projects/Shrinkcage/archive/refs/heads/main.zip), or clone the existing repository. In its folder:

```sh
node scripts/start.mjs
```

This checks the runtime, installs missing project dependencies, builds the frontend/backend, starts one loopback server and opens `http://localhost:8790`. No optional optimizer is required. Keep the terminal open; Ctrl+C stops the application. Existing sessions remain owned by their separate launch terminals.

Alternative launchers: `./start.sh` on macOS/Linux, `start.cmd` or `.\start.ps1` on Windows. If PowerShell blocks scripts, use the Node command; changing execution policy is unnecessary. `OPEN_BROWSER=0` / `--no-open` suppress browser opening where supported. An existing Shrinkcage listener is reused; an unrelated process on 8790 is reported, never killed.

## Packaged CLI

Build a versioned archive and SHA-256 checksum with `npm run package`, or download a published archive when available. Install the actual artifact locally:

```sh
npm install -g ./release/shrinkcage-monitor-1.2.0.tgz
shrinkcage
```

The package identifier remains `shrinkcage-monitor`; its command is `shrinkcage`. The CLI works without a globally installed TypeScript runner. Node/npm remain prerequisites. In a source checkout, replace each `shrinkcage` command below with `node bin/shrinkcage.mjs` and run it from the Shrinkcage folder.

## Prepare your coding CLI and tools

Install and authenticate Codex or a supported modern Claude Code separately using its official flow. Shrinkcage neither installs agents nor changes their login. CLI version/help and native auth-status probes determine available capabilities. An installed but unsupported CLI remains available to read-only history discovery.

Install RTK/Serena/Headroom only if wanted. Use **Optimizers → Recheck tools** or:

```sh
shrinkcage doctor
shrinkcage tools
shrinkcage tool inspect rtk
```

Launch the dashboard from a terminal whose PATH contains your agents/tools. Restart the dashboard after changing its environment. On Windows, native executables and known npm Node sidecars are supported; arbitrary shell wrappers are not executed.

## Launch a session

Open another terminal. Review the plan, then approve the same fingerprint:

```sh
shrinkcage plan codex --billing subscription --profile balanced --project .
shrinkcage run codex --billing subscription --profile balanced --project .

shrinkcage run codex --billing api --profile lean --project .
shrinkcage run claude --billing subscription --profile balanced --project .
shrinkcage run claude --billing api --profile lean --project .
```

Use your actual project path after `--project` if the terminal is elsewhere. Windows paths such as `C:\Projects\my-app` work. Native authentication must match the declared billing mode; the flag does not switch accounts. Omit `--billing` for native detection, or use `unknown`/`hybrid` when the account/routing cannot be represented accurately.

New RTK hooks do not need persistent project setup. Review native hooks through the CLI's normal trust interface. Serena starts as a session-owned MCP. Headroom requires an already-running verified proxy and is only managed for Codex API sessions. A subscription Balanced plan omits managed Headroom instead of inserting an API gateway.

Each launch is independent, including concurrent sessions in the same project. Stop one with Ctrl+C in its own terminal. Keep the current development session untouched and start a new terminal to try a different stack.

## Choose tools, model and configuration

```sh
shrinkcage plan codex --billing api --profile custom --tools rtk,serena --model EXACT_MODEL_ID --project .
shrinkcage profile create my-stack --agent claude --tools rtk,serena --required rtk --fallback explicit
shrinkcage profile list
shrinkcage profile export my-stack
```

`--tools` is an explicit required stack; use `--tools none` for none. Baseline cannot include managed optimizers. Profiles support optional tools with explicit omissions or a blocking fallback. `--model` is optional; native defaults remain unchanged when omitted.

Codex MCP tool settings accept `timeoutSeconds` from 5–120, through profile JSON/UI or `--tool-config` JSON. Claude keeps native timeout policy. Unknown fields and arbitrary commands/paths are rejected. Native CLI arguments follow `--`, for example `-- --sandbox read-only` for Codex or `-- -p "your task"` for Claude. Scope-changing/resume/remote/config-injection arguments are rejected.

## Change a session's next-launch stack

In **Sessions**, select tools and choose **Save next-launch stack**, then **Preview restart plan**. The active process is unchanged. Review its warnings and use the new command in a terminal.

```sh
shrinkcage sessions show SESSION_ID
shrinkcage sessions configure SESSION_ID --tools rtk,serena
shrinkcage sessions plan SESSION_ID
shrinkcage sessions --offset 200 --limit 200 --json
shrinkcage sessions prune --days 90
```

Existing external hooks/routing can limit isolation. An off toggle only removes managed activation; it cannot silently disable inherited global RTK hooks. The plan explains exactly what remains inherited. Known external MCP aliases can be suppressed only where native process overrides safely support it.

## Prices and comparisons

Use **Settings → Billing, pricing & budget alerts** to enter exact-model USD rates and cache prices with a source/review date. No price or incremental subscription charge is guessed. `accounting show` exports these settings; `accounting import FILE.json` validates an edited version. [Accounting rules](ACCOUNTING.md) explain missing values, provider scope, budgets and API-equivalent estimates.

Run the same task with Baseline and an optimized stack, then use **Experiments** to compare available usage/elapsed time and record quality and equivalence checks. Shared savings are never summed. Uncontrolled runs remain descriptive.

## Troubleshooting

| Symptom | What to do |
|---|---|
| Node/npm missing or too old | Install a supported Node runtime including npm, reopen the terminal and retry |
| Tool missing in the app | Check PATH in the dashboard's launch terminal, install separately if wanted, then recheck |
| Installed Claude is unsupported | Upgrade through official Claude Code instructions; old builds such as 0.2.29 lack required managed interfaces |
| Billing conflict | Use the intended native login method or a truthful hybrid/unknown declaration; no credentials need to be pasted into Shrinkcage |
| Usage N/A | Confirm native hook trust, session persistence and recognized history formats; inspect the session's evidence/diagnostics |
| Cost N/A | Add exact-model prices and missing cache rates; partial, stale, unknown or mixed billing remains unpriced |
| Headroom offline / telemetry absent | Start your proxy separately. Enable its local telemetry with `HEADROOM_TELEMETRY=on` if needed |
| Serena dashboard reachable, MCP unverified | A heartbeat is only dashboard health. Look for owned MCP connection and successful call receipts |
| Requires restart | Preview and launch a new session; live reconfiguration is not supported |
| Stale approval | Preview again after account/profile/binary/config changes and use the new fingerprint |
| Legacy RTK setup conflict | Preview owned undo/recovery; never overwrite unrelated hooks. New sessions do not require persistent setup |
| Port 8790 occupied | Stop the app you own or reuse a verified Shrinkcage listener; Shrinkcage will not kill an unknown service |

Keep app data private. Configure approved history locations through **Connectors**, and use absolute `CODEX_HOME` / `CLAUDE_CONFIG_DIR` paths where set. See [compatibility](CONNECTORS.md), [security](../SECURITY.md) and [validation](VALIDATION.md). Historical 1.1 setup notes remain in the repository's `docs/history` directory.

## Guided setup and plugins

Quick setup detects native CLIs and billing evidence, approves one local project folder, recommends a compatible stack, and previews exact changes. Run the copied command from the downloaded Shrinkcage folder in a second terminal. Global installations may use `shrinkcage` instead of `node bin/shrinkcage.mjs`. No manual agent JSON editing is required. Native trust and authentication remain in the CLI.

Add Optimizer accepts safe candidates and SDK manifests. Approved foreground stdio plugins use typed settings and isolated protocol validation. Unknown interfaces remain Integration required. Updates/removal return review fingerprints; external software is preserved. See [plugins](PLUGINS.md) and [compatibility](COMPATIBILITY.md).
