# Privacy and local retention

All monitoring requests target fixed loopback services or approved local session files. No account, external analytics, remote fonts, pricing lookup, authentication file or cloud API is used. CLI authentication remains with the CLI. Process probes return names/PIDs or observation flags, never command-line arguments.

Session readers temporarily parse bounded local JSON records to select IDs, a project basename/hash, timestamps, model/provider IDs, numeric usage, tool names and recorded CLI version. Prompt text, code, instructions, thoughts, tool arguments/results, transcript previews and automatically generated conversation titles are not returned, stored in the metadata cache or written to disk by Shrinkcage. Complete raw records are not retained after parsing. Reading metadata still requires filesystem access to the underlying files; this is not a separate transcript-redaction service.

The in-memory index retains at most 500 discovered files per agent. Large JSONL files sample a 64 KiB head and recent 2 MiB tail; full JSON reads are capped at 8 MiB. A refresh has a 32 MiB changed-file budget. Token/tool data coverage is labeled. The Serena journal retains 100 counter observations and no arguments or results.

The app-data directory contains approved connector settings and, only when opted in with MONITOR_SNAPSHOTS=1, bounded numeric optimization snapshots. Settings use atomic writes and POSIX directory/file modes 0700/0600. Windows access follows the user's existing filesystem ACLs; Shrinkcage does not change OS policies. Session metadata and tool journals are not persisted by this app. The browser stores only theme preference; no session transcript is stored in localStorage. Existing legacy theme preference remains compatible.

To remove Shrinkcage's saved configuration and optional snapshots, stop its server and delete its app-data folder listed in README. This does not delete agent sessions. To clear only the observation journal/index, restart Shrinkcage. To disable a reader, use Connector center and save the explicit approval form. Agent files are never deleted, archived or modified.

Use only on a trusted local machine. Other software running as the same OS user can access the same files and loopback endpoints. The localhost boundary, same-origin checks and per-process write capability reduce accidental/browser-driven access; they are not protection against a compromised user account. See SECURITY.md.

Loopback is also reachable by other local users on many operating systems. Shrinkcage does not authenticate OS identities at its HTTP boundary. Do not use it on an untrusted shared host or expose it through a network proxy.
