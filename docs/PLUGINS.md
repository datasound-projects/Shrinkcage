# Optimizer Plugin SDK v2

Shrinkcage runs reviewed adapter code, never JavaScript imported by a manifest. SDK v2 adds one genuinely executable, configuration-driven pattern: **foreground stdio MCP servers**. A new tool using this pattern needs a manifest and an explicitly approved local binding; it does not need a new branch in the session runner.

Other declared mechanisms—CLI wrappers, hooks, context compressors, output filters, API gateways, prompt caching, retrieval, memory and telemetry—remain **Integration required** unless a reviewed built-in adapter implements them. Their metadata can be inspected and proposed, but cannot authorize execution.

## Try the working example

From the Shrinkcage folder, after startup/build:

```sh
node bin/shrinkcage.mjs optimizer add-example
# Review the source, permissions, scope and returned fingerprint, then repeat:
node bin/shrinkcage.mjs optimizer add-example --approve FINGERPRINT
```

The bundled [Line Window manifest](../sdk/examples/line-window/manifest.json) and [server](../sdk/examples/line-window/server.mjs) implement a real text-folding MCP tool. The approved action copies this single file into a private owned installation and performs an isolated MCP handshake. The tool only acts when an agent calls it. It reports UTF-8 byte counts, not token or financial savings. It is an SDK example, not a recommended quality-preserving replacement for full output.

Recheck the Library, select Line Window in Quick setup or a custom profile, set its maximum lines, and review the session plan. For example:

```sh
node bin/shrinkcage.mjs run codex --billing subscription --profile custom --tools line-window --project /path/to/project
node bin/shrinkcage.mjs run claude --billing api --profile custom --tools line-window --project /path/to/project
node bin/shrinkcage.mjs optimizer check line-window
```

Each launch has a private runtime snapshot and plugin HOME. Disabling it prepares a new launch; an existing session retains its pinned version/settings. Successful MCP calls promote its session evidence to `usage_observed`; installation alone does not.

## Write a manifest

Use [optimizer.schema.json](../sdk/optimizer.schema.json) for editor validation. The authoritative strict parser also checks cross-field bounds, reserved names, argument safety and a 16 KiB limit. No arbitrary optimizer-count limit is imposed; resource and metadata byte budgets still apply.

Declare identity, adapter version, public source, mechanism/template, layers, agents, platforms, architectures, billing modes, permissions, dependencies/conflicts and a supported tool-version range. Supply literal argument tokens and references to typed integer/boolean/enum options. Configuration cannot introduce commands, paths, URLs, environment variables or credentials. The manifest never contains an executable location.

The public TypeScript contracts and static conformance helpers are in `server/control/sdk/{types,contract}.ts`; compiled packages include JavaScript and type declarations under `dist-server/server/control/sdk/`, exported as `shrinkcage-monitor/sdk`. `staticConformance(manifest)` validates defaults, argument expansion and lifecycle capability declarations without executing anything. Real protocol conformance is the approved registration/check operation.

```sh
node bin/shrinkcage.mjs optimizer register --manifest ./shrinkcage.optimizer.json --executable /path/to/tool
# For an explicitly reviewed local Node entry point:
node bin/shrinkcage.mjs optimizer register --manifest ./shrinkcage.optimizer.json --executable /path/to/node --script /path/to/server.mjs
```

Repeat the exact command with `--approve FINGERPRINT` after reviewing it. Node entry points must use this application's Node runtime. Native foreground executables are supported; `.cmd`, `.bat`, PowerShell launchers, generic shells, package managers, interpreters and system utilities are rejected. Windows npm tools may need an explicit Node entry script instead of their `.cmd` shim. No CLI flags are invented and no package manager or remote installer is run.

`--owned-copy` supports reviewed single-file Node servers only. Relative imports and package dependency installation are not managed. Otherwise the installation remains external and is never uninstalled by Shrinkcage.

Fingerprints cover the bound executable and optional entry script, **not transitive imports, libraries or a whole external installation tree**. Only the copied entry file is pinned. External dependencies still require the user's update review and may affect behavior without changing that file. The self-contained example exercises fully pinned source; this is not a general reproducible software-supply-chain guarantee.

## Lifecycle, validation and updates

| Action | Implemented behavior |
|---|---|
| Discover / inspect | Inspect safe metadata and approved local file identity; unknown code is not run |
| Validate | Strict schema, source approval, version bounds, agent/billing/platform checks, composition and protocol proof |
| Install | Explicit local registration; optional owned single-file copy |
| Configure / activate | Typed per-session values and native process-only MCP overrides, after plan approval |
| Verify / observe | Owned handshake and successful tool-name/count receipts; no arguments/results retained |
| Deactivate | Omit from the next launch; current process requires restart |
| Rollback | Restore the retained previous registration if its approved source remains intact |
| Uninstall | Remove owned metadata/copies and profile references; refuse active/recovering references or unrecognized files |

Seven gates are retained with versions, timestamps, provenance and diagnostics:

1. **Discovery:** installation identity and source approval.
2. **Compatibility:** declared bounds plus supported native agent interfaces, platform and billing.
3. **Security:** declarative template boundary, explicit approval, minimal child environment and ownership.
4. **Configuration:** typed parameters; the actual project plan additionally checks inheritance, conflicts, dependencies and routing.
5. **Integration:** SDK plugins must pass real isolated `initialize → initialized → tools/list`. Built-in reports explicitly distinguish release fixture conformance from native and model-backed evidence.
6. **Runtime effectiveness:** session loading and successful observed calls. A reachable dashboard is insufficient.
7. **Quality/regression:** unavailable without a controlled task comparison. Installation or a handshake never passes this gate automatically.

Gates 1–5 permit activation, subject to the exact project plan. Gate 6 is collected after launch; Gate 7 remains a separate quality assessment. States include discovered, installed, compatible, needs configuration, ready to activate, active, verified active, degraded, incompatible, validation failed, requires restart, update available and integration required. Not all states occur for every template.

Discovery bounds simultaneous native probe jobs to two, caches native probes for 60 seconds, refreshes explicitly and before every launch, and checks registered file identities without running changed code. Context reports are keyed by manifest, executable identity, agent version, billing, configuration checks and protocol proof. A changed binding is shown as **Update available**—meaning the local installation needs review, not that an upstream release was automatically discovered. Failed checks affect only that tool and dependent plans.

```sh
node bin/shrinkcage.mjs optimizer update --manifest ./shrinkcage.optimizer.json --executable /path/to/tool
# Review, then repeat with --approve FINGERPRINT
node bin/shrinkcage.mjs optimizer rollback TOOL_ID
node bin/shrinkcage.mjs optimizer remove TOOL_ID
```

Update preview binds source identities and the current registration. A failed isolated test preserves the last working registration and records diagnostics. One previous registration is retained; older owned versions remain until explicit removal. Running sessions pin their manifest, executable copy and settings. External binaries cannot be downgraded automatically: restore them yourself before rollback. Removal seals registration against new launches, validates all owned receipts, quarantines verified directories and restores them if metadata removal fails. Unexpected files block deletion. External services and installations survive.

## Unknown tools and safe proposals

The Add Optimizer wizard accepts a public GitHub repository URL, an absolute local executable path, an uploaded manifest, or safe summaries from an approved project's MCP configuration. GitHub inspection is restricted to fixed `api.github.com` metadata, README and manifest documents, rejects redirects, and fetches at most 256 KiB. It optionally recognizes `shrinkcage.optimizer.json`. No repository scripts, packages or documentation instructions are executed.

```sh
node bin/shrinkcage.mjs optimizer inspect-candidate --github https://github.com/owner/tool
node bin/shrinkcage.mjs optimizer inspect-candidate --local /path/to/tool
node bin/shrinkcage.mjs optimizer proposal CANDIDATE_ID
```

A review proposal contains metadata, implementation requirements and a conformance checklist. Unknown interfaces remain **Integration required**. Documentation interpretation and new executable templates require human code review; Shrinkcage does not pretend to auto-adapt arbitrary software. Existing MCP inspection excludes argument/env values and auth-mixed Claude user configuration.

## Security and test limits

The protocol test uses a temporary workspace, private HOME and minimal environment without provider credentials or the session owner token. It bounds output and time, lists tools without calling them, and cleans up the foreground child. **This is not an OS sandbox or malware audit.** A user-approved executable still has the OS user's permissions; declarations describe requested behavior, not a kernel-enforced permission system. Only register software you trust. Plugins requiring inherited login tokens, remote HTTP credentials, background daemons or global setup are not supported by this generic template.

`tests/plugin-sdk.test.ts` exercises a randomly named future optimizer through real protocol registration, typed configuration, session activity, independent disabling, concurrent version pinning, failed upgrade, rollback, refusal to remove unknown files, and owned removal. It also covers malicious manifests, arbitrary URLs, changed source, incompatible contexts, private environment and malformed protocol output. Browser tests exercise onboarding, manifest import, settings, preview and health checks through the real backend. Fake coding CLIs test mechanics; they are not paid authenticated/model-backed benchmarks.

The optional **Upstream interface compatibility** GitHub workflow requires manual approval via workflow dispatch, checks official Codex/Claude packages and never promotes adapter code or publishes a release.

## Registry integration

The [public registry](REGISTRY.md) references trusted adapters by ID; it never imports executable code from catalog JSON. A strict `shrinkcage.optimizer.json` at a candidate repository root may propose this SDK template. The proposal is private metadata until reviewed. Terminal registration still requires a local binding fingerprint and isolated protocol checks. Personal plugins appear in the Registry without receiving public approval, and their typed settings/Add-to-Stack use the same engine as built-ins. Catalog-only tools cannot gain execution privileges through a capability string. See [candidate schema](../registry/candidate.schema.json) and [contribution checklist](../registry/README.md).
