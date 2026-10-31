# Start a session

1. Open **Sessions → Start session**.
2. Choose Codex or Claude Code, billing, a project and compatible tools.
3. Review the changes and tick the approval box.
4. Choose **Terminal** or **Herdr**, then **Start session**.

The agent opens in a real interactive terminal. Complete any native sign-in, trust or permission prompt there. The dashboard waits for the launcher to confirm a session ID; opening a window alone never marks an optimizer active. Tool usage still requires its own protocol or hook evidence.

Saved profiles have the same Start action. To use an edited session stack, save the next-launch stack, preview its restart plan and approve the new session. This starts a separate CLI; stop the original in its own terminal when appropriate.

## Supported terminals

| Target | Support |
|---|---|
| macOS Terminal | Built-in Terminal app, opened with the fixed system `open` interface. Actual native window/TTY startup tested locally. |
| Linux desktop | GNOME Terminal, Konsole, x-terminal-emulator or xterm with DISPLAY/WAYLAND_DISPLAY. No display means Copy command; desktop-specific GUI behavior is not exhaustively tested. |
| Windows | A new Windows PowerShell window. Generated scripts, arguments and fake-agent lifecycle are covered in Windows CI; native Windows GUI behavior has not been tested here. Existing execution policies are preserved. |
| Herdr | Reviewed 0.9.5+ in the 0.9 family on macOS/Linux, with version/config capability checks. A dedicated `sc-…` session and private configuration start the managed launcher directly. Windows Herdr and automatic agent restoration are unsupported. |

Herdr is optional and installed separately. Shrinkcage never downloads it, installs global agent hooks, types commands into existing panes or changes its saved configuration. After the managed CLI ends, the private Herdr pane returns to a plain shell. Keep its window open while working; reconnect controls are not yet provided in Shrinkcage.

## Launch safeguards

The server retains a ready plan for five minutes. The Start request can contain only that fingerprint, a supported target and an idempotent request ID, plus explicit approval. It cannot contain a command, URL, executable, environment or arbitrary agent arguments. Exact local Origin, the page capability and strict schemas are required.

Before opening, the server recomputes the plan. A private launcher file calls the fixed Shrinkcage entry point with a single-use approval ID. The terminal atomically consumes that approval and recomputes the plan again. Changed agents, binaries, configuration, profiles, billing or registry evidence require another review. Repeated requests with the same ID do not open another window. Used, expired and non-interactive approvals fail closed.

The existing managed runner handles session IDs, process ownership, hooks/MCP, native permissions, receipts and cleanup. There is no generic browser-to-shell or browser-to-stop endpoint.

Only non-secret path/port context is retained privately to keep executable discovery and native configuration consistent. OAuth credentials and API keys are not transferred from the server into launch files or returned over HTTP. The terminal uses its native login/environment; if the account differs from the preview, review again after signing in through the CLI.

Launch metadata is bounded; native launch files are removed after a completed claim when their hashes still match. Changed files are preserved. Herdr bootstrap files and its private temporary config remain available for the persistent Herdr server; close those sessions before removing app data. No unrelated files or processes are removed.

## If the window does not start

- Use **Recheck terminals** after installing or opening a desktop terminal.
- If Start says to restart Shrinkcage, the browser has newer assets than the running backend. Restart the dashboard, then review again.
- A blocked native trust/sign-in prompt is handled in the terminal. Shrinkcage does not approve it automatically.
- If a window opened but confirmation is delayed, check that window before retrying. Five-minute approvals and a pending-launch cap prevent repeated unattended launches.
- **Copy command** remains available when no supported desktop terminal exists. Windows security policy or managed desktops may require this fallback.

No installation, window opening or successful CLI startup proves cost savings. Native optimizer activation, tool use, billing-aware measurements and controlled quality comparisons remain separate evidence.
