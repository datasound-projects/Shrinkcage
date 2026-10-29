# Connector architecture and compatibility

Agent discovery is separate from optimization collection. `/api/workspace` reports connector state and facets; `/api/sessions` is a bounded metadata-only list; `/api/sessions/:opaque-id` returns selected usage and tool-name details. `/api/discover` refreshes the index. Only `/api/connectors/config` can write app settings, after Origin/capability/approval validation. There is no agent execution or credential endpoint.

## Codex CLI

The installed rollout schema was inspected structurally, including a locally recorded CLI version 0.165.0. Supported records are `session_meta` (ID, cwd, model_provider, CLI version), `turn_context` (model), `event_msg` token-count totals, newer `token_usage_record.thread_token_usage`, and named function/custom tool calls. Prompt text, instructions, arguments and results are discarded. Last cumulative totals take precedence; cumulative checkpoints are never summed.

OpenAI also documents read/list methods in [Codex App Server](https://learn.chatgpt.com/docs/app-server). Shrinkcage deliberately reads existing saved files instead of starting a new app-server, resuming a thread, or invoking scan-and-repair behavior. Rollout files are implementation formats, not a stable compatibility promise. Archived and active copies are deduplicated by agent/session/project identity.

## Claude Code

The JSONL reader selects sessionId, cwd, version and assistant message metadata. Usage is deduplicated by assistant message ID to avoid counting streaming updates more than once. Tool-use IDs are deduplicated too. Missing categories and provider routing remain unavailable. Message-based totals cover the read records; sampled files are labeled accordingly.

References: [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference), which describes transcript-based resume, and [monitoring](https://code.claude.com/docs/en/monitoring-usage). Shrinkcage does not enable OpenTelemetry or change agent configuration. Local validation detected the executable but no saved Claude sessions; the parser is covered by synthetic schema fixtures, not a claimed live Claude usage test.

## Gemini CLI

Both legacy conversation JSON and append-only JSONL are supported. Allowlisted fields include sessionId, projectHash, startTime/lastUpdated, model-message token summaries, and named tool calls. JSONL metadata checkpoints, message-ID replacement, rewind-to removal and explicit removeIds are handled. Content/result-only patches are ignored because that content is never retained. Sampled rewrites that cannot establish a safe usage snapshot withhold counters.

References: [session management](https://geminicli.com/docs/cli/session-management/) and the official [record types](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/chatRecordingTypes.ts). Project-hash-only records display a hash label rather than guessing a directory. Model/provider are separate; routing is not inferred from the model name. Local Gemini JSONL histories were discovered without an executable on PATH. That verifies history reading, not a live Gemini CLI connection.

## Optimization tools

Headroom uses fixed local `/health`, `/stats`, `/stats-history` endpoints. Runtime counters remain distinct from persisted display-session/lifetime values; history uses bucket deltas rather than cumulative checkpoints. This implementation was validated against Headroom 0.42.0 and history schema 6.

RTK uses fixed `gain --all --format json` and `gain --history --format json` arguments, with timeouts and bounded output. Its existing SQLite database is opened with Node's readOnly flag when command details are absent from JSON. Arguments/project paths are removed from displayed command families. Details may include records RTK excludes from its own summary; scope notes explain that discrepancy.

Serena discovery validates `status: alive` on a small configured port range. Tool statistics take precedence over cached overview counters. A summary is a fallback only when safe; empty authoritative detail maps cannot resurrect old counts. The observation journal preserves valid per-tool increments independently across instances, bounds events to 100, and labels initial snapshots/resets separately.

No optimization counters are attributed to a session without verified correlation. No token savings are invented for Serena. Operational connection status, saved history and actual live integration are separate concepts.
