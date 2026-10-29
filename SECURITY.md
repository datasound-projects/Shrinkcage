# Security policy

Shrinkcage is a local, same-user utility. Bind only to 127.0.0.1 and do not put it behind a public proxy or expose port 8790 to a network. The application is not an authentication boundary against other software running as the same operating-system user.

Loopback TCP is not per-user isolation: another local OS user who can connect to port 8790 may also access metadata and the app-settings capability. Use Shrinkcage only on a trusted local machine, not an untrusted multi-user host. No account-based access control is provided.

Supported release: 1.0.x. Review security fixes before using a new version.

Do not post credentials, real transcripts or private paths in an issue. Before publishing the repository, maintainers should enable GitHub private vulnerability reporting. When enabled, use the repository's Security → Report a vulnerability feature. Until a private channel is available, do not disclose exploit details in a public issue; request a private reporting channel from the repository maintainer without including sensitive material.

The local HTTP boundary validates Host and Origin, rejects cross-site requests and redirects, bounds JSON/request sizes, and requires a per-process capability plus an exact local Origin for approved connector settings. Session reads use schema and filename allowlists, directory boundaries and symlink checks. CLI monitoring uses fixed argument arrays with timeouts. None of these controls grant access to other OS users' files or protect against malicious software already controlling the same user account.

See docs/PRIVACY.md for data collection, retention and cleanup. Run `node scripts/check-public.mjs` before publication, then manually review the package file list and screenshots; pattern scans cannot prove the absence of secrets.
