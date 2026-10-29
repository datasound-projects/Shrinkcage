# Validation matrix

Release candidate: Shrinkcage 1.0.0. This document distinguishes implemented support from completed execution.

| Environment / feature | Validation |
|---|---|
| macOS, Node 22.14 | Local typecheck/build and adapter/HTTP/session regression suite executed |
| Existing Headroom, RTK, Serena | Real local metrics and explicit unavailable/idle states checked |
| Codex history | Real saved metadata read; sampled coverage, cumulative usage and deduplicated identities checked |
| Claude Code | Executable detected; no local saved sessions; synthetic format tests executed |
| Gemini CLI | Existing JSONL histories read; executable absent on PATH; not a live-agent test |
| Browser UI | Isolated Chromium-compatible browser checks with synthetic fixtures; light/dark and phone/tablet/desktop layouts |
| Built archive | Local install/version/server/frontend smoke test; see release verification output |
| Linux / Windows | Implementations and GitHub Actions matrix provided; hosted CI has not been run from this unpublished repository |
| Node 24 | CI target configured; not claimed locally executed |

Before marking a public release fully verified, run the provided CI on the destination repository and resolve failures. Then review the archive file list, checksums, security settings and documentation screenshots. No application can promise compatibility with every future CLI format or host permission policy; unsupported input remains visible and isolated.

The package/release workflows prepare artifacts and never publish. Runtime dependencies are Node built-ins; browser dependencies are bundled at build time. The public-source scanner detects common machine paths/key patterns but requires a manual review too.

Local release checks completed: 40 automated tests passed; TypeScript and production builds passed; clean archive installation and server smoke test passed; the browser suite passed with isolated synthetic fixtures, including connector approval, session filters/details and retained optimization controls. Public-source pattern scanning passed. Screenshots were reviewed to confirm they contain only test data. The original private project has not been uploaded or published.
