# Optimizer Registry

The registry helps you find a useful tool, understand its limits and add it to one session's stack. Open **Optimizer Registry** in the sidebar. The shipped catalog works offline; browsing does not contact GitHub.

## Three independent layers

| Layer | What it means |
|---|---|
| Public curated registry | Reviewed upstream identity, license, interfaces and evidence, for an explicitly recorded review scope |
| Local Library | What is installed or registered here, supported by local discovery and context-specific validation |
| Session stack | Desired, applied and observed tools for one owned launch; edits to a running session require a new launch |

**Approved is not a security guarantee, an installation receipt, or proof of savings.** All eight admission gates remain visible, including partial and unavailable evidence. A metadata-guided review can approve a useful catalog listing while independent functional or security testing remains unavailable. Managed-adapter reviews also require test evidence. No failed gate can be overridden into approval.

## Find and use a tool

1. Search by name, purpose or capability. Filter by category, client, OS, billing, license, local detection, integration capability or supporting/direct role.
2. Open **View Details** for dependencies, permissions, versioned source links, evidence and limitations.
3. For a tool with a reviewed runtime adapter, choose **Add to Stack**. Select a custom profile, create a profile, or edit a managed session's next launch. Select an approved project, agent and billing mode when creating a profile.
4. Set the supported options. **Validate & preview** rechecks the native CLI, tool, authentication evidence, inherited configuration, dependencies and conflicts.
5. Review the exact plan and permissions; explicitly approve saving it. Run the displayed command in your terminal. Native CLI authentication, trust and approvals still apply.
6. Inspect the managed session's receipts. Saved configuration means **Pending next launch** or **Requires restart**; only successful observed calls/rewrites establish use.

Built-in profiles stay immutable. Adding to a custom profile preserves its other tools/settings and uses revision checks. Editing session B cannot change session A. There is no browser-to-shell launch endpoint. Guided tools show setup information and cannot be activated from a catalog checkbox. The legacy Local Library, SDK and terminal setup remain available.

## Initial review, 30 October 2026

Ten entries passed scoped catalog review: Headroom, RTK, Serena, Context Mode, codemem, LiteLLM, ccusage, Langfuse, LLMLingua and mcp2cli. Token Savior is held in the review queue: its upstream README says the headline benchmark harness is unavailable and withdraws a later measurement. This is not a claim that the software cannot be useful.

Headroom, RTK and Serena reuse the existing managed adapters. The other public entries are guided/catalog-only; supported local stdio MCP plugins can be approved separately through the SDK. Public documentation of Codex/Claude support is distinct from Shrinkcage adapter support. Headroom managed routing remains **Codex API only**. No generic proxy routing is assumed for subscription accounts.

Licenses are not reduced to a green open-source badge: Context Mode is Elastic-2.0 source-available; Serena includes GPL-3.0-or-later and MIT components; LiteLLM/Langfuse distinguish core and enterprise terms. The unrelated crates.io `rtk` package is excluded from official RTK installation provenance. Package and GitHub release versions remain separate observations.

The review artifact names the maintainer-authorized, Codex-assisted review. It does not claim an independent human security audit, complete dependency audit or paid/model-backed benchmark. Upstream benchmark claims retain source, methodology and limitations. Shared optimizer counters never become per-session savings, and overlapping reductions are never added.

## Discovery and submissions

**Add / Suggest Optimizer** accepts a public GitHub repository, a documentation link with its canonical GitHub repository, or an SDK manifest. Only fixed GitHub metadata endpoints are fetched; arbitrary documentation URLs are stored as unverified references. Private repositories are refused before their content can enter the cache. No downloaded code, install script, CLI flag or candidate executable runs during discovery.

The personal review queue is private SQLite metadata. Download a proposal containing the candidate, eight-gate checklist and adapter scaffold/test requirements. Open an issue or PR yourself: the app never sends a submission publicly or changes the approved catalog. An unknown integration stays **Integration required**. A valid `shrinkcage.optimizer.json` can suggest the reviewed stdio template but cannot create an executable binding or approve itself.

Advanced discovery supports bounded GitHub searches/topics, release monitoring, npm/PyPI/crates provenance and a community README as a source of candidates only. Deterministic classification and canonical repository IDs deduplicate aliases/forks. No star threshold is used. Source failures and rate limits are visible; optional GitHub credentials go only to `api.github.com`. End users need no key for the shipped catalog. Internet discovery is manual on the user's machine.

```sh
node bin/shrinkcage.mjs registry list
node bin/shrinkcage.mjs registry show rtk
node bin/shrinkcage.mjs registry discover --source github --query output
# Metadata update: preview first, then repeat with --approve FINGERPRINT
node bin/shrinkcage.mjs registry update
```

The weekly [discovery workflow](../.github/workflows/registry-discovery.yml) uses GitHub's scoped workflow token and prepares a **review-only** PR. It changes the queue and discovery cursor, never the canonical catalog. An API denial produces a failed report/artifact; PR creation denied by repository policy leaves a review branch and an explicit job failure. Nothing is automatically merged or promoted. Changed upstream versions are queued, not installed or applied to profiles. Bounded batches retain uninspected version changes for the next run.

## Maintainer admission

1. **Identity/provenance:** canonical source, README pin, official documentation, package repository match, license/components.
2. **Relevance:** a concrete context/token/resource/cost mechanism, or explicitly supporting analytics/evaluation.
3. **Maintenance:** release history, source activity, archive state, documented interfaces and CI evidence. Popularity is supplementary.
4. **Security/supply chain:** advisory coverage, dependency-audit coverage, provenance, permissions, network/data behavior. Returned advisory records are not an all-dependency audit.
5. **Function:** distinguish upstream documentation from isolated protocol/fixture tests and native checks. No untrusted candidate execution on the host.
6. **Compatibility:** agents, OS/architecture, versions, billing, mechanism, isolation, dependencies/conflicts and unsupported combinations.
7. **Optimization evidence:** attributed claims, reproducibility, quality/latency limitations, or explicitly not measured. Supporting tools need not claim direct savings.
8. **Publication:** named reviewer, date, scope, version, reasons, sources and retained artifacts. Automation cannot pass this gate.

Review a proposal in `registry/review-queue.json`, attach reproducible test artifacts where available and run:

```sh
npm run registry:validate
npm run registry:review -- --candidate TOOL_ID --decision approve \
  --reviewer "MAINTAINER" --reason "Specific evidence and limits" --scope metadata-guided
# Inspect the preview, then repeat the same command with --approve FINGERPRINT.
# Use managed-adapter only with a trusted adapter and retained isolated-test evidence.
```

The review CLI records the decision artifact, increments the catalog revision and recomputes integrity. Inspect the diff, run all gates and publish through a reviewed PR. Rejection stays in the queue. Suspend/deprecate retains the existing public identity as a tombstone. Catalog schema version 1 and taxonomy version 1 are independent of app and catalog release versions. Schema changes require an explicit parser/storage migration; unsupported versions fail closed.

## Distribution, offline behavior and revocation

`registry/catalog.json` and `integrity.json` ship with the app. A manually approved metadata update is pinned to a commit of **datasound-projects/Shrinkcage**, verifies Git blob identity plus the full SHA-256 digest and strict schema, rejects rollback/same-revision mutation and requires existing identities/tombstones. The trust root is that fixed GitHub repository over HTTPS, **not** an independent signing key. Metadata updates do not update executables.

SQLite stores an integrity-checked cached catalog separately from local bindings, profiles and sessions. Cached metadata retains original observation/synchronization dates offline; serving it does not refresh validation dates. A corrupt cache falls back to shipped browsing with an error and blocks registry stack changes. Stop the app, back up the private database and repair/restore that cache before retrying; do not delete unrelated session data. Suspended/deprecated adapters block new affected launches. Existing running agents and unrelated configurations are never terminated or silently rewritten.

Budgets: catalog 2 MiB; individual metadata response 1 MiB; two requests in flight, six-second timeouts; candidate records 200, cached documents 40, job history 20 (latest five displayed). No hard-coded optimizer count. These records remain local until explicitly removed/replaced, or the app data directory is removed; session retention is separate. See [Privacy](PRIVACY.md).

## Extend it

The [catalog JSON Schema](../registry/catalog.schema.json) and [candidate schema](../registry/candidate.schema.json) describe structural contracts. `server/registry/schema.ts` is the authoritative equivalent runtime validator and also enforces ordered gates, source relationships, trust, privacy and byte budgets. Taxonomy, cards, filters, details and typed configuration forms are data-driven. Reviewed core adapters and the [SDK](PLUGINS.md) supply execution capabilities; catalog data cannot supply arbitrary code. A future registry entry needs no session-store or UI tool-name branch.

See [contribution checklist](../registry/README.md), [compatibility](COMPATIBILITY.md) and [validation evidence](VALIDATION.md). Optional future AI classification and broad automatic installers are not implemented. Dynamic upstream testing still requires a disposable credential-free environment and explicit maintainer review.
