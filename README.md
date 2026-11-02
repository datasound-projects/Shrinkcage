<p align="center"><img src="public/icon.svg" width="52" alt="Shrinkcage" /></p>

# Shrinkcage

**Local-first token and cost optimization for AI coding sessions.**

Choose a stack for each Codex or Claude Code session. See what actually ran, understand usage and compare results without guessing at savings.

[![Build and tests](https://github.com/datasound-projects/Shrinkcage/actions/workflows/ci.yml/badge.svg)](https://github.com/datasound-projects/Shrinkcage/actions/workflows/ci.yml)

[Download ZIP](https://github.com/datasound-projects/Shrinkcage/archive/refs/heads/main.zip) · [Setup help](docs/SETUP.md) · [Supported tools](docs/COMPATIBILITY.md) · [Report a problem](https://github.com/datasound-projects/Shrinkcage/issues)

## Download, install and open

1. Install [Node.js 22.13 or newer](https://nodejs.org/en/download), including npm.
2. [Download Shrinkcage](https://github.com/datasound-projects/Shrinkcage/archive/refs/heads/main.zip) and extract it.
3. Open a terminal in that folder and run:

   ```sh
   node scripts/start.mjs
   ```

This installs dependencies, builds the app and opens **[localhost:8790](http://localhost:8790)**. Keep the terminal open; press **Ctrl+C** to stop. macOS/Linux users can run `./start.sh`; Windows users can use `start.cmd` or `.\start.ps1`.

No Docker, cloud service or Shrinkcage account is needed. Install and sign in to your coding CLI separately. Optional tools can be absent.

![Shrinkcage silver workspace — illustrative test data](docs/images/overview.png)

## Start your first session

1. Open **Projects** and click **Add project**. Choose its folder in the native dialog.
2. Select the project and click **New session**. Pick Codex or Claude Code.
3. Keep the recommended tools or switch them on/off for this session. Billing can stay on **Detect automatically**.
4. Choose a detected **Terminal** (a single terminal is selected automatically). Leave **Remember my choice** on to save a default, or turn it off for this session only. Use **Rescan terminals** after installing or removing an app.
5. Click **Review session**, check the changes and approve. Click **Open in Herdr**.
6. Work in Herdr. Detach with **Ctrl+B, then Q**. Choose **Reopen in Herdr** in Shrinkcage to return to the same running session.

Browser launches always use a separate Herdr session. Install a reviewed **Herdr 0.9.5+ in the 0.9 family** on macOS/Linux first; Shrinkcage does not install it automatically. A stopped server or computer restart does not keep live agent processes running. Windows Herdr launching remains unsupported. Native sign-in, project trust and approvals still apply. [Terminal support and safeguards →](docs/TERMINALS.md)

- **Overview:** recent sessions and separate optimizer contributions.
- **Projects:** choose a folder, see its sessions, pick tools for each and reopen Herdr. Profiles and saved history are available as secondary views.
- **Optimizers:** a reviewed registry, local installations and validation details.
- **Cost & usage:** reported tokens, qualified price estimates and controlled comparisons.
- **Settings:** local discovery, billing, prices, privacy and diagnostics.

Open **How to use** at the bottom of the sidebar for the in-app manual. It covers each feature in short steps, with links to the right screens. On phones, the guide link sits below the main navigation. The guide also works when metric sources are offline.

One screen is shown at a time. Context tabs hold secondary tools; drafts survive navigation. Choose silver or graphite appearance. Existing deep links still work, even when a metrics source is offline.

![Projects, sessions and independent tool choices — illustrative test data](docs/images/projects.png)

[See the session launch screen](docs/images/start-session.png).

## Launch from your terminal

From the Shrinkcage folder:

```sh
# Codex with a ChatGPT subscription
node bin/shrinkcage.mjs run codex --billing subscription --profile balanced --project "/path/to/project"

# Claude Code with API billing
node bin/shrinkcage.mjs run claude --billing api --profile lean --project "/path/to/project"
```

Replace the path with your project folder, for example `C:\Projects\my-app` on Windows. Review the plan and enter its first eight fingerprint characters when prompted. The CLI opens in that terminal. **A billing label does not change your login.** Codex API billing and Claude subscriptions are also supported.

Each launch has its own ID, tools and configuration, including concurrent sessions in the same project. Stack edits prepare the next launch; they do not reconfigure a running agent. Existing external hooks can limit isolation, and the plan explains that limitation. Native sandbox, trust and approval rules remain in place.

For a global `shrinkcage` command, run `npm run package`, then `npm install -g ./release/shrinkcage-monitor-1.8.0.tgz`. ZIP users can keep using `node bin/shrinkcage.mjs`. [Full CLI reference →](docs/SETUP.md)

## What works

| Integration | Support |
|---|---|
| Codex CLI | Managed sessions, native usage and subscription/API billing awareness |
| Modern Claude Code | Managed sessions, native usage and subscription/API billing awareness; version 2.1+ and required interfaces are checked |
| RTK | Session-scoped output-rewrite hooks; shared output-token estimates |
| Serena | Session-owned MCP with observed calls; shared dashboard monitoring |
| Headroom | Codex and Claude subscription/API sessions through an existing verified local proxy; shared compression metrics |
| SDK v2 MCP plugins | Approved local stdio servers, typed settings, protocol checks and owned removal |
| Gemini CLI | Read-only saved-session discovery and usage |
| Other registry tools | Scoped catalog review and guidance; automatic activation requires a reviewed adapter |

**Installed, configured and observed are different states.** The registry ships offline with ten reviewed entries. Other discoveries stay in a review queue; Token Savior remains under review. Unknown interfaces stay **Integration required**. Nothing downloads and runs repository code or silently updates executables. [Registry guide](docs/REGISTRY.md) · [Plugin SDK](docs/PLUGINS.md)

## Read the numbers correctly

Headroom and RTK savings can overlap and are never added together. Serena activity is not converted into fictional savings. Missing measurements stay N/A.

Configure exact-model prices in Settings to see estimates. API spending and subscription API-equivalent value remain separate; fewer subscription tokens do not automatically mean money saved. Summaries and budget alerts count a repeated native usage scope once. Conflicting billing declarations withhold monetary attribution, and stale/overlapping usage cannot qualify a before/after experiment. [Accounting details →](docs/ACCOUNTING.md)

## Privacy, testing and help

Shrinkcage stores allowlisted metadata, not prompts, source code, tool arguments/results or OAuth credentials. Authentication stays with the native CLI. Approved local programs retain OS permissions; a private validation workspace is not an OS sandbox.

Tests cover supported agent/billing/tool combinations, real isolated subprocess launches, accounting, cleanup, failure recovery and browser workflows. CI runs macOS, Windows and Linux with Node 22/24. Native interface and MCP checks are distinct from authenticated model-backed quality/savings tests; universal compatibility or perfect optimization is not claimed. Screenshots use labeled test data. [Executed checks and limits →](docs/VALIDATION.md)

[Setup & troubleshooting](docs/SETUP.md) · [Architecture](docs/CONTROL_PLANE.md) · [Privacy](docs/PRIVACY.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)

The interface keeps everyday actions visible. Expand **Policy & settings** for profile rules, **Coverage, budget & accounting rules** for usage context, and **Catalog source & last sync** for registry provenance. Launch errors, compatibility blockers and approval controls remain visible. All existing tools, advanced settings, history and diagnostics remain available.
