<p align="center"><img src="public/icon.svg" width="52" alt="Shrinkcage" /></p>

# Shrinkcage

**Local-first token and cost optimization for AI coding sessions.**

Choose tools per Codex or Claude Code session. Track their activity and reported usage.

[![Build and tests](https://github.com/datasound-projects/Shrinkcage/actions/workflows/ci.yml/badge.svg)](https://github.com/datasound-projects/Shrinkcage/actions/workflows/ci.yml)

[Download ZIP](https://github.com/datasound-projects/Shrinkcage/archive/refs/heads/main.zip) · [Setup help](docs/SETUP.md) · [Supported tools](docs/COMPATIBILITY.md) · [Report an issue](https://github.com/datasound-projects/Shrinkcage/issues)

## Install and open

1. Install [Node.js 22.13+ with npm](https://nodejs.org/en/download).
2. Download the ZIP above and extract it.
3. Open a terminal in the extracted folder and run:

   ```sh
   node scripts/start.mjs
   ```

This installs dependencies, builds the app and opens **[localhost:8790](http://localhost:8790)**. Keep the terminal open. Press **Ctrl+C** to stop.

Alternative launchers: `./start.sh` on macOS/Linux; `start.cmd` on Windows. No Docker, cloud service or Shrinkcage account is required.

## Start a session

1. **Projects → Add project:** choose your project folder.
2. **New session:** choose Codex or Claude Code and billing mode. Use **Detect automatically** if unsure.
3. Choose tools and a detected terminal. **Remember my choice** saves your terminal preference.
4. Click **Review session**, approve the changes, then **Open in Herdr**.

Use **Reopen in Herdr** to return to a running session. To detach, press **Ctrl+B, then Q**.

Sign in through your CLI. Browser launches require **Herdr 0.9.5+ (0.9.x)** on macOS/Linux; Windows browser launching is unsupported. Detaching preserves sessions; computer restarts do not. [Terminal setup](docs/TERMINALS.md) · [CLI commands](docs/SETUP.md)

## What each screen does

Secondary screens appear in tabs under their main sidebar section.

| Screen | Use it to |
|---|---|
| Projects & sessions | Add folders, find sessions and reopen Herdr. |
| New session | Pick an agent, tools and terminal; review before launching. |
| Profiles | Save reusable tool setups and advanced settings. |
| Saved history | Browse recorded CLI sessions by project, agent or model. |
| Overview | See recent sessions and separate optimizer activity. |
| Optimizer Registry | Find tools, check support and add reviewed adapters. |
| Installed tools | Inspect local tools, configuration and health. |
| Validation | Check compatibility and find setup fixes. |
| Headroom | View reported context compression and proxy history. |
| RTK | View estimated output reductions and command history. |
| Serena | See tool calls, activity logs and dashboard availability. |
| Cost & usage | Read tokens, reported charges and qualified cost estimates. |
| Shared analytics | Explore shared optimizer history. |
| Experiments | Compare completed baseline and optimized runs of the same task. |
| Settings | Manage billing, prices, privacy and local preferences. |
| Connectors | Choose where Shrinkcage reads existing CLI session records. |
| System health | Check services, ports and connection errors. |
| How to use | Follow short instructions with links to each screen. |

## Support and accuracy

**Codex and supported Claude Code:** managed subscription/API sessions. **Gemini CLI:** read-only history. **Headroom, RTK, Serena and approved SDK MCP plugins:** managed adapters. Other tools may be guided-only. [Compatibility](docs/COMPATIBILITY.md) · [Plugin SDK](docs/PLUGINS.md)

Each managed launch has separate tool settings. Changes require a new launch; inherited external hooks may limit isolation. A selected tool is not proof it ran.

Savings can overlap and are never added together. Subscription API-equivalent estimates are not charges. Missing values stay **N/A**. [Accounting rules](docs/ACCOUNTING.md)

Stored metadata excludes prompts, code, tool outputs and OAuth credentials. Native CLI authentication and approvals remain unchanged. [Privacy](docs/PRIVACY.md) · [Testing and limits](docs/VALIDATION.md)

<details>
<summary>Screenshot · illustrative test data</summary>

![Shrinkcage workspace](docs/images/overview.png)

[Projects and sessions](docs/images/projects.png) · [Session setup](docs/images/start-session.png)

</details>

[Architecture](docs/CONTROL_PLANE.md) · [Registry guide](docs/REGISTRY.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [MIT license](LICENSE)
