# Usage and billing accuracy

Billing mode, coding agent, provider and model are independent dimensions. A Codex session may use ChatGPT subscription authentication or API billing; Claude Code may use a Claude subscription or API billing. Unknown and hybrid modes are supported without assigning unsupported monetary totals.

## Billing evidence

Shrinkcage uses `codex login status` and, only when its exact help contract is present, `claude auth status --json`. Output is projected immediately into a billing mode; email, account identifiers, credentials and raw output are not retained. OAuth files are never opened, copied or exported.

`--billing subscription|api|hybrid|unknown` is an explicit user declaration, labeled as such. It does not log in, switch accounts or change billing. A declaration that contradicts a known native authentication mode blocks launch. A native status describes authentication, not an invoice: subscription extra usage, gateways and account policies may require an explicit hybrid/unknown declaration.

Subscription sessions need no API key or mandatory gateway. Headroom's reviewed managed route is restricted to Codex API sessions. Existing external routing is disclosed separately.

## Native token categories

- Codex input includes cached input. Latest cumulative checkpoints replace earlier checkpoints; they are not summed.
- Claude input in native assistant messages excludes cache reads/writes. Normalized input adds these reported categories after deduplicating message IDs. This is labeled **derived**.
- Reasoning is an output subset, never another output charge. Cache reads/writes are input subsets, never added again to normalized input.
- Sessions with mixed models/providers or missing model attribution are not priced from the latest/requested model. Aggregate native tokens can still be shown.
- A missing category stays N/A. Codex does not report cache-creation counts; those remain N/A even when a qualified OpenAI-compatible price estimate treats creation as included in the ordinary input rate.
- A native record is correlated only after matching owned hook identity, project and an approved agent-history root. A nearby timestamp or shared proxy counter is insufficient.

Counters have source, timestamp, scope, version context, method, coverage and classification. Native input/output keys follow OpenTelemetry GenAI's inclusive input/output convention; this does not enable a remote exporter. Other counters distinguish provider-reported, derived, measured, estimated and unavailable data. Whole-launch elapsed time is measured; request latency, retries and optimizer overhead remain unavailable unless supported observations exist.

## Prices and estimates

Settings accepts up to 64 exact model prices, optionally provider-specific, in **USD per million tokens**, with a public source URL and review date. There are no guessed default prices, model aliases or automatic pricing downloads. A provider-specific rate requires a matching observed provider. An unscoped model price remains a user-configured estimate.

With inclusive input `I`, output `O`, cache reads `R` and separately priced writes `W`:

```text
estimated USD = ((I - R - W) × input rate
               + O × output rate
               + R × cache-read rate
               + W × cache-write rate) / 1,000,000
```

Missing required counts/rates, inconsistent categories, stale records, partial files or unknown models withhold the estimate. A genuine reported zero stays zero. For Codex records without a cache-creation category, an explicitly qualified OpenAI-compatible estimate assumes no separate creation surcharge; its missing count is never displayed as zero. Gateway markups, taxes and invoice adjustments are not inferred.

| Billing mode | Monetary display |
|---|---|
| API | Qualified usage estimate; actual reported charge separately, if available |
| Subscription | API-equivalent usage value, explicitly an estimate |
| Hybrid / unknown | No unsupported API/subscription monetary total |

The current native JSONL collector does not supply an invoice charge, so reported charge is N/A. A fixed monthly subscription fee can be recorded separately; it is not prorated into a task charge. Lower subscription token use is a resource-efficiency observation, not automatically money saved. Provider quotas/limits are unavailable here; use the CLI's native account/usage interface.

## Overlap, budgets and experiments

Headroom reported savings, RTK output-byte/token estimates and Serena tool activity stay separate. Shared Headroom/RTK counters are never assigned to a session without valid session-level correlation. Serena usage does not imply token or USD savings.

Charts and overview estimates cover complete correlated records among the latest 50 launches, deduplicated by agent/native ID. Budget alerts use known API estimates among the latest 200, assigned by launch month; missing, older and cross-month usage can limit coverage. Budgets notify only and never stop a CLI. Changes to rates recalculate displayed estimates; saved experiment results retain their recorded comparison.

Experiments expose optimized-minus-baseline differences and quality review. Model/task/repository/effort/cache equivalence must be assessed explicitly. A successful CLI exit alone does not prove a task passed quality checks. Uncontrolled comparisons cannot establish causality; optimizer overhead and retries stay N/A when not measured. No automatic optimizer policy is learned from unrelated sessions.

Sources: [Codex hooks and transcript stability limits](https://learn.chatgpt.com/docs/hooks), [Codex authentication](https://learn.chatgpt.com/docs/auth), [Claude usage telemetry and cache semantics](https://code.claude.com/docs/en/monitoring-usage), [OpenTelemetry GenAI conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/).

## Repeated native usage scopes

A native transcript can report cumulative usage to more than one managed launch record. Summaries, charts and budget alerts deduplicate by agent plus native session ID, select the freshest observation and retain distinct scopes. Older snapshots do not overwrite newer ones. Missing native identities stay independent; missing or stale values do not become zero.

Individual launch rows remain inspectable and may refer to the same cumulative transcript. Conflicting billing modes on one native scope withhold API/subscription summary attribution instead of inventing a split. Before/after comparisons reject shared native scopes, stale observations and mixed/unresolved models; overlapping or stale usage differences remain unavailable. Fixed fees, genuine reported charges and price estimates retain their existing separate meanings. Monthly budget alerts remain bounded estimates for recorded launch cohorts, not a complete provider invoice.
