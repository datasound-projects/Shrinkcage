import test from 'node:test';
import assert from 'node:assert/strict';
import { createSerenaActivityLog } from '../server/serena-activity.js';
import type { ToolRow } from '../server/types.js';

const row = (name: string, calls: number | null): ToolRow => ({ name, calls, input: null, output: null, active: true });
const instance = (rows: ToolRow[], port = 24283) => ({ port, rows });
const t0 = '2026-10-29T17:00:00Z'; const t1 = '2026-10-29T17:00:10Z'; const t2 = '2026-10-29T17:00:20Z';
test('existing Serena usage is labelled as a first observation, not a new execution', () => {
  const update = createSerenaActivityLog(); const events = update([instance([row('find_symbol', 4)])], t0);
  assert.equal(events.length, 1); assert.equal(events[0].tool, 'find_symbol'); assert.equal(events[0].kind, 'snapshot');
  assert.equal(events[0].count, null); assert.equal(events[0].total, 4); assert.equal(events[0].observedAt, t0); assert.equal(events[0].since, null);
});
test('call updates are grouped by tool and polling interval, with no duplicate entries', () => {
  const update = createSerenaActivityLog(); update([instance([row('find_symbol', 4)])], t0);
  update([instance([row('find_symbol', 4)])], t1);
  const events = update([instance([row('find_symbol', 7)])], t2);
  assert.equal(events.length, 2); assert.equal(events[0].kind, 'calls'); assert.equal(events[0].count, 3);
  assert.equal(events[0].since, t1); assert.equal(events[0].observedAt, t2); assert.equal(events[0].total, 7);
});
test('explicit zero establishes a baseline without pretending a tool was called', () => {
  const update = createSerenaActivityLog(); assert.deepEqual(update([instance([row('read_file', 0)])], t0), []);
  const events = update([instance([row('read_file', 1)])], t1);
  assert.equal(events[0].kind, 'calls'); assert.equal(events[0].count, 1);
});
test('missing or offline counters preserve the last valid baseline', () => {
  const update = createSerenaActivityLog(); update([instance([row('read_file', 2)])], t0);
  update([], t1); update([instance([row('read_file', null)])], t1);
  const events = update([instance([row('read_file', 3)])], t2);
  assert.equal(events.length, 2); assert.equal(events[0].count, 1); assert.equal(events[0].since, t0);
});
test('counter resets are explicit, not fictional negative or fresh call counts', () => {
  const update = createSerenaActivityLog(); update([instance([row('find_symbol', 9)])], t0);
  const events = update([instance([row('find_symbol', 1)])], t1);
  assert.equal(events[0].kind, 'reset'); assert.equal(events[0].count, null); assert.equal(events[0].total, 1);
  assert.equal(update([instance([row('find_symbol', 2)])], t2)[0].count, 1);
});
test('the same tool on distinct Serena instances has independent counters', () => {
  const update = createSerenaActivityLog(); update([instance([row('find_symbol', 2)], 24282), instance([row('find_symbol', 8)], 24283)], t0);
  const events = update([instance([row('find_symbol', 3)], 24282), instance([row('find_symbol', 8)], 24283)], t1);
  assert.equal(events.length, 3); assert.equal(events[0].port, 24282); assert.equal(events[0].count, 1);
});
test('activity retention is bounded and newest observations come first', () => {
  const update = createSerenaActivityLog(3);
  for (let n = 1; n <= 8; n++) update([instance([row('find_symbol', n)])], t0);
  const events = update([], t1); assert.equal(events.length, 3); assert.equal(events[0].total, 8); assert.equal(events[2].total, 6);
});
test('invalid counters and names cannot leak arbitrary contents into the log', () => {
  const update = createSerenaActivityLog();
  assert.deepEqual(update([instance([row('private arguments /project', 1), row('read_file', -1), row('find_symbol', 1.5), row('list_dir', null)])], t0), []);
});
