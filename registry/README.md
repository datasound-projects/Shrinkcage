# Contribute an optimizer

The official catalog is curated. Search results, package metadata and community lists produce candidates, never approved entries.

1. Use **Optimizer Registry → Add / Suggest Optimizer**, then download its review proposal, or open an [optimizer suggestion](https://github.com/datasound-projects/Shrinkcage/issues/new?template=optimizer-suggestion.yml).
2. Supply the canonical public repository, official documentation, exact version/license, optimization mechanism and known restrictions. Explain whether it directly optimizes or supports measurement/evaluation.
3. Attach source references and reproducible, credential-free test instructions. Separate upstream claims from your measurements. Include workload, quality checks, model, caching, latency and overhead if claiming savings.
4. Use the [catalog](catalog.schema.json) / [candidate](candidate.schema.json) contracts. New mechanisms need a reviewed [adapter](../docs/PLUGINS.md); metadata cannot execute software.
5. Run `npm run registry:validate` and the relevant tests. Do not include private paths, credentials, sessions, raw prompts or task content.
6. A maintainer reviews all eight [admission gates](../docs/REGISTRY.md#maintainer-admission), records a scoped decision with the review CLI, and approves a catalog PR. There is no automatic promotion.

Typical rejection reasons: unrelated generic AI infrastructure; unclear upstream/package ownership; missing license; abandoned interface; unsupported security claims; unreproducible benchmark used as fact; unsafe global configuration changes; credential access; unreviewed executable payload. Missing native integration can instead receive a truthful metadata-guided listing. Partial/unavailable evidence stays visible.

`review-queue.json` contains public proposals; local personal candidates never sync automatically. `discovery-state.json` tracks only public repository observations and query progress. `reviews/` retains approval evidence. Suspensions/deprecations retain identities rather than disappearing. `integrity.json` covers the exact UTF-8 bytes of `catalog.json`; regenerate through the maintainer workflow and review the diff. Do not edit one without validating the other.
