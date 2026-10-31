# Compatibility and operational boundaries

| Component | Functional support | What is not assumed |
|---|---|---|
| Codex | Managed native interactive sessions, process hooks/MCP overrides, metadata/usage, subscription or API accounting | Hook trust, provider quotas, exact invoice charges and arbitrary CLI versions |
| Claude Code | Modern CLI native settings/session-ID/strict-MCP interfaces; four billing paths tested with fixtures | Legacy 0.x client support; selective removal of external hooks; mandatory subscription gateway |
| RTK | Native session rewrite hooks for both agents; shared estimated gain/history | External hooks can be independently turned off; output estimates are provider token savings |
| Serena | Session-owned stdio MCP and observed tool names/calls; independent shared dashboard discovery | Dashboard reachability proves Codex connection or token savings |
| Headroom | Codex API routing through an already healthy loopback proxy | Claude managed routing, subscription OAuth proxying, owned proxy install/update, session allocation of shared counters |
| SDK v2 stdio MCP | Approved local foreground native executable or reviewed Node entry point; typed per-session options, real protocol validation and owned optional single-file copy | Arbitrary OAuth/env inheritance, remote HTTP auth, npm-shim execution, package installation, OS sandboxing or automatic quality proof |
| Gemini | Read-only saved-session discovery | Managed launch or optimizer activation |
| context-mode, LeanCTX, codemem, LiteLLM, Langfuse | Official documentation and guided catalog | Reviewed managed activation, verified session isolation or measured benefit |
| Unknown tool mechanisms | Safe metadata inspection and downloadable review proposal | Automatic executable adapter generation or execution |

macOS, Windows and Linux implementations use platform-aware paths, discovery and subprocess arguments. CI runs isolated unit/integration/package/smoke tests on all three systems with Node 22.14 and 24, plus a Linux browser job. Consult [validation results](VALIDATION.md) for the specific verified commit and native checks; passing fixture CI is not universal upstream compatibility.

Reviewed Codex version families are 0.165 and 0.166; unreviewed minor and prerelease versions fail closed. Claude Code requires the modern 2.1 interfaces; native version/help checks passed locally with 2.1.316. Windows supports the official native npm sidecar as well as the legacy Node launcher, without invoking a command shell.

New native tool versions are probed before launch. New plugin source identities require a fresh explicit approval; running sessions keep pinned snapshots. Agent versions and declared billing modes are included in validation context and exact plan fingerprints. Tools may remain unavailable while the rest of the application works.

Subscription, API, unknown and hybrid billing remain separate accounting dimensions. No API key is required for native subscription sessions. Token/cost data is withheld where telemetry attribution, model identity, cache semantics or reviewed pricing is incomplete. See [accounting](ACCOUNTING.md) and [plugin development](PLUGINS.md).
