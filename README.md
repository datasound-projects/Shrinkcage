<p align="center"><img src="public/icon.svg" width="52" alt="Shrinkcage" /></p>

# Shrinkcage

**Local-first token and cost optimization for AI coding sessions.**

Choose an optimization stack for each Codex or Claude Code session. Check what actually ran, understand its usage, and compare results without guessing at savings.

[![Build and tests](https://github.com/datasound-projects/Shrinkcage/actions/workflows/ci.yml/badge.svg)](https://github.com/datasound-projects/Shrinkcage/actions/workflows/ci.yml)
[Download ZIP](https://github.com/datasound-projects/Shrinkcage/archive/refs/heads/main.zip) · [Setup help](docs/SETUP.md) · [Compatibility](docs/CONNECTORS.md) · [Report a problem](https://github.com/datasound-projects/Shrinkcage/issues)

## Download, install and open

1. Install [Node.js 22.13 or newer](https://nodejs.org/en/download), including npm.
2. [Download Shrinkcage](https://github.com/datasound-projects/Shrinkcage/archive/refs/heads/main.zip) and extract it.
3. Open a terminal in that folder and run:

   ```sh
   node scripts/start.mjs
   ```

This installs the app's dependencies, builds it and opens **[localhost:8790](http://localhost:8790)**. Keep the terminal open; press **Ctrl+C** to stop. On macOS/Linux, `./start.sh` also works. Windows users can use `start.cmd` or `.\start.ps1`.

No Docker, cloud service or Shrinkcage account is needed. Optional tools can be absent. Your coding CLI keeps its own login, sandbox and approval rules.

Open **Quick setup**: detect your CLIs, choose billing and a project, pick a recommended stack, and review its exact changes. Copy the launch command into a second terminal in the Shrinkcage folder. No JSON editing is needed. The Validation center separates installation, compatibility and actual session activity. [Preview the setup wizard](docs/images/quick-setup.png).

## Launch an optimized session

Install and sign in to your coding CLI separately. Then, in a **second terminal in the Shrinkcage folder**, run:

```sh
# Codex with a ChatGPT subscription
node bin/shrinkcage.mjs run codex --billing subscription --profile balanced --project "/path/to/project"

# Claude Code with API billing
node bin/shrinkcage.mjs run claude --billing api --profile lean --project "/path/to/project"
```

Replace the path with your project folder, for example `C:\Projects\my-app` on Windows. Read the plan and enter its first eight fingerprint characters when prompted. The CLI opens in that terminal. **A billing label does not change your authentication.** Codex API billing and Claude subscriptions are also supported.

Each launch gets its own ID, tools and configuration, including simultaneous sessions in the same project. New RTK hooks and MCP overrides expire with that session. Existing external hooks can limit isolation; the plan tells you when a tool cannot be independently disabled.

For a global `shrinkcage` command, run `npm run package`, then `npm install -g ./release/shrinkcage-monitor-1.2.0.tgz`. Source/ZIP users can keep using `node bin/shrinkcage.mjs`. [Full setup and CLI reference →](docs/SETUP.md)

## What you can do

- **Sessions:** inspect active and past launches, native usage, tool evidence and independent next-launch stacks.
- **Optimizers:** discover installed tools, inspect compatibility and follow safe installation guidance.
- **Add tools:** inspect GitHub/local candidates or import manifests; approved stdio MCP plugins work through the versioned SDK without changing the session runner.
- **Validation:** see seven gates, actionable failures, version changes and explicit update/rollback previews.
- **Profiles:** build reusable stacks, preview omissions and review an exact terminal command.
- **Cost & Usage:** separate API estimates from subscription API-equivalent value; configure exact-model prices, cache rates and budget alerts.
- **Experiments:** compare baseline and optimized sessions with quality checks and visible confounders.

![Shrinkcage session controls — illustrative test workspace](docs/images/managed.png)

## What works today

| Integration | Support |
|---|---|
| Codex CLI | Managed sessions with subscription/API billing awareness; native metadata and usage |
| Claude Code | Managed sessions with subscription/API billing awareness on supported modern versions |
| RTK | Session-scoped native output-rewrite hooks; shared token-reduction estimates |
| Serena | Session-owned MCP with observed tool names and calls; shared dashboard monitoring |
| Headroom | Codex API routing through an existing verified proxy; shared compression metrics |
| SDK v2 MCP plugins | Approved local stdio servers; typed session settings, protocol tests, observed calls and owned removal |
| Gemini CLI | Read-only saved-session discovery and usage |
| context-mode, LeanCTX, codemem, LiteLLM, Langfuse | Guided catalog entries; no automated activation |

**Installation, configuration and observed use are separate states.** Browser controls prepare launches; agents start in your terminal. Stack edits show **Requires restart**. Native hooks still need the CLI's normal trust review.

Try the bundled example with `node bin/shrinkcage.mjs optimizer add-example`, review its fingerprint, then repeat with `--approve FINGERPRINT`. Unknown interfaces stay **Integration required**. Shrinkcage never downloads and runs repository code. Approved local executables retain your OS permissions; a private validation workspace is not an OS sandbox. [Plugin guide →](docs/PLUGINS.md)

**Numbers stay honest:** missing values show N/A; Headroom and RTK savings are never added. Subscription token reductions do not automatically mean money saved. Costs use explicitly configured prices and remain estimates unless a source reports a charge. Native usage, limits and billing coverage vary by CLI version. [Accounting details →](docs/ACCOUNTING.md)

## Help, privacy and contributing

Shrinkcage stores allowlisted metadata, not prompts, code or tool arguments/results. Authentication stays with the native CLI. It never reads OAuth credential files, silently installs agents or rewrites global agent settings. Monitoring remains available when a connector fails.

[Setup & troubleshooting](docs/SETUP.md) · [Architecture](docs/CONTROL_PLANE.md) · [Compatibility](docs/COMPATIBILITY.md) · [Optimizer SDK](docs/PLUGINS.md) · [Privacy](docs/PRIVACY.md) · [Security](SECURITY.md) · [Validation](docs/VALIDATION.md) · [Contributing](CONTRIBUTING.md)

Screenshots use clearly labeled test data. CI exercises macOS, Windows and Linux with isolated fake CLIs; authenticated model-backed combinations are not universally verified. [MIT license](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md).
