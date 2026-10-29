import { execFile } from 'node:child_process';
import type { Periods, Point, Value } from './types.js';
export type Obj = Record<string, unknown>;
export const obj = (x: unknown): Obj => x !== null && typeof x === 'object' && !Array.isArray(x) ? x as Obj : {};
export const list = (x: unknown): unknown[] => Array.isArray(x) ? x : [];
export const str = (x: unknown): string | null => typeof x === 'string' && x.length <= 200 ? x : null;
export const num = (x: unknown): Value => typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null;
export function at(x: unknown, path: string): unknown { return path.split('.').reduce<unknown>((v, k) => obj(v)[k], x); }
export function first(x: unknown, ...paths: string[]): Value { for (const p of paths) { const n = num(at(x, p)); if (n !== null) return n; } return null; }
export const sum = (xs: Value[]): Value => xs.length && xs.every(x => x !== null) ? xs.reduce<number>((a, x) => a + (x as number), 0) : null;
export const periods = (): Periods => ({ hourly: [], daily: [], weekly: [], monthly: [] });
export function date(x: unknown): string | null {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}/.test(x)) return null;
  const s = /^\d{4}-\d{2}$/.test(x) ? `${x}-01` : x;
  const d = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s.replace(' ', 'T') + (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? 'Z' : ''));
  return Number.isFinite(d) ? new Date(d).toISOString() : null;
}
export const point = (x: unknown, kind: 'headroom' | 'rtk'): Point | null => {
  const o = obj(x); const d = date(o.timestamp ?? o.date ?? o.week_start ?? o.month);
  return d ? { date: d, saved: first(o, kind === 'rtk' ? 'saved_tokens' : 'tokens_saved'), calls: first(o, 'commands', 'requests'), input: first(o, 'input_tokens', 'total_input_tokens_delta'), output: first(o, 'output_tokens') } : null;
};
export type Run = (binary: string, args: string[]) => Promise<string>;
export const run: Run = (binary, args) => new Promise((resolve, reject) => {
  execFile(binary, args, { timeout: 3500, maxBuffer: 8 * 1024 * 1024, windowsHide: true, shell: false }, (error, stdout) => {
    if (error) { const e = error as NodeJS.ErrnoException & { killed?: boolean }; reject(new Error(e.code === 'ENOENT' ? `${binary} is not installed or is missing from PATH.` : e.killed ? `${binary} timed out.` : `${binary} exited unsuccessfully (${e.code ?? 'error'}).`)); }
    else resolve(stdout);
  });
});
const routes = new Set(['/health', '/stats', '/stats-history', '/heartbeat', '/get_tool_stats', '/get_tool_names', '/get_config_overview']);
export type Get = (port: number, path: string) => Promise<unknown>;
export const getJson: Get = async (port, path) => {
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !routes.has(path)) throw new Error('Disallowed local endpoint.');
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(2200), redirect: 'error', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error('Empty response');
    const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('Response too large'); } parts.push(value); }
    let data: unknown;
    try { data = JSON.parse(Buffer.concat(parts).toString('utf8')); }
    catch { throw new Error('Invalid JSON response'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected a JSON object');
    return data;
  } catch (e) { const message = e instanceof Error ? e.message : ''; const safe = /^HTTP \d{3}$/.test(message) || ['Invalid JSON response','Response too large','Empty response','Expected a JSON object'].includes(message); throw new Error(`127.0.0.1:${port}${path}: ${safe ? message : 'unreachable or timed out'}`); }
};
export const errorText = (e: unknown) => e instanceof Error ? e.message : 'Source unavailable.';
export function portRange(start: string | undefined, count: string | undefined): number[] {
  const s = start === undefined ? 24282 : Number(start); const n = count === undefined ? 10 : Number(count);
  if (!Number.isInteger(s) || !Number.isInteger(n) || s < 1024 || n < 1 || n > 20 || s + n > 65536) throw new Error('SERENA_PORT_START / SERENA_PORT_COUNT must define 1–20 ports in 1024–65535.');
  return Array.from({ length: n }, (_, i) => s + i);
}
