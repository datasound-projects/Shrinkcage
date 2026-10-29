import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { collectHeadroom, collectRtk, collectSerena } from './adapters.js';
import { createSerenaActivityLog } from './serena-activity.js';
import { appDataDir, findBinary } from './platform.js';
import { date, errorText, list, num, obj, portRange, run, type Run } from './util.js';
import type { Dashboard, Point, Service } from './types.js';

export interface Listener { port: number; process: string; pid: number }
export function parseListeners(text: string): Listener[] {
  let pid = 0; let process = ''; const rows: Listener[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    if (line.startsWith('c')) process = line.slice(1).replace(/[^\w .-]/g, '').slice(0, 60);
    if (line.startsWith('n')) { const port = Number(line.match(/:(\d+)$/)?.[1]); if (Number.isInteger(port) && port > 0 && pid > 0) rows.push({ port, process, pid }); }
  }
  return rows;
}
export async function collectListeners(exec: Run = run) {
  if (process.platform === 'win32') {
    const text = await exec('powershell.exe', ['-NoProfile','-NonInteractive','-Command','Get-NetTCPConnection -State Listen | Select-Object LocalPort,OwningProcess | ConvertTo-Json -Compress']);
    const raw = JSON.parse(text); return (Array.isArray(raw)?raw:[raw]).flatMap(x => Number.isInteger(x.LocalPort) ? [{port:x.LocalPort,process:'PID '+x.OwningProcess,pid:x.OwningProcess}] : []);
  }
  if (process.platform === 'linux' && !(await findBinary('lsof'))) {
    const text = await exec('ss',['-H','-ltnp']);
    return text.split('\n').flatMap(line => {const p=Number(line.trim().split(/\s+/)[3]?.match(/:(\d+)$/)?.[1]);const info=line.match(/\(\("([\w.-]+)",pid=(\d+)/);return p?[{port:p,process:info?.[1]??'Not reported',pid:Number(info?.[2]??0)}]:[];});
  }
  return parseListeners(await exec('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn']));
}
export function singleFlight<T>(work: () => Promise<T>, ttl: number) {
  let current: Promise<T> | null = null; let cached: T | undefined; let completed = 0;
  return (force = false): Promise<T> => {
    if (current) return current;
    if (!force && cached !== undefined && Date.now() - completed < ttl) return Promise.resolve(cached);
    current = work().then(value => { cached = value; completed = Date.now(); return value; }).finally(() => { current = null; });
    return current;
  };
}
export function createCollector() {
  const ports = portRange(process.env.SERENA_PORT_START, process.env.SERENA_PORT_COUNT);
  const snapshots = process.env.MONITOR_SNAPSHOTS === '1';
  const directory = join(appDataDir(), 'snapshots');
  const history = new Map<string, Point[]>(); let restored = false; let previous: Dashboard | null = null; let savedAt = 0;
  const activityLog = createSerenaActivityLog();
  return singleFlight(async (): Promise<Dashboard> => {
    const [h, r, s, listenersResult] = await Promise.all([collectHeadroom(), collectRtk(), collectSerena(ports), collectListeners().then(rows => ({ rows, error: null }), e => ({ rows: null, error: errorText(e) }))]);
    const checkedAt = new Date().toISOString(); const systemErrors = listenersResult.error ? [listenersResult.error] : [];
    s.activityLog = activityLog(s.instances, checkedAt);
    if (snapshots && !restored) {
      restored = true;
      try {
        const text = await readFile(join(directory, 'snapshots.json'), 'utf8');
        if (text.length < 2_000_000) for (const entry of list(obj(JSON.parse(text)).serena)) {
          const o = obj(entry); if (typeof o.key !== 'string' || !/^\d+(,\d+)*$/.test(o.key)) continue;
          const points = list(o.points).flatMap(x => date(obj(x).date) && num(obj(x).calls) !== null ? [{ date: date(obj(x).date)!, calls: num(obj(x).calls), saved: null, input: null, output: null }] : []);
          history.set(o.key, points.slice(-8640));
        }
      } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') systemErrors.push('Local snapshots could not be read; live metrics remain available.'); }
    }
    const key = s.instances.filter(x => x.calls !== null).map(x => x.port).sort((a,b) => a-b).join(',');
    if (s.calls !== null && key) {
      let points = history.get(key) ?? [];
      // Counter reset / instance replacement starts a new observation series.
      if (points.at(-1)?.calls !== null && (points.at(-1)?.calls ?? 0) > s.calls) points = [];
      points.push({ date: checkedAt, calls: s.calls, saved: null, input: null, output: null });
      history.set(key, points.slice(-8640)); s.history = points.slice(-8640);
      while (history.size > 10) history.delete(history.keys().next().value!);
    }
    if (previous) for (const [source, target] of [[previous.headroom, h], [previous.rtk, r], [previous.serena, s]] as const) if (target.lastSuccess === null) target.lastSuccess = source.lastSuccess;
    const services: Service[] = [];
    const service = (name: string, port: number, reachable: boolean, integration: string, dashboard: string | null) => {
      const listener = listenersResult.rows?.find(x => x.port === port);
      services.push({ name, port, listening: listenersResult.rows === null ? null : !!listener, reachable, integration, process: listener?.process ?? null, pid: listener?.pid ?? null, dashboard: reachable ? dashboard : null });
    };
    service('Headroom', 8787, h.state !== 'offline', h.state === 'connected' ? 'Metrics available' : h.state === 'degraded' ? 'Partial metrics / health' : 'Offline', h.dashboard);
    if (!s.instances.length) service('Serena', ports[0], false, 'Agent MCP connection unverified', null);
    for (const instance of s.instances) service('Serena', instance.port, true, 'Dashboard reachable · MCP unverified', instance.dashboard);
    service('Shrinkcage', 8790, true, 'Running', 'http://localhost:8790');
    const dashboard: Dashboard = { updatedAt: checkedAt, headroom: h, rtk: r, serena: s, services, systemErrors, snapshots };
    if (snapshots && Date.now() - savedAt > 60_000) {
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await writeFile(join(directory, 'snapshots.tmp'), JSON.stringify({ version: 1, updatedAt: checkedAt, counters: { headroomSaved: h.saved, rtkSaved: r.saved }, serena: key && history.has(key) ? [{ key, points: history.get(key) }] : [] }), { mode: 0o600 });
        await rename(join(directory, 'snapshots.tmp'), join(directory, 'snapshots.json')); savedAt = Date.now();
      } catch { systemErrors.push('Local snapshot write failed; live monitoring continues.'); }
    }
    previous = dashboard; return dashboard;
  }, 9000);
}
