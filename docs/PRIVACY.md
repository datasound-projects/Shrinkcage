# Privacy, storage and retention

Shrinkcage is local-first. It has no analytics exporter, cloud account requirement or remote control service. The browser loads local assets; collectors contact only fixed loopback endpoints or fixed local executables. Agents, Serena's project tooling and the Headroom proxy can perform their own network operations under their existing configuration. Installing app dependencies also uses npm. Shrinkcage does not promise to make those independent tools offline.

## Observed history

Read-only discovery opens recognized local agent history files to extract allowlisted metadata. Prompts, tool arguments, responses, reasoning text and source-code contents are not returned or retained by the dashboard. Safe tool names/counts, model/provider labels, source-reported usage, project labels and timestamps can still be sensitive. Do not publish screenshots of real sessions without review.

Codex authentication files, provider credentials and environment dumps are never read for discovery or exposed through the API. Existing CLI authentication is inherited by a managed agent, rather than copied into Shrinkcage settings. Custom observed roots are explicit, existing local directories; filesystem roots, whole home directories, credential folders, network shares and symlink traversal are rejected. Configured roots may be visible to the same local browser user in connector settings.

Observed session indexes remain in memory: at most 2,000 candidate files/directories, depth seven and newest 500 files per connector, with a 32 MiB changed-file scan budget. Large histories use bounded head/tail samples and explicit partial-coverage labels. Query pages are bounded. These are coverage limits, not archival guarantees.

## Control-plane metadata

The app-data `control/` directory contains a versioned SQLite database, WAL files, private project path registry, setup receipts/backups, audit entries and temporary runtime receipts. The browser receives opaque project IDs/basenames, redacted plans, safe activity names/counts and provenance. It never receives run prompts, raw argv, environment values, MCP payloads or setup backup contents.

Managed launches pass user arguments only to the owning terminal process. MCP/hook payloads are handled transiently in memory to validate the protocol/rewrite response. Receipts project only approved fields and require the random managed owner proof. The durable owner token is hashed in the session table; the raw token is needed only by live owned processes/runtime proof. A local process running as your user can inspect process memory/environment, so this is not an isolation boundary against a compromised local account.

The explicit RTK setup transaction **does write project hook files**. Its private backups preserve original bytes and therefore can contain arbitrary original hook configuration, secrets or private paths you previously placed there. Backups are never served by an API. Keep them private and preserve them until undo/recovery is complete. There are no global agent-config, authentication, AGENTS.md or transcript writes by the control plane.

## Bounds and cleanup

- SDK metadata: up to 100 inspected candidates and 1,000 retained validation contexts (latest 100 exposed). Manifest/configuration byte limits bound each record. Approved executable paths and runtime binding snapshots remain private; public registration summaries omit paths. Owned plugin code copies and one rollback registration are retained until explicit removal and are not pruned as session data. Removal refuses unexpected files and never deletes external software.
- Optional GitHub inspection is an explicit network action to fixed public `api.github.com` repository metadata/manifest endpoints, with no authentication header, redirect following, code download or execution. Local executable candidates are inspected without running them. Existing MCP summaries omit arguments, URLs, environment values and credentials. Unknown candidates remain non-operational.
- Approved isolated plugin checks start only unchanged, explicitly registered programs in temporary workspaces with private HOME and no inherited provider keys/owner token. Raw stderr, arguments and tool outputs are not retained. This is not an OS sandbox; approved software retains the user's OS permissions.

- Managed metadata: default 90-day pruning by end/heartbeat timestamp, maximum 2,000 stored runs; CLI list/export lookup and UI history are bounded (latest 200 records available to the control store, latest 50 in the workspace). `shrinkcage sessions prune --days N` accepts 1–3650 days. Remove completed metadata through the UI or CLI; active owned runs must first stop in their terminal.
- Profiles: 100 custom records; private approved projects: 200; comparisons: latest 100; audit: latest 500 events; setup receipts: maximum 200; imported declarative entries: maximum 30. Reaching a hard cap fails clearly rather than creating unbounded storage.
- Runtime receipts: one bounded lifecycle diagnostic (phase/flags/error code only, no payloads) plus a bounded 1 MiB readable stream, at most 10,000 projected events and bounded pending writes. Normal shutdown/guardian cleanup removes owned runtime directories. A machine crash before a guardian starts can leave small private runtime artifacts; review only after stopping your owned runs. No cleanup kills a PID discovered from disk.
- Setup backups/journals intentionally survive session retention. They are needed for safe undo; no blanket retention job deletes them or modified project files. After all related setups are undone and runs stopped, you may archive or remove your own app data. Removing it early loses ownership/recovery evidence and leaves project hooks behind.
- Optional `MONITOR_SNAPSHOTS=1` persists numeric Headroom/RTK counters and at most 8,640 Serena numeric observations per retained series in `snapshots/snapshots.json`, overwritten at most once per minute. No transcript or activity journal is persisted there. Disable snapshots and remove that directory to erase them.
- The legacy Serena UI log is bounded to 100 in-memory observations. Browser local storage contains theme/UI preferences, not conversation contents.

App-data locations are listed in the [setup guide](SETUP.md); legacy Shrinkage paths/settings still work. Restrictive POSIX directory/file modes are used. Windows relies on the user's inherited filesystem ACLs: do not put app data in a shared directory. SQLite itself and the OS remain part of the trust boundary. Back up app data before repairing corruption or downgrading; newer database schema versions fail closed.

## Local access

Default binding is 127.0.0.1. Host validation, exact-Origin checks, per-process request capability, bounded JSON and explicit approvals guard mutations. They are CSRF protections, not multi-user authentication. Anyone with access to the same local account/browser can inspect permitted metadata. Do not reverse-proxy the dashboard onto a network or treat it as a multi-tenant service.

Before reporting bugs, use sanitized schemas and synthetic fixtures. Never attach real session transcripts, app-data backups, credentials or project contents to a public issue. See [Security](../SECURITY.md).

## Session control and accounting in 1.2

Managed Codex/Claude sessions add safe billing evidence, requested/observed model metadata, native usage, numeric estimates and separate next-launch preferences. A fresh owned session hook links native identity/project to a known history root; no timestamp-only or shared-counter attribution is used. Native logs are parsed transiently, and only allowlisted metadata survives. Mixed models/providers, missing model attribution, malformed/sampled records and stale observations withhold complete cost estimates.

Authentication remains in each CLI. Shrinkcage uses safe status commands only after capability checks and never opens OAuth credentials, copies a CLI home, exports account data or changes login. Raw status output is discarded; billing mode evidence retains only enums, timestamp and limitations. Subscription API-equivalent value is an estimate, not money saved.

Exact-model price rates, optional provider IDs, source URLs, review dates, budgets and a separately declared subscription fee are local SQLite settings. URLs are validation/documentation links, never arbitrary fetch targets. No remote OTLP/Langfuse exporter is enabled. Input/output token semantics follow GenAI conventions without exporting task content.

Additive SQLite tables preserve the legacy v1 compatibility floor so an already-running owned launcher/guardian can finish safely. Pending stack edits do not overwrite the running session's launch record. Current charts cover the latest 50, budget recommendations the latest 200, and session history can page through the bounded 2,000-record store. No zero is substituted for unavailable usage/cost.
