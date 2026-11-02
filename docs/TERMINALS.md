# Projects and persistent coding sessions

1. Open **Projects**. Click **Add project** and select its folder.
2. Click **New session**. Choose Codex or supported Claude Code. Leave billing on **Detect automatically** if unsure.
3. Keep the recommended tools or change the switches. Each session has its own stack.
4. Click **Review session**. Read changes and notices, approve, then **Open in Herdr**.
5. In Herdr, type your coding task. Detach with **Ctrl+B, then Q**. Select the session in Projects and click **Reopen in Herdr** to return.

The native folder picker uses macOS's folder dialog, Windows FolderBrowserDialog, or Linux Zenity/KDialog. A desktop and its permissions are required. **Enter a folder path instead** remains available. Choosing a folder approves that project only. Home/root, credential folders and symlinks remain blocked. The web app cannot browse arbitrary files or run browser-supplied commands.

## Herdr support and persistence

Browser launches always use Herdr. The selected terminal emulator displays its TUI; it is not an alternate session mode. New Session discovers compatible installed apps, hides a single-choice menu and remembers an optional local default. See [terminal discovery and adapter support](TERMINAL_ADAPTERS.md). Reviewed Herdr **0.9.5+ in the 0.9 family** is supported on macOS/Linux. Missing or unsupported Herdr blocks launch with a diagnostic; no silent terminal fallback or installer runs. [Official installation](https://herdr.dev/tui/docs/install/).

Each launch has a generated named Herdr session and private configuration. Reopen attaches to that existing live session and does not start another agent. It verifies the saved launcher/config hashes, rejects moved or symlinked resources, and checks that the exact named server is still running. It never types into an unrelated pane. Earlier records without a saved binding cannot be reopened through this feature.

Detach keeps the original processes and their conversation running. A computer reboot, power loss, agent exit or full Herdr server stop does not. Automatic agent restoration is disabled: another agent launch must pass Shrinkcage's current compatibility and approval checks. If the CLI has finished, reopening a still-running Herdr session opens its existing terminal, not a resumed conversation. Extra panes return to plain shells. [Official persistence behavior](https://herdr.dev/tui/docs/session-state/).

Herdr's own session and screen state can contain terminal content. Shrinkcage does not read or export it. Owned launch files are retained for reconnect and contain non-secret context only. Herdr manages its own named-session state. Do not delete an owned launcher directory while that Herdr session still needs its default-shell file.

Windows Herdr launch remains unsupported. Windows folder selection, monitoring, plans and the existing terminal CLI workflow remain available. This is an explicit compatibility limit, not a claimed native Windows Herdr validation.

## Launch authorization and recovery

Review approval is single-use and expires after five minutes. Before opening, the server recomputes the plan. A private launcher invokes the fixed Shrinkcage entry point using its ticket ID. The terminal atomically claims that approval and recomputes the plan again. Changes to agents, binaries, configuration, profiles, billing or registry evidence require a fresh review. Repeated launch requests with the same ID do not start another agent. If a response is lost or times out, the browser retries that original request ID instead of opening a duplicate.

Only non-secret path/port context is retained privately for executable discovery and native configuration. OAuth credentials and API keys are not copied from the server into files or HTTP responses. Your terminal uses its native login/environment. Native sign-in, trust, sandboxing, approvals and permissions still apply.

- **Herdr missing:** install it separately, then use **Recheck Herdr** in the review.
- **Nothing opened:** inspect existing windows before retrying. Check desktop permissions.
- **Reopen says no longer running:** start a new reviewed session. Shrinkcage does not pretend to recover stopped processes.
- **Changed configuration or expired approval:** review again. Saved approvals cannot bypass revalidation.
- **No activity:** selected/configured tools are not marked used until actual receipts are observed.

The existing CLI and reviewed legacy terminal API remain compatible for advanced use. Native terminal adapters use validated OS-discovered apps and fixed argument arrays. Terminal emulators and shells remain separate. No generic browser-to-shell route exists. A window opening, tool installation or successful process start is not evidence of cost savings.
