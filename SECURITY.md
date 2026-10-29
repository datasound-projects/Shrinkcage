# Security policy

Report a suspected vulnerability privately using [GitHub private vulnerability reporting](https://github.com/datasound-projects/Shrinkcage/security/advisories/new) when enabled. If unavailable, open a minimal issue asking for a private contact without exploit payloads, private transcripts or credentials. Supported fixes target the current main/release line; older versions should upgrade.

Shrinkcage binds to loopback and is intended for one trusted local user. It is not an authenticated network service, sandbox, secret vault or security boundary against malicious code already running as that user. Do not expose port 8790 through a public proxy. Windows app data relies on inherited user ACLs; POSIX permissions do not replace host access controls.

The original monitoring collectors and discovery remain read-only. The control plane adds explicit, reviewable privileges:

- Browser mutations save only bounded Shrinkcage metadata and produce plan/setup previews; they require validated Host/Origin, a per-process capability and explicit approval. There is no browser execution/install/stop endpoint.
- CLI managed launches require a fresh deterministic plan fingerprint, fixed reviewed executables, supported versions and inherited terminal ownership. Arguments use arrays with `shell: false`. No installer or command is loaded from a browser/manifest string.
- RTK setup/undo writes only two owned project files after separate fingerprint approval. Locks, backups, journals, compare-before-write, parent/file identity checks and conflict-aware rollback protect unrelated data. It never writes global Codex config, auth or AGENTS.md or bypasses hook trust.
- Managed MCP relays handle payloads transiently and persist only bounded safe receipt metadata. Handshake, tool use, health and estimated/shared metrics remain distinct.
- Child cleanup uses live owned handles/tokens. Stored or newly discovered PIDs never authorize process termination; external proxies/dashboards are not stopped. A PID may only be checked for liveness when deciding whether a recorded setup lock can be recovered.
- Fixed loopback endpoints, validated port ranges, redirects disabled, bounded bodies/files/output/timeouts and strict declarative schemas prevent arbitrary URL fetching or manifest execution. Guided integrations do not install, capture or transmit traces.

Residual limits: same-user filesystem races and host compromise cannot be eliminated by a local Node app. Codex trust/admin/ancestor configuration, future CLI versions and external optimizer behavior are not fully controlled. Serena can index a project/prepare language servers; Headroom's upstream behavior/privacy settings remain external. No model-policy or sandbox bypass is added by Shrinkcage. See [Control-plane limits](docs/CONTROL_PLANE.md), [Privacy](docs/PRIVACY.md) and [Validation](docs/VALIDATION.md).

Never publish live app data, setup backups, session records, secrets or private paths. `node scripts/check-public.mjs` is a helpful pattern scan, not proof that a repository contains no sensitive data. Review staged changes and distribution contents manually before publishing.
