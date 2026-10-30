<p align="center"><img src="public/icon.svg" width="52" alt="Shrinkcage" /></p>

# Shrinkcage

**Track AI coding sessions and token savings locally.**

See your sessions, tool activity and reported savings in one dashboard. You can also start Codex with RTK, Serena and Headroom from your terminal.

[![Build and tests](https://github.com/datasound-projects/Shrinkcage/actions/workflows/ci.yml/badge.svg)](https://github.com/datasound-projects/Shrinkcage/actions/workflows/ci.yml)
[Download ZIP](https://github.com/datasound-projects/Shrinkcage/archive/refs/heads/main.zip) · [Setup help](docs/SETUP.md) · [Report a problem](https://github.com/datasound-projects/Shrinkcage/issues)

## Download, install and open

1. Install [Node.js 22.13 or newer](https://nodejs.org/en/download), including npm.
2. [Download Shrinkcage](https://github.com/datasound-projects/Shrinkcage/archive/refs/heads/main.zip) and extract the ZIP.
3. Open a terminal in the extracted folder and run:

   ```sh
   node scripts/start.mjs
   ```

**The same command works on macOS, Windows and Linux.** It installs the app's dependencies, builds the dashboard and opens **[localhost:8790](http://localhost:8790)** in your browser. Keep that terminal open; press **Ctrl+C** to stop.

Shrinkcage runs on your computer. No Docker, cloud service or Shrinkcage account is needed. Your coding agents keep their usual accounts and requirements. Missing optional tools show as unavailable; they do not prevent the dashboard from opening.

## What it helps you do

- **See your work:** browse sessions by agent, project, model and time.
- **Understand your tools:** see calls, activity and reported or estimated savings.
- **Start Codex with your tools:** choose a profile, review the plan and launch it in your terminal.

In the dashboard, use **Overview** for metrics, **Sessions** for saved history, **Profiles** to prepare a launch, and **Managed runs** to follow sessions started through Shrinkcage.

![Shrinkcage dashboard — synthetic example data](docs/images/overview.png)

## Start Codex with your tools

Codex CLI and your chosen tools must be installed separately. Leave the dashboard terminal running, then open a **second terminal in the Shrinkcage folder** and run:

```sh
node bin/shrinkcage.mjs run codex --profile balanced --project "/path/to/your-project"
```

Replace the path with your project folder, such as `C:\Projects\my-app` on Windows. Review the plan, then enter the first eight characters of its fingerprint when prompted. Codex opens in that terminal; press **Ctrl+C** to end the session.

The **Balanced** profile selects RTK, Serena and Headroom when compatible. The plan lists any tool it cannot include. Headroom needs an existing running proxy, and RTK needs a configured hook trusted by Codex. Serena starts for the selected session. See the [tool setup guide](docs/CONTROL_PLANE.md) for prerequisites or to require every selected tool.

After your first launch, use **Profiles** to review and copy future launch commands. With a ZIP install, replace the copied command’s first word, `shrinkcage`, with `node bin/shrinkcage.mjs`, and run it from the Shrinkcage folder.

## Supported tools

| Agent or tool | What Shrinkcage shows or does |
|---|---|
| Codex CLI | View saved sessions and launch sessions with selected tools |
| Claude Code / Gemini CLI | View saved session metadata and usage when available |
| Headroom | Reported context compression and token savings |
| RTK | Estimated reduction in terminal output tokens |
| Serena | Tool names, call counts and activity |
| codemem / LiteLLM / Langfuse | Setup guidance only |

**Savings can overlap.** Headroom and RTK numbers stay separate. Missing data shows **N/A**. A reachable Serena dashboard does not prove an agent is connected; session details show the available evidence.

## Help and privacy

The dashboard shows metadata, not your prompts, code or tool outputs. Session launches happen in your terminal after approval. RTK setup changes project hook files only after a separate preview and approval. Agents and optimization tools retain their own network settings. [Privacy and storage](docs/PRIVACY.md) · [Security](SECURITY.md).

- **Need setup help?** [Platform scripts, installation, settings and troubleshooting](docs/SETUP.md).
- **A tool is unavailable?** Check **Optimizers → Recheck tools** and the [compatibility guide](docs/CONNECTORS.md).
- **Want test results?** [Validation and platform limits](docs/VALIDATION.md).
- **Want to contribute?** [Development guide](CONTRIBUTING.md).

Screenshots use synthetic test data. Native tool support depends on installed versions; see the compatibility and validation guides. Shrinkcage is [MIT licensed](LICENSE), with [third-party notices](THIRD_PARTY_NOTICES.md).
