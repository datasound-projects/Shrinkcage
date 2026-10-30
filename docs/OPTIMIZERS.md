# Optimizer library and adapter contract

The reviewed registry lives in `server/control/optimizers`. Adapter API **2**, implementation version **2.0.0**, declares identity/source/layers, agent/OS/version constraints, configuration, dependencies, conflicts, billing modes, activation timing, evidence and ownership. Reviewed code supplies `detect`, `validate`, `plan`, `apply`, `verify`, `observe`, `undo`. Plans include the application/adapter contract and manifests in their fingerprint.

| Tool | Working scope | Limits |
|---|---|---|
| RTK | Codex/Claude native process hook; shared gain/history monitoring | Inherited external hooks cannot be selectively disabled; reductions are estimates, not provider savings |
| Serena | Owned Codex/Claude stdio MCP; successful tool-name/count receipts; shared dashboard activity | Project indexing/dependencies may be prepared by Serena; activity is not a savings measurement |
| Headroom | Codex API wrapper + retrieval MCP, reusing verified loopback proxy | No subscription route, Claude managed wrapper, owned proxy lifecycle or session savings attribution |
| context-mode | Guided official MCP/hook setup reference | Sandboxing, permissions, session memory and attribution not verified as an isolated stack |
| LeanCTX | Guided `yvgude/lean-ctx` context gateway reference | Hooks, proxy paths, indexing and broad uninstall have not been reviewed for safe per-session ownership |
| codemem | Guided official plugin/memory setup | Capture, account and indexing costs need separate review |
| LiteLLM | Guided provider/gateway setup | No assumed subscription routing or unverified Headroom chain |
| Langfuse | Guided observability reference | No remote exporter, prompt/code capture or cloud dependency enabled |

External tools are installed separately through their official documentation. Shrinkcage does not run package managers or remote installers during detection. Removal cleans only owned session resources, approved legacy setup changes or imported Shrinkcage metadata; it never uninstalls external software.

New configurations apply on **next launch**. Codex MCP request timeouts support 5–120 seconds; Claude retains native timeout policy. Unknown configuration fields, arbitrary command/env/path payloads and unsupported tools fail validation. A selected tool is not considered connected or used until its evidence supports that state.

## Community entries

The Library/Settings UI and `extension inspect|import` accept version-1 declarative **guided** manifests. Unknown fields, executable commands, installers, environment payloads, reserved IDs and executable dependency/conflict graphs are rejected. Import never fetches a URL or loads code. `extension remove ID` removes metadata only.

SDK v2 adds a reviewed configuration-driven **stdio MCP template**. New tools following this pattern register an explicitly approved local executable and typed manifest, pass a real isolated protocol check, and use the existing session engine without core changes. Other executable patterns still need reviewed code and conformance tests. JSON import alone never authorizes execution. See the [SDK, schema, example, seven gates and lifecycle guide](PLUGINS.md).

Official research: [RTK supported agents](https://github.com/rtk-ai/rtk/blob/develop/docs/guide/getting-started/supported-agents.md), [Serena contexts](https://github.com/oraios/serena/blob/main/docs/02-usage/050_configuration.md), [Headroom proxy](https://docs.headroomlabs.ai/docs/proxy), [context-mode](https://github.com/mksglu/context-mode), [LeanCTX](https://github.com/yvgude/lean-ctx), [codemem](https://github.com/kunickiaj/codemem), [LiteLLM](https://docs.litellm.ai/docs/), [Langfuse](https://langfuse.com/docs).
