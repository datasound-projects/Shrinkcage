import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { at, date, errorText, first, getJson, list, num, obj, periods, point, run, str, sum, type Get, type Run } from './util.js';
import type { CommandRow, Headroom, Metric, Rtk, Serena, SerenaInstance, ToolRow } from './types.js';

const now = () => new Date().toISOString();
const result = (r: PromiseSettledResult<unknown>): unknown => r.status === 'fulfilled' ? r.value : null;
const errors = (rs: PromiseSettledResult<unknown>[]): string[] => rs.flatMap(r => r.status === 'rejected' ? [errorText(r.reason)] : []);
const strings = (x: unknown): string[] => list(x).map(str).filter((x): x is string => x !== null);

export function normalizeHeadroom(stats: unknown, history: unknown, health: unknown): Headroom {
  const metrics: Metric[] = [];
  function add(label: string, value: number | null, scope: string, source: string, unit?: string) { metrics.push({ label, value, scope, source, unit }); }
  const saved = first(stats, 'tokens.proxy_compression_saved', 'tokens.saved', 'summary.compression.total_tokens_removed');
  const percent = first(stats, 'tokens.proxy_savings_percent', 'tokens.savings_percent');
  const requests = first(stats, 'requests.total', 'summary.api_requests');
  const failed = first(stats, 'requests.failed');
  add('Input tokens', first(stats, 'tokens.input'), 'Proxy runtime', 'tokens.input', 'tokens');
  add('Provider-reported input', first(stats, 'tokens.input_provider_reported'), 'Proxy runtime', 'tokens.input_provider_reported', 'tokens');
  add('Estimated input', first(stats, 'tokens.input_estimated'), 'Proxy runtime', 'tokens.input_estimated', 'estimated tokens');
  add('Output tokens', first(stats, 'tokens.output'), 'Proxy runtime', 'tokens.output', 'tokens');
  add('Compression saved', saved, 'Proxy runtime', 'tokens.proxy_compression_saved / tokens.saved', 'tokens');
  add('Compression reduction', percent, 'Proxy runtime', 'tokens.proxy_savings_percent / tokens.savings_percent', '%');
  add('Proxy requests', requests, 'Proxy runtime', 'requests.total');
  // A failed count alone does not establish that every other request succeeded.
  add('Successful requests', first(stats, 'requests.successful', 'requests.success'), 'Proxy runtime', 'requests.successful');
  add('Failed requests', failed, 'Proxy runtime', 'requests.failed');
  add('Cached requests', first(stats, 'requests.cached'), 'Proxy runtime', 'requests.cached');
  add('Cache hits', first(stats, 'cache.total_hits', 'cache.hits', 'cache_stats.hits'), 'Proxy runtime', 'cache.total_hits / cache.hits');
  add('Cache entries', first(stats, 'cache.entries'), 'Current cache', 'cache.entries');
  add('Cache hit rate', first(stats, 'cache.hit_rate_percent'), 'Proxy runtime', 'cache.hit_rate_percent', '%');
  add('Compressed requests', first(stats, 'summary.compression.requests_compressed'), 'Proxy runtime', 'summary.compression.requests_compressed');
  add('Estimated compression savings', first(stats, 'summary.cost.breakdown.compression_savings_usd'), 'Proxy runtime', 'summary.cost.breakdown.compression_savings_usd', 'USD');
  add('Estimated total cost savings', first(stats, 'summary.cost.total_saved_usd'), 'Proxy runtime', 'summary.cost.total_saved_usd', 'USD');
  add('Provider cache discount', first(stats, 'summary.cost.provider_cache_discount_usd'), 'Proxy runtime · provider discount', 'summary.cost.provider_cache_discount_usd', 'USD');
  add('Schema tokens saved', first(stats, 'summary.compression.tool_schema_tokens_saved'), 'Proxy runtime', 'summary.compression.tool_schema_tokens_saved', 'tokens');
  add('Average latency', first(stats, 'latency.average_ms'), 'Proxy runtime', 'latency.average_ms', 'ms');
  add('Session compression saved', first(history, 'display_session.tokens_saved'), 'Headroom display session', 'display_session.tokens_saved', 'tokens');
  add('Session requests', first(history, 'display_session.requests'), 'Headroom display session', 'display_session.requests');
  add('Lifetime compression saved', first(history, 'lifetime.tokens_saved'), 'Persisted lifetime', 'lifetime.tokens_saved', 'tokens');
  add('Lifetime requests', first(history, 'lifetime.requests'), 'Persisted lifetime', 'lifetime.requests');
  add('Lifetime estimated compression savings', first(history, 'lifetime.compression_savings_usd'), 'Persisted lifetime', 'lifetime.compression_savings_usd', 'USD');
  add('Lifetime cache-read tokens', first(history, 'lifetime.cache_read_tokens'), 'Persisted lifetime', 'lifetime.cache_read_tokens', 'tokens');
  const p = periods();
  for (const kind of ['hourly', 'daily', 'weekly', 'monthly'] as const) p[kind] = list(at(history, `series.${kind}`)).map(x => point(x, 'headroom')).filter(x => x !== null);
  const telemetry = at(stats, 'telemetry.enabled') === false || at(stats, 'telemetry_enabled') === false ? 'off' : at(stats, 'telemetry.enabled') === true || at(stats, 'telemetry_enabled') === true ? 'on' : 'unknown';
  const healthy = obj(health).service === 'headroom-proxy' && (obj(health).status === 'healthy' || obj(health).status === 'ok') && obj(health).ready !== false;
  const valid = saved !== null || requests !== null || first(stats, 'tokens.input') !== null;
  const notes = [
    'Proxy runtime counters, Headroom display-session counters and persisted lifetime counters have different scopes.',
    'Token counts are reported by Headroom; provider-reported and estimated input are shown separately when supplied. USD figures are Headroom cost estimates.',
    'Provider cache discounts are operational context, not compression savings. Headroom and RTK savings can overlap.',
  ];
  if (telemetry === 'off') notes.push('Local telemetry is disabled. Restart your existing Headroom launch command with HEADROOM_TELEMETRY=on. Shrinkcage does not change your configuration.');
  if (telemetry === 'unknown') notes.push('Telemetry status is not explicitly reported. If telemetry-dependent fields are unavailable, restart your existing Headroom command with HEADROOM_TELEMETRY=on.');
  return {
    state: valid && healthy ? 'connected' : stats || health ? 'degraded' : 'offline', checkedAt: now(), lastSuccess: valid ? now() : null,
    errors: stats && !valid ? ['Headroom /stats returned an unsupported schema; unavailable fields are N/A.'] : [],
    notes, metrics, saved, percent, requests, healthy, telemetry, periods: p, dashboard: 'http://localhost:8787/dashboard',
    recent: list(at(stats, 'recent_requests')).slice(0, 100).flatMap(x => {
      const d = date(obj(x).timestamp); return d ? [{ date: d, input: first(x, 'input_tokens_original'), output: first(x, 'input_tokens_optimized'), saved: first(x, 'tokens_saved'), percent: first(x, 'savings_percent'), exact: typeof obj(x).has_exact_tokens === 'boolean' ? obj(x).has_exact_tokens as boolean : null }] : [];
    }),
  };
}
export async function collectHeadroom(get: Get = getJson): Promise<Headroom> {
  const rs = await Promise.allSettled(['/stats', '/stats-history', '/health'].map(path => get(8787, path)));
  const h = normalizeHeadroom(result(rs[0]), result(rs[1]), result(rs[2])); h.errors.push(...errors(rs));
  if (h.errors.length && h.state === 'connected') h.state = 'degraded';
  if (!h.healthy && result(rs[2])) h.errors.push('Headroom health is not confirmed healthy.');
  return h;
}

// Only executable families and known subcommands leave this process. Arguments, paths,
// URLs, environment assignments and full command text never enter the API or snapshots.
export function commandName(x: unknown): string {
  if (typeof x !== 'string') return 'Unknown command';
  const parts = x.trim().split(/\s+/); if (parts[0] === 'rtk') parts.shift();
  const family = parts[0] ?? '';
  const allowed = new Set(['git','cargo','npm','pnpm','yarn','bun','pip','uv','python','python3','node','go','docker','kubectl','ls','read','cat','rg','grep','find','test','lint','tsc','pytest','vitest','curl','wget','bash','sh','zsh','bypass','status','diff','log','gh','wc','head','tail','sed','awk']);
  if (!allowed.has(family)) return 'Other command';
  const subs: Record<string, string[]> = { git: ['status','diff','log','show','branch','add','commit','push','pull','fetch'], cargo: ['test','build','check','clippy','fmt'], npm: ['test','run','install','ci'], pnpm: ['test','run','install','build'], uv: ['run','pip','sync'], gh: ['pr','issue','run'], docker: ['ps','images','logs','build'], go: ['test','build','vet'], kubectl: ['get','describe','logs'] };
  return `rtk ${family}${subs[family]?.includes(parts[1]) ? ` ${parts[1]}` : ''}`;
}
export function normalizeRtk(data: unknown, history: unknown): Rtk {
  const s = obj(data).summary; const commands = first(s, 'total_commands'); const saved = first(s, 'total_saved');
  const input = first(s, 'total_input'); const output = first(s, 'total_output');
  const p = periods();
  for (const kind of ['daily', 'weekly', 'monthly'] as const) p[kind] = list(obj(data)[kind]).map(x => point(x, 'rtk')).filter(x => x !== null);
  const mapRow = (x: unknown): CommandRow => ({ name: commandName(obj(x).command ?? obj(x).rtk_cmd ?? obj(x).name), count: first(x, 'count', 'executions'), input: first(x, 'input_tokens', 'total_input'), output: first(x, 'output_tokens', 'total_output'), saved: first(x, 'saved_tokens', 'total_saved'), percent: first(x, 'savings_pct', 'avg_savings_pct'), ...(date(obj(x).timestamp) ? { date: date(obj(x).timestamp)! } : {}) });
  const valid = commands !== null || saved !== null;
  const rows = list(obj(data).commands).map(mapRow);
  const recent = list(obj(history).history).map(mapRow);
  const metrics: Metric[] = [
    { label: 'Commands processed', value: commands, scope: 'RTK global tracking', source: 'summary.total_commands' },
    { label: 'Raw output', value: input, scope: 'RTK global tracking', source: 'summary.total_input', unit: 'estimated tokens' },
    { label: 'Optimized output', value: output, scope: 'RTK global tracking', source: 'summary.total_output', unit: 'estimated tokens' },
    { label: 'Oversized rows excluded', value: first(s, 'oversized_excluded'), scope: 'RTK global tracking', source: 'summary.oversized_excluded' },
  ];
  return { state: valid ? 'connected' : 'degraded', checkedAt: now(), lastSuccess: valid ? now() : null, errors: valid ? [] : ['RTK returned no recognized numeric summary.'],
    notes: ['RTK estimates output tokens from bytes. These are output reductions, not measured model billing savings.', 'Totals use RTK’s global tracking scope. Command arguments and project paths are removed for privacy.'],
    commands, saved, input, output, percent: first(s, 'avg_savings_pct'), perCommand: saved !== null && commands !== null && commands > 0 ? saved / commands : null,
    rows, recent, periods: p, detailSource: rows.length || recent.length ? 'RTK JSON export' : 'Not available in RTK JSON export', metrics };
}

export async function readRtkDetails(_exec: Run = run): Promise<{ rows: CommandRow[]; recent: CommandRow[] }> {
  const home = homedir(); const candidates = process.env.RTK_DATABASE_PATH ? [process.env.RTK_DATABASE_PATH] : process.platform === 'darwin' ? [join(home, 'Library/Application Support/rtk/history.db')] : process.platform === 'win32' ? [join(process.env.LOCALAPPDATA || join(home,'AppData','Local'),'rtk','history.db'),join(process.env.APPDATA || join(home,'AppData','Roaming'),'rtk','history.db')] : [join(process.env.XDG_DATA_HOME || join(home, '.local/share'), 'rtk/history.db')];
  let db: string | undefined; for (const candidate of candidates) { try { await access(candidate); db = candidate; break; } catch { /* absent */ } }
  if (!db) throw new Error('RTK JSON export lacks command details and no local history database was found.');
  let raw: unknown[];
  try {
    const connection = new DatabaseSync(db, { readOnly: true });
    try {
      const columns = connection.prepare('PRAGMA table_info(commands);').all().map(x => x.name);
      if (!['id','timestamp','rtk_cmd','input_tokens','output_tokens','saved_tokens','savings_pct'].every(k => columns.includes(k))) throw new Error('Unsupported schema');
  // Fixed read-only SQL. Select no original_cmd or project_path; raw rtk_cmd is
  // normalized in memory immediately. Limit history to avoid unbounded work.
      const query = 'SELECT timestamp, rtk_cmd, input_tokens, output_tokens, saved_tokens, savings_pct FROM commands ORDER BY id DESC LIMIT 20000;';
      raw = connection.prepare(query).all();
    } finally { connection.close(); }
  } catch { throw new Error('RTK command history could not be read or has an unsupported schema; the JSON summary remains available.'); }
  const groups = new Map<string, CommandRow>(); const recent: CommandRow[] = [];
  for (const x of raw) {
    const o = obj(x); const name = commandName(o.rtk_cmd); const input = num(o.input_tokens); const output = num(o.output_tokens); const saved = num(o.saved_tokens);
    const row: CommandRow = { name, count: 1, input, output, saved, percent: num(o.savings_pct), ...(date(o.timestamp) ? { date: date(o.timestamp)! } : {}) };
    if (recent.length < 50) recent.push(row);
    const group = groups.get(name);
    if (!group) groups.set(name, { ...row, date: undefined });
    else { group.count = (group.count ?? 0) + 1; group.input = sum([group.input, input]); group.output = sum([group.output, output]); group.saved = sum([group.saved, saved]); }
  }
  const rows = [...groups.values()].map(r => ({ ...r, percent: r.input !== null && r.input > 0 && r.saved !== null ? r.saved / r.input * 100 : null })).sort((a,b) => (b.count ?? -1) - (a.count ?? -1));
  return { rows, recent };
}
export async function collectRtk(exec: Run = run, details = readRtkDetails): Promise<Rtk> {
  const rs = await Promise.allSettled([['gain','--all','--format','json'], ['gain','--history','--format','json']].map(async args => {
    const stdout = await exec('rtk', args);
    try { return JSON.parse(stdout) as unknown; } catch { throw new Error('RTK returned invalid JSON for its gain export.'); }
  }));
  const r = normalizeRtk(result(rs[0]), result(rs[1])); r.errors.push(...errors(rs));
  if (!result(rs[0])) r.state = 'offline';
  if (r.lastSuccess && (!r.rows.length || !r.recent.length) && r.commands !== 0) {
    try { const d = await details(exec); if (!r.rows.length) r.rows = d.rows; if (!r.recent.length) r.recent = d.recent; r.detailSource = 'Read-only RTK history.db · most recent 20,000 rows'; r.notes.push('This RTK version omits command rows from JSON. Details come from its existing SQLite database, opened read-only. Details may include rows excluded from RTK’s summary; do not expect identical totals.'); }
    catch (e) { r.notes.push(errorText(e)); }
  }
  if (r.commands === 0) r.notes.push('No tracking data yet. Run your usual RTK-wrapped commands to begin tracking.');
  if (r.errors.length && r.state === 'connected') r.state = 'degraded';
  return r;
}

export function normalizeSerena(port: number, stats: unknown, names: unknown, config: unknown): SerenaInstance {
  const isMap = (x: unknown) => x !== null && typeof x === 'object' && !Array.isArray(x);
  const raw = obj(obj(stats).stats); const summary = obj(obj(config).tool_stats_summary);
  const rawAvailable = isMap(obj(stats).stats); const summaryAvailable = isMap(obj(config).tool_stats_summary);
  const statsAvailable = rawAvailable || summaryAvailable;
  const active = strings(obj(config).active_tools); const activeKnown = Array.isArray(obj(config).active_tools);
  // A valid detail map is the current snapshot, including an explicitly empty
  // map after a reset. Do not resurrect older entries from a cached overview.
  const recordedNames = Object.keys(rawAvailable ? raw : summary);
  const allNames = [...new Set([...strings(obj(names).tool_names), ...active, ...list(obj(config).available_tools).map(x => str(obj(x).name)).filter((x): x is string => x !== null), ...recordedNames])];
  let usedSummary = false; let usedRaw = false;
  const rows: ToolRow[] = allNames.map(name => {
    let calls = first(raw[name], 'num_times_called');
    if (calls !== null) usedRaw = true;
    else if (!rawAvailable || Object.hasOwn(raw, name)) { calls = first(summary[name], 'num_calls'); if (calls !== null) usedSummary = true; }
    return { name, calls, input: first(raw[name], 'input_tokens'), output: first(raw[name], 'output_tokens'), active: activeKnown ? active.includes(name) : null };
  });
  // A complete absence of entries stays unknown, never a fabricated zero. Valid
  // reported counters remain visible even when another tool/instance has no data.
  const calls = sum(rows.map(x => x.calls).filter((x): x is number => x !== null));
  const partial = recordedNames.some(name => rows.find(row => row.name === name)?.calls == null);
  const activity = calls !== null ? 'recorded' : statsAvailable && recordedNames.length === 0 ? 'empty' : 'unavailable';
  const statsSource = usedSummary ? usedRaw ? 'Tool statistics + configuration summary' : 'Configuration summary' : rawAvailable ? 'Tool statistics' : summaryAvailable ? 'Configuration summary' : 'Not available';
  return { port, dashboard: `http://localhost:${port}/dashboard/`, state: statsAvailable && !partial && Array.isArray(obj(names).tool_names) && activeKnown ? 'connected' : 'degraded', calls,
    rows, activeTools: activeKnown ? active.length : null, availableTools: Array.isArray(obj(names).tool_names) ? allNames.length : null,
    project: str(at(config, 'active_project.name')), context: str(at(config, 'context.name')), languages: strings(obj(config).languages),
    modes: list(obj(config).modes).map(x => str(obj(x).name)).filter((x): x is string => x !== null), client: str(obj(config).current_client), interface: str(obj(config).agent_interface),
    statsAvailable, activity, statsSource, errors: !statsAvailable ? ['Tool statistics schema is unavailable or unsupported.'] : partial ? ['Some tool-call counters are missing or invalid; only valid reported counts are shown.'] : [],
  };
}
export async function collectSerena(ports: number[], get: Get = getJson): Promise<Serena> {
  const instances = await Promise.all(ports.map(async port => {
    try { const heartbeat = await get(port, '/heartbeat'); if (obj(heartbeat).status !== 'alive') return null; }
    catch { return null; }
    const rs = await Promise.allSettled(['/get_tool_stats','/get_tool_names','/get_config_overview'].map(path => get(port, path)));
    const instance = normalizeSerena(port, result(rs[0]), result(rs[1]), result(rs[2])); instance.errors.push(...errors(rs));
    if (instance.errors.length) instance.state = 'degraded';
    return instance;
  }));
  const found = instances.filter((x): x is SerenaInstance => x !== null);
  const reportingInstances = found.filter(x => x.calls !== null).length;
  const emptyInstances = found.filter(x => x.activity === 'empty').length;
  const unavailableInstances = found.filter(x => x.activity === 'unavailable').length;
  const calls = sum(found.map(x => x.calls).filter((x): x is number => x !== null));
  const activity = calls !== null ? 'recorded' : found.length > 0 && found.every(x => x.activity === 'empty') ? 'empty' : 'unavailable';
  return { state: found.length ? found.some(x => x.state === 'degraded') ? 'degraded' : 'connected' : 'offline', checkedAt: now(), lastSuccess: found.length ? now() : null,
    errors: found.length ? found.flatMap(x => x.errors) : [`No Serena dashboard responded with a valid heartbeat on ports ${ports[0]}–${ports.at(-1)}.`],
    notes: ['Dashboard reachability does not confirm a working agent MCP connection. Tool counters are instance-local and may include other clients.', 'No token savings are calculated for Serena. Supplied input/output token counters describe tool payload estimates, not savings.',
      `Observed calls include only valid counters from ${reportingInstances} of ${found.length} reachable instances. ${emptyInstances} instances have empty statistics; ${unavailableInstances} have unavailable call counts. Missing counts are not treated as zero.`,
      ...(activity === 'empty' ? ['No activity recorded: the dashboards returned empty statistics. No active project or client may have connected yet.'] : [])],
    instances: found, ports, calls, activity, reportingInstances, emptyInstances, unavailableInstances,
    rows: found.flatMap(x => x.rows.map(r => ({ ...r, name: found.length > 1 ? `${r.name} · :${x.port}` : r.name }))), history: [], activityLog: [] };
}
