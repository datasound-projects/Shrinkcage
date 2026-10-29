import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectHeadroom, collectRtk, collectSerena, commandName, normalizeHeadroom, normalizeRtk, normalizeSerena, readRtkDetails } from '../server/adapters.js';
import { parseListeners, singleFlight } from '../server/collector.js';
import { getJson, portRange } from '../server/util.js';

test('Headroom reads reported fields and preserves runtime/session/lifetime scopes', () => {
  const h = normalizeHeadroom({ tokens: { input: 900, output: 200, saved: 100, savings_percent: 10 }, requests: { total: 5, failed: 0, cached: 2 }, cache: { total_hits: 0, entries: 2 }, telemetry: { enabled: true }, summary: { cost: { total_saved_usd: 0.04 } } }, { lifetime: { tokens_saved: 900 }, display_session: { tokens_saved: 300 }, series: { daily: [{ timestamp: '2026-10-29T00:00:00Z', tokens_saved: 80, total_tokens_saved: 900, total_input_tokens_delta: 500 }] } }, { service: 'headroom-proxy', status: 'healthy' });
  assert.equal(h.state, 'connected'); assert.equal(h.saved, 100);
  assert.equal(h.metrics.find(m => m.label === 'Lifetime compression saved')?.value, 900);
  assert.equal(h.metrics.find(m => m.label === 'Successful requests')?.value, null);
  assert.equal(h.metrics.find(m => m.label === 'Failed requests')?.value, 0);
  assert.equal(h.metrics.find(m => m.label === 'Cache hits')?.value, 0);
  assert.equal(h.metrics.find(m => m.label === 'Cache entries')?.value, 2);
  assert.equal(h.periods.daily[0].saved, 80, 'period delta must not be replaced by cumulative total');
  assert.equal(h.periods.daily[0].calls, null); assert.equal(h.telemetry, 'on');
});
test('Headroom missing and invalid values stay N/A, telemetry guidance is explicit', () => {
  const h = normalizeHeadroom({ tokens: { saved: '100', input: -1, output: Infinity }, telemetry: { enabled: false } }, {}, {});
  assert.equal(h.saved, null); assert.equal(h.state, 'degraded'); assert.equal(h.metrics[0].value, null);
  assert.ok(h.notes.some(x => x.includes('HEADROOM_TELEMETRY=on'))); assert.deepEqual(h.periods.daily, []);
});
test('Headroom failures are independent; history failure retains live metrics', async () => {
  const h = await collectHeadroom(async (_, path) => { if (path === '/stats-history') throw new Error('history offline'); return path === '/stats' ? { tokens: { saved: 20 } } : { service: 'headroom-proxy', status: 'healthy' }; });
  assert.equal(h.saved, 20); assert.equal(h.state, 'degraded'); assert.ok(h.errors.includes('history offline'));
});
test('offline services return disconnected records without invented zeroes', async () => {
  const offline = async () => { throw new Error('offline'); };
  const [h, r, s] = await Promise.all([collectHeadroom(offline), collectRtk(offline), collectSerena([24282,24283], offline)]);
  assert.equal(h.state, 'offline'); assert.equal(r.state, 'offline'); assert.equal(s.state, 'offline');
  assert.equal(h.saved, null); assert.equal(r.commands, null); assert.equal(s.calls, null); assert.deepEqual(s.instances, []);
});
test('RTK totals, estimates and periods use its actual JSON fields', () => {
  const r = normalizeRtk({ summary: { total_commands: 10, total_input: 1000, total_output: 400, total_saved: 600, avg_savings_pct: 60 }, daily: [{ date: '2026-10-29', commands: 10, saved_tokens: 600 }], weekly: [{ week_start: '2026-10-26', commands: 10 }], monthly: [{ month: '2026-10', saved_tokens: 600 }] }, { summary: {} });
  assert.equal(r.perCommand, 60); assert.equal(r.periods.daily[0].saved, 600); assert.equal(r.periods.weekly[0].saved, null);
  assert.ok(r.periods.monthly[0].date.startsWith('2026-10-01')); assert.deepEqual(r.recent, []);
});
test('RTK zero commands is explicit tracking empty state; safe fixed argument arrays', async () => {
  const calls: [string,string[]][] = [];
  const r = await collectRtk(async (bin,args) => { calls.push([bin,args]); return JSON.stringify({ summary: { total_commands: 0, total_saved: 0 } }); });
  assert.equal(r.commands, 0); assert.equal(r.perCommand, null); assert.ok(r.notes.some(x => x.includes('No tracking data yet')));
  assert.deepEqual(calls, [['rtk',['gain','--all','--format','json']], ['rtk',['gain','--history','--format','json']]]);
});
test('RTK strips private command arguments and resists shell content', () => {
  assert.equal(commandName('rtk git status --token secret /private/project'), 'rtk git status');
  assert.equal(commandName('rtk curl https://user:secret@host'), 'rtk curl');
  assert.equal(commandName('TOKEN=secret curl localhost'), 'Other command');
  assert.equal(commandName('rtk rm -rf /anything'), 'Other command');
  assert.equal(commandName('rtk git status;$(echo secret)'), 'rtk git');
});
test('invalid RTK output cannot leak raw command output through parser errors', async () => {
  const r = await collectRtk(async () => 'private-token-value: invalid JSON');
  assert.equal(r.state, 'offline'); assert.ok(r.errors.some(x => x.includes('invalid JSON')));
  assert.ok(!JSON.stringify(r).includes('private-token-value'));
});
test('read-only RTK fallback emits sanitized aggregates and bounded history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codex-monitor-test-')); const path = join(directory, 'fixture.db');
  const db = new DatabaseSync(path); db.exec('CREATE TABLE commands (id INTEGER, timestamp TEXT, rtk_cmd TEXT, input_tokens INTEGER, output_tokens INTEGER, saved_tokens INTEGER, savings_pct REAL)');
  db.prepare('INSERT INTO commands VALUES (1,?,?,?,?,?,?)').run('2026-10-29 12:00:00', 'rtk git status /private/secret',100,40,60,60); db.close();
  const before = await stat(path); const previous = process.env.RTK_DATABASE_PATH; process.env.RTK_DATABASE_PATH = path;
  try { const r = await readRtkDetails(); assert.equal(r.rows[0].name, 'rtk git status'); assert.equal(r.rows[0].saved, 60); assert.ok(!JSON.stringify(r).includes('/private/secret')); assert.equal((await stat(path)).mtimeMs, before.mtimeMs); }
  finally { if (previous === undefined) delete process.env.RTK_DATABASE_PATH; else process.env.RTK_DATABASE_PATH = previous; await rm(directory, { recursive:true }); }
});
test('Serena genuine usage counters never become token savings', () => {
  const s = normalizeSerena(24283, { stats: { find_symbol: { num_times_called: 3, input_tokens: 12, output_tokens: 45 } } }, { tool_names: ['find_symbol','read_file'] }, { active_tools: ['find_symbol'], active_project: { name: 'demo', path: '/private/secret' }, context: { name: 'codex', path: '/secret' }, languages: ['typescript'] });
  assert.equal(s.calls, 3); assert.equal(s.rows[1].calls, null); assert.equal(s.rows[1].active, false);
  assert.equal(s.rows[0].input, 12); assert.equal(s.project, 'demo'); assert.ok(!JSON.stringify(s).includes('/private')); assert.ok(!Object.hasOwn(s, 'saved'));
});
test('empty Serena stats are unknown activity, not zero calls', () => {
  const s = normalizeSerena(24283, { stats: {} }, { tool_names: ['find_symbol'] }, { active_tools: ['find_symbol'] });
  assert.equal(s.calls, null); assert.equal(s.rows[0].calls, null); assert.equal(s.state, 'connected');
  assert.equal(s.activity, 'empty');
});
test('Serena uses the configuration summary without double-counting detailed counters', () => {
  const s = normalizeSerena(24283, { stats: { find_symbol: { num_times_called: 3, input_tokens: 12 }, read_file: {} } }, { tool_names: ['find_symbol','read_file'] }, { active_tools: ['find_symbol'], tool_stats_summary: { find_symbol: { num_calls: 9 }, read_file: { num_calls: 2 } } });
  assert.equal(s.calls, 5); assert.equal(s.rows[0].calls, 3); assert.equal(s.rows[1].calls, 2);
  assert.equal(s.rows[1].input, null); assert.equal(s.statsSource, 'Tool statistics + configuration summary');
});
test('an empty detailed snapshot cannot resurrect stale overview counts', () => {
  const s = normalizeSerena(24283, { stats: {} }, { tool_names: ['find_symbol'] }, { active_tools: [], tool_stats_summary: { find_symbol: { num_calls: 8 } } });
  assert.equal(s.calls, null); assert.equal(s.activity, 'empty'); assert.equal(s.rows[0].calls, null);
});
test('Serena summary fallback works when the detail endpoint is missing', () => {
  const s = normalizeSerena(24283, null, { tool_names: ['find_symbol'] }, { active_tools: ['find_symbol'], tool_stats_summary: { find_symbol: { num_calls: 4 } } });
  assert.equal(s.calls, 4); assert.equal(s.activity, 'recorded'); assert.equal(s.statsSource, 'Configuration summary');
});
test('an idle Serena dashboard cannot hide activity on another instance', async () => {
  const s = await collectSerena([24282,24283,24284], async (port,path) => {
    if (path === '/heartbeat') return { status: 'alive' };
    if (path === '/get_tool_names') return { tool_names: ['initial_instructions'] };
    if (path === '/get_config_overview') return { active_tools: ['initial_instructions'] };
    if (port === 24284) throw new Error('stats unavailable');
    return port === 24283 ? { stats: { initial_instructions: { num_times_called: 1 } } } : { stats: {} };
  });
  assert.equal(s.calls, 1); assert.equal(s.activity, 'recorded'); assert.equal(s.state, 'degraded');
  assert.equal(s.reportingInstances, 1); assert.equal(s.emptyInstances, 1); assert.equal(s.unavailableInstances, 1);
  assert.equal(s.instances[0].calls, null); assert.equal(s.instances[2].calls, null);
});
test('all idle Serena instances have an explicit empty state without fictional zeroes', async () => {
  const s = await collectSerena([24282,24283], async (_,path) => path === '/heartbeat' ? { status: 'alive' } : path === '/get_tool_stats' ? { stats: {} } : path === '/get_tool_names' ? { tool_names: [] } : { active_tools: [] });
  assert.equal(s.calls, null); assert.equal(s.activity, 'empty'); assert.equal(s.emptyInstances, 2); assert.equal(s.reportingInstances, 0);
});
test('invalid per-tool counters do not hide valid counts or become zero', () => {
  const s = normalizeSerena(24283, { stats: { find_symbol: { num_times_called: 2 }, read_file: { num_times_called: 'private' } } }, { tool_names: ['find_symbol','read_file'] }, { active_tools: [] });
  assert.equal(s.calls, 2); assert.equal(s.rows[1].calls, null); assert.equal(s.state, 'degraded');
  assert.ok(!JSON.stringify(s).includes('private'));
});
test('Serena discovers higher ports and keeps a partial instance independently', async () => {
  const s = await collectSerena([24282,24283,24284], async (port,path) => {
    if (port === 24282) throw new Error('offline'); if (port === 24284) return { status: 'not-serena' };
    if (path === '/heartbeat') return { status: 'alive' }; if (path === '/get_tool_stats') throw new Error('stats unavailable');
    return path === '/get_tool_names' ? { tool_names: ['find_symbol'] } : { active_tools: ['find_symbol'] };
  });
  assert.equal(s.instances.length, 1); assert.equal(s.instances[0].port, 24283); assert.equal(s.state, 'degraded'); assert.equal(s.calls, null);
  assert.ok(s.notes.some(x => x.includes('does not confirm')));
});
test('discovery range and HTTP client reject unsafe configuration', async () => {
  assert.equal(portRange(undefined,undefined).length, 10);
  assert.throws(() => portRange('80','10')); assert.throws(() => portRange('24282','100')); assert.throws(() => portRange('65535','2'));
  await assert.rejects(getJson(24282, '/execute?command=bad')); await assert.rejects(getJson(80, '/stats'));
});
test('malformed local HTTP JSON stays a safe diagnostic, never a raw response', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response('private-response-content');
  try { await assert.rejects(getJson(8787, '/stats'), error => error instanceof Error && error.message.includes('Invalid JSON response') && !error.message.includes('private-response-content')); }
  finally { globalThis.fetch = previous; }
});
test('listener parser distinguishes process and port without exposing command lines', () => {
  assert.deepEqual(parseListeners('p123\ncnode\nn127.0.0.1:8790\np456\ncpython3\nn[::1]:24283\n'), [{ port:8790, process:'node', pid:123 }, { port:24283, process:'python3', pid:456 }]);
});
test('collector coalesces simultaneous reads and caches successful completion', async () => {
  let calls = 0; const get = singleFlight(async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return calls; }, 1000);
  assert.deepEqual(await Promise.all([get(),get(),get()]), [1,1,1]); assert.equal(await get(), 1); assert.equal(calls, 1);
  assert.equal(await get(true), 2, 'manual refresh bypasses completed-response cache');
});
