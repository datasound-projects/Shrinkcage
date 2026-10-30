# Connector compatibility

Agents, model providers and model names are separate dimensions. A saved record does not prove a running process, and an installed executable does not prove authentication. All observed connectors fail independently and remain available alongside the managed control plane.

## Observed sources (read-only)

| Connector | Source and supported observations | Important limits |
|---|---|---|
| Codex CLI | `CODEX_HOME` or `~/.codex`: sessions/archived_sessions JSONL; reported metadata, model/provider, latest cumulative usage, safe tool names | No auth-file reads, prompt/argument/output export, process control or inferred live connection; cumulative checkpoints are not summed |
| Claude Code | `CLAUDE_CONFIG_DIR` or `~/.claude`: projects JSONL; message usage deduped by message ID, safe tool names | Read-only history remains available; managed launches require the modern interfaces below; no automatic plugin installation |
| Gemini CLI | `~/.gemini/tmp`: recognized session JSON/JSONL, reported metadata/usage and supported rewind/removal records | Version-dependent private file formats; uncertain sampled rewrites withhold totals; no managed Gemini launch |
| Headroom | fixed `http://127.0.0.1:8787/health`, `/stats`, `/stats-history` | Validated known JSON field aliases; runtime/display-session/lifetime kept distinct; telemetry absent is explained; cost only when supplied |
| RTK | fixed `gain --all --format json` and `gain --history --format json`; read-only history SQLite fallback | All output token reductions labeled estimates. JSON version/schema omissions remain N/A. No command string from the browser is executed |
| Serena | `/heartbeat`, `/get_tool_stats`, `/get_tool_names`, `/get_config_overview`; default ports 24282–24291 | Reachability separate from Codex MCP connection; counters observed per instance; log timestamps represent observations, not exact invocation times |

User-approved history roots and enabled flags belong only to Shrinkcage. Discovery bounds directories/files, rejects unsafe roots and symlinks, labels sampled coverage, and returns only allowlisted metadata. See [Privacy](PRIVACY.md).

Listening ports, reachable HTTP, installed CLIs and confirmed adapter activity remain separate indicators. macOS uses lsof; Linux lsof/ss; Windows a fixed read-only Get-NetTCPConnection query. Process details can be unavailable due to permissions or wrappers.

## Managed session adapters (1.2)

| Component | Reviewed local interface | Activation evidence |
|---|---|---|
| Codex | installed **0.165.0**; minimum reviewed interface includes `--config` and `--no-daemon`; 0.x minor compatibility fails closed | Owned launch handle and inherited terminal; receipts required for optimizer activity |
| Claude | 2.x, minimum 2.1.0 plus verified `--settings`, `--session-id`, `--mcp-config`, `--strict-mcp-config`; older builds are unsupported | Native subscription/API authentication retained; exact auth-status help must exist before a status query |
| RTK | installed **1.1.0**, native `rtk hook codex` / `rtk hook claude` with documented PreToolUse/Bash JSON | Actual returned command rewrite, not merely hook-file presence |
| Serena | installed **2.1.0**, `start-mcp-server --project-from-cwd --context=codex|claude-code --transport stdio` | Successful MCP initialize + initialized notification, safe successful tool responses |
| Headroom | installed **0.42.0**, Codex API-only scoped wrapper no-write flags plus `mcp serve --proxy-url ... --transport stdio` | Proxy health is separate; successful retrieval MCP handshake/activity provides managed evidence; savings remain shared |

Minimum/version-family guards are compatibility boundaries, not a claim that every future patch/platform combination has been manually tested. CLI help/version checks fail closed when a required interface is absent. Known Windows npm Node shims are resolved to fixed sidecar modules without `shell: true`; unusual shell wrappers are unsupported. Nothing downloads tools during discovery.

Conventional external MCP names may be shadowed only in approved process-local config; ambiguous aliases are reported instead of guessed. No global Codex settings, auth or AGENTS.md edits. New RTK hooks are process-scoped; legacy project setup is separately approved and reversible. Inherited external hooks cannot be selectively disabled. Existing Headroom routing can require preserving its retrieval MCP; unsafe Claude routing combinations are blocked. See [Control-plane guide](CONTROL_PLANE.md) for permissions, config-layer limits and ownership.

context-mode, LeanCTX, codemem, LiteLLM and Langfuse stay **guided**. A catalog listing or detected executable is not activation. No capture/export/gateway chain is silently enabled. Headroom + LiteLLM route chaining remains blocked without a reviewed compatible adapter.

## Source references

Interface research used official documentation and the installed binaries' version/help output. Privacy-sensitive live configurations were not used as test fixtures.

- [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-basic), [advanced configuration](https://learn.chatgpt.com/docs/config-file/config-advanced), [reference](https://learn.chatgpt.com/docs/config-file/config-reference), [hooks](https://learn.chatgpt.com/docs/hooks), [MCP](https://learn.chatgpt.com/docs/extend/mcp).
- [Claude CLI reference](https://code.claude.com/docs/en/cli-reference), [hooks](https://code.claude.com/docs/en/hooks), [usage telemetry](https://code.claude.com/docs/en/monitoring-usage).
- [RTK supported agents](https://github.com/rtk-ai/rtk/blob/develop/docs/guide/getting-started/supported-agents.md).
- [Serena client documentation](https://github.com/oraios/serena/blob/main/docs/02-usage/030_clients.md).
- [Headroom proxy documentation](https://docs.headroomlabs.ai/docs/proxy).
- [codemem](https://github.com/kunickiaj/codemem), [LiteLLM](https://docs.litellm.ai/docs/), [Langfuse](https://langfuse.com/docs).

For a new incompatible version, report the version and sanitized schema/error, never raw transcripts, credentials or private paths. Unsupported data stays unavailable; there is no production fixture fallback.
