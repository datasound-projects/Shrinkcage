<p align="center"><img src="public/icon.svg" width="52" alt="Shrinkcage" /></p>

# Shrinkcage

**Local-first token and cost optimization for AI coding sessions.**

Choose optimization tools for each Codex or Claude Code session. Shrinkcage launches the session, verifies tool activity, and keeps reported usage separate and honest.

[![Build and tests](https://github.com/datasound-projects/Shrinkcage/actions/workflows/ci.yml/badge.svg)](https://github.com/datasound-projects/Shrinkcage/actions/workflows/ci.yml)

[Download ZIP](https://github.com/datasound-projects/Shrinkcage/archive/refs/heads/main.zip) · [Setup help](docs/SETUP.md) · [Report an issue](https://github.com/datasound-projects/Shrinkcage/issues)

## Install

Install [Node.js 22.13+](https://nodejs.org/en/download), download and extract Shrinkcage, then run:

```sh
node scripts/start.mjs
```

This installs dependencies, builds the app, and opens [localhost:8790](http://localhost:8790). You can also use `./start.sh` on macOS/Linux or `start.cmd` on Windows. No Docker or account is required.

## Start a session

1. Open **Projects & Sessions** and add your project folder.
2. Click **Start Session**.
3. Choose Codex or Claude Code, billing mode, tools, and terminal.
4. Click **Review Session**, then **Open in Herdr**.
5. Work normally in the coding CLI.

Use **Reopen in Herdr** to return later. Detach with **Ctrl+B**, then **Q**. Exit the coding CLI to end the session.

Herdr 0.9.5+ is required for browser launching on macOS/Linux. Windows users can use the generated terminal command.

## Tools

| Tool | Purpose |
|---|---|
| Headroom | Compresses context through its local wrapper/proxy. |
| RTK | Reduces supported terminal-command output. |
| Serena | Provides symbol-aware code navigation. |

Tools are configured per session, not globally. **Verified active** means Shrinkcage observed real activity; **Configured** means the tool was prepared but activity was not proven.

## Accuracy and privacy

Codex and supported Claude Code versions have managed launches. Gemini CLI is read-only. Savings from different tools may overlap and are never added together. Missing data stays **N/A**, and subscription value estimates are not charges.

Shrinkcage keeps data local and does not store prompts, code, tool output, OAuth credentials, or API keys.

[Compatibility](docs/COMPATIBILITY.md) · [How it works](docs/CONTROL_PLANE.md) · [Privacy](docs/PRIVACY.md) · [Validation](docs/VALIDATION.md) · [Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)
