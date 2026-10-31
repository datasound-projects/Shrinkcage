import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Base, CommandRow, Dashboard, Metric, Point, ToolRow, Value } from '../server/types';
import './style.css';
import './workspace.css';
import './silver.css';
import Screen from './Screen';
import SerenaActivityLog from './SerenaActivityLog';
import DetailTabs from './DetailTabs';
import { navigation, sections, useSectionNavigation } from './useSectionNavigation';
import { ConnectorCenter, SessionExplorer, useWorkspace } from './Workspace';
const ControlWorkspace=lazy(()=>import('./control/ControlWorkspace'));
import { VERSION } from '../server/version';

const fmt = (n: Value | undefined, digits = 0) => n == null ? 'N/A' : new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(n);
const compact = (n: Value) => n === null ? 'N/A' : new Intl.NumberFormat(undefined, { notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);
const pct = (n: Value) => n === null ? 'N/A' : `${fmt(n, 1)}%`;
const stamp = (s: string | null | undefined) => s ? new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Not yet';
const calendar = (s: string) => new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fullDate = (s: string) => new Date(s).toLocaleString();
function Icon({ kind, size = 18 }: { kind: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    chart: <><path d="M4 3v17h17M8 14l4-5 4 3 5-7"/></>,
    layers: <><path d="m12 3 10 5-10 5L2 8l10-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/></>,
    terminal: <><rect x="2" y="4" width="20" height="16" rx="3"/><path d="m6 9 3 3-3 3m6 0h5"/></>,
    code: <><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/></>,
    health: <><path d="M2 12h5l3-8 4 16 3-8h5"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
    moon: <path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"/>,
    arrow: <><path d="M7 17 17 7M7 7h10v10"/></>,
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v12h5"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/></>,
    chevron: <path d="m9 6 6 6-6 6"/>,
    folder: <path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11H3V7Z"/>,
    plug: <><path d="M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0V8Zm6 9v4"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind] ?? paths.grid}</svg>;
}
function Status({ state, label }: { state: string; label?: string }) { return <span className={`status ${state}`}><i/>{label ?? ({ connected: 'Connected', offline: 'Offline', degraded: 'Partial data' }[state] || state)}</span>; }
function NativeLink({ href, children = 'Native dashboard' }: { href: string; children?: ReactNode }) { return <a href={href} target="_blank" rel="noreferrer" className="native-link">{children}<Icon kind="arrow" size={14}/></a>; }
function Empty({ title, children }: { title: string; children?: ReactNode }) { return <div className="empty"><Icon kind="chart" size={24}/><strong>{title}</strong>{children && <p>{children}</p>}</div>; }
function SourceNotes({ source }: { source: Base }) { return <div className="source-notes">{source.errors.length > 0 && <div className="error-note">{source.errors.map((error,i) => <p key={i}>{error}</p>)}</div>}<details><summary>Data scope & source notes</summary>{source.notes.map((note,i) => <p key={i}>{note}</p>)}</details><span className="last-success">Last successful read <time title={source.lastSuccess ? fullDate(source.lastSuccess) : ''}>{stamp(source.lastSuccess)}</time></span></div>; }

interface Column<T> { key: string; label: string; value: (row: T) => string | number | null | undefined; render?: (row: T) => ReactNode; numeric?: boolean }
function DataTable<T>({ columns, rows, name, initial, empty = 'Not available from this source', searchable = true }: { columns: Column<T>[]; rows: T[]; name: string; initial?: string; empty?: string; searchable?: boolean }) {
  const [query, setQuery] = useState(''); const [sort, setSort] = useState({ key: initial ?? '', desc: !!initial });
  const filtered = useMemo(() => {
    const col = columns.find(c => c.key === sort.key) ?? columns[0];
    const matches = rows.filter(row => !query || columns.some(c => String(c.value(row) ?? '').toLowerCase().includes(query.toLowerCase())));
    if (!sort.key) return matches;
    return matches.sort((a,b) => {
      const av = col.value(a); const bv = col.value(b); if (av == null) return bv == null ? 0 : 1; if (bv == null) return -1;
      return (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))) * (sort.desc ? -1 : 1);
    });
  }, [rows, columns, query, sort]);
  return <div className="data-table">
    {searchable && rows.length > 0 && <div className="table-toolbar"><span>{fmt(filtered.length)} {name}</span><label className="search"><Icon kind="search" size={15}/><input aria-label={`Search ${name}`} value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${name}…`}/>{query && <button onClick={() => setQuery('')} aria-label="Clear search">×</button>}</label></div>}
    <div className="table-scroll" tabIndex={0} role="region" aria-label={`${name} table`}><table><thead><tr>{columns.map(col => <th key={col.key} className={col.numeric ? 'number' : ''} aria-sort={sort.key === col.key ? sort.desc ? 'descending' : 'ascending' : 'none'}><button onClick={() => setSort({ key: col.key, desc: sort.key === col.key ? !sort.desc : !!col.numeric })}>{col.label}<span className="sort-arrow">{sort.key === col.key ? sort.desc ? '↓' : '↑' : '↕'}</span></button></th>)}</tr></thead><tbody>{filtered.map((row,i) => <tr key={i}>{columns.map(col => <td key={col.key} className={`${col.numeric ? 'number ' : ''}${col.value(row) == null ? 'unavailable' : ''}`}>{col.render ? col.render(row) : col.value(row) ?? 'N/A'}</td>)}</tr>)}</tbody></table>{filtered.length === 0 && <Empty title={query ? 'No matching results' : empty}>{query ? 'Try a different search.' : 'No values have been substituted for missing data.'}</Empty>}</div>
  </div>;
}
const metricColumns: Column<Metric>[] = [
  { key: 'name', label: 'Metric', value: r => r.label, render: r => <span title={`JSON field: ${r.source}`}>{r.label}</span> },
  { key: 'value', label: 'Value', value: r => r.value, numeric: true, render: r => typeof r.value === 'number' ? r.unit === 'USD' ? `$${fmt(r.value, 4)}` : r.unit === '%' ? pct(r.value) : <>{fmt(r.value, r.unit === 'ms' ? 1 : 0)}{r.unit && <small> {r.unit}</small>}</> : r.value ?? 'N/A' },
  { key: 'scope', label: 'Scope', value: r => r.scope, render: r => <span className="muted">{r.scope}</span> },
];
const commandColumns: Column<CommandRow>[] = [
  { key: 'name', label: 'Command family', value: r => r.name, render: r => <code>{r.name}</code> },
  { key: 'count', label: 'Executions', value: r => r.count, numeric: true, render: r => fmt(r.count) },
  { key: 'input', label: 'Raw · est. tokens', value: r => r.input, numeric: true, render: r => fmt(r.input) },
  { key: 'output', label: 'Optimized · est.', value: r => r.output, numeric: true, render: r => fmt(r.output) },
  { key: 'saved', label: 'Saved · est.', value: r => r.saved, numeric: true, render: r => <span className="accent-number">{fmt(r.saved)}</span> },
  { key: 'percent', label: 'Reduction', value: r => r.percent, numeric: true, render: r => pct(r.percent) },
];
const historyColumns: Column<Point>[] = [
  { key: 'date', label: 'Period starts · UTC', value: r => r.date, render: r => calendar(r.date) },
  { key: 'saved', label: 'Compression saved', value: r => r.saved, numeric: true, render: r => fmt(r.saved) },
  { key: 'input', label: 'Input tokens', value: r => r.input, numeric: true, render: r => fmt(r.input) },
  { key: 'calls', label: 'Requests', value: r => r.calls, numeric: true, render: r => fmt(r.calls) },
];
const toolColumns: Column<ToolRow>[] = [
  { key: 'name', label: 'MCP tool', value: r => r.name, render: r => <code>{r.name}</code> },
  { key: 'calls', label: 'Invocations', value: r => r.calls, numeric: true, render: r => fmt(r.calls) },
  { key: 'input', label: 'Input tokens¹', value: r => r.input, numeric: true, render: r => fmt(r.input) },
  { key: 'output', label: 'Output tokens¹', value: r => r.output, numeric: true, render: r => fmt(r.output) },
  { key: 'active', label: 'Tool state', value: r => r.active === null ? null : r.active ? 'Active' : 'Available', render: r => <span className={r.active ? '' : 'muted'}>{r.active === null ? 'N/A' : r.active ? 'Active' : 'Available'}</span> },
];

function Analytics({ data }: { data: Dashboard }) {
  const [tool, setTool] = useState('headroom'); const [range, setRange] = useState('7');
  const isToday = range === 'today';
  const rows = useMemo(() => {
    const all = tool === 'headroom' ? isToday ? data.headroom.periods.hourly : data.headroom.periods.daily : tool === 'rtk' ? data.rtk.periods.daily : data.serena.history;
    const today = new Date(data.updatedAt); today.setUTCHours(0,0,0,0);
    const cutoff = range === 'all' ? 0 : isToday ? +today : +today - (Number(range) - 1) * 86400000;
    return all.filter(x => Date.parse(x.date) >= cutoff && (tool === 'serena' ? x.calls : x.saved) !== null).map(x => ({ ...x, time: Date.parse(x.date) })).sort((a,b) => a.time - b.time);
  }, [tool, range, isToday, data]);
  const title = tool === 'headroom' ? 'Reported compression savings' : tool === 'rtk' ? 'Estimated output reduction' : 'Observed tool-call counter';
  const color = tool === 'headroom' ? '#49796a' : tool === 'rtk' ? '#6b78ad' : '#a07d51';
  const showSeconds = tool === 'serena' && rows.length > 1 && rows.at(-1)!.time - rows[0].time < 300_000;
  return <section id="analytics" className="panel analytics"><div className="section-heading"><div><div className="eyebrow">OVER TIME</div><h2>Historical analytics</h2></div><div className="segmented" aria-label="History time range">{[['today','Today'],['7','7 days'],['30','30 days'],['all','All time']].map(([value,label]) => <button key={value} aria-pressed={range === value} className={range === value ? 'selected' : ''} onClick={() => setRange(value)}>{label}</button>)}</div></div>
    <div className="chart-topline"><label className="select-label"><select aria-label="Chart data source" value={tool} onChange={e => setTool(e.target.value)}><option value="headroom">Headroom</option><option value="rtk">RTK</option><option value="serena">Serena</option></select></label><span className="chart-caption"><i style={{ background: color }}/>{title}</span><span className="chart-unit">{tool === 'serena' ? 'Calls' : tool === 'rtk' ? 'Est. tokens' : 'Tokens'} · {rows.length} {tool === 'serena' ? rows.length === 1 ? 'observation' : 'observations' : rows.length === 1 ? 'recorded period' : 'recorded periods'}</span></div>
    <div className="chart-area">{rows.length ? <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 20, right: 20, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="3 4"/>
        <XAxis type="number" dataKey="time" domain={['dataMin','dataMax']}
          tickFormatter={x => tool === 'serena' || isToday && tool === 'headroom' ? new Date(x).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: showSeconds ? '2-digit' : undefined, timeZone: 'UTC' }) : calendar(new Date(x).toISOString())}
          tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={55}/>
        <YAxis width={55} allowDecimals={false} tickFormatter={x => compact(x)} tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false}/>
        <Tooltip labelFormatter={x => new Date(Number(x)).toLocaleString(undefined, { timeZone: 'UTC' }) + ' UTC'}
          formatter={value => [fmt(typeof value === 'number' ? value : null), tool === 'serena' ? 'Observed calls' : 'Tokens saved']}
          contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--text)', fontSize: 12 }}/>
        <Line type="linear" dataKey={tool === 'serena' ? 'calls' : 'saved'} stroke={color} strokeWidth={2.3}
          dot={rows.length < 20 ? { r: 3.5, fill: 'var(--panel)', strokeWidth: 2 } : false}
          activeDot={{ r: 5 }} isAnimationActive={false} connectNulls={false}/>
      </LineChart>
    </ResponsiveContainer> : <Empty title="No historical data for this period">{tool === 'serena' ? 'A series starts when Serena reports numeric call counters. No activity is inferred from an empty response.' : 'Choose another period, or let the source record more usage.'}</Empty>}</div>
    <div className="chart-footnote"><Icon kind="info" size={14}/><span>{tool === 'serena' ? 'Snapshots of observed counters, not calls per interval. Only reporting instances contribute; coverage is shown in the overview. Resets or a change of contributors start a separate series.' : 'Source calendar buckets in UTC. Missing periods stay missing; individual points are recorded buckets. Totals are never combined across tools.'}</span></div>
  </section>;
}

function CopyCommand({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="command"><code>{value}</code><button aria-label={`Copy ${value}`} title={copied ? 'Copied' : 'Copy command'} onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } }}>{copied ? '✓' : <Icon kind="copy" size={15}/>}</button></div>;
}

function App() {
  const workspaceState = useWorkspace();
  const [data, setData] = useState<Dashboard | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark')); const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [headroomView, setHeadroomView] = useState<'metrics' | 'history' | 'requests'>('metrics');
  const [rtkView, setRtkView] = useState<'commands' | 'recent' | 'history'>('commands');
  const [serenaView, setSerenaView] = useState<'activity' | 'tools' | 'instances'>('activity');
  const [instancePort, setInstancePort] = useState<number | null>(null);
  const { active, setActive } = useSectionNavigation(!!data);
  const busy = useRef(false); const mounted = useRef(true); const abort = useRef<AbortController | null>(null); const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(async (manual = false) => {
    if (busy.current) return; busy.current = true; setLoading(true);
    if (timer.current) clearTimeout(timer.current);
    const controller = new AbortController(); abort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(manual ? '/api/refresh' : '/api/metrics', { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('The monitoring server could not refresh metrics.');
      const next = await response.json() as Dashboard;
      if (!next.updatedAt || !next.headroom || !next.rtk || !next.serena) throw new Error('The server response was incomplete.');
      setData(next); setError(null);
    } catch (e) { if (!controller.signal.aborted || !document.hidden) setError(e instanceof Error && e.name !== 'AbortError' ? e.message : 'Refresh timed out. The next refresh will retry.'); }
    finally { clearTimeout(timeout); busy.current = false; if (mounted.current) { setLoading(false); const poll = () => { if (!document.hidden) void refresh(); else timer.current = setTimeout(poll, 10_000); }; timer.current = setTimeout(poll, 10_000); } }
  }, []);
  useEffect(() => { mounted.current = true; void refresh(); const visible = () => { if (!document.hidden) void refresh(); }; document.addEventListener('visibilitychange', visible); return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); abort.current?.abort(); document.removeEventListener('visibilitychange', visible); }; }, [refresh]);
  function theme() { const next = !dark; setDark(next); document.documentElement.classList.toggle('dark', next); try { localStorage.setItem('codex-monitor-theme', next ? 'dark' : 'light'); } catch { /* storage optional */ } }
  const h = data?.headroom; const r = data?.rtk; const s = data?.serena;
  const serenaValue = !s ? '—' : s.calls !== null ? compact(s.calls) : s.state === 'offline' ? 'Offline' : s.activity === 'empty' ? 'No activity' : 'Usage unavailable';
  const serenaUnit = s && s.calls !== null ? `observed tool calls · ${s.reportingInstances} of ${s.instances.length} ${s.instances.length === 1 ? 'instance' : 'instances'}` : s?.activity === 'empty' ? 'dashboards reachable · no counters recorded' : 'reported tool-call statistics';
  const selectedInstance = s?.instances.find(instance => instance.port === instancePort) ?? s?.instances.find(instance => instance.calls !== null) ?? s?.instances[0];
  const group = navigation.find(n=>n.screens.includes(active))??navigation[0];
  const descriptions:Record<string,string>={overview:'A clear view of your sessions and optimizer activity.',managed:'Your sessions, stacks and actual tool activity.',setup:'Choose your agent, pick a stack, review and launch.',registry:'Find a tool. Check compatibility. Add it to one stack.', 'cost-usage':'Understand reported usage and qualified cost estimates.',settings:'Your local preferences, billing and connections.'};
  const activeLabel = sections.find(([id]) => id === active)?.[2] ?? 'Overview';
  return <div className="app-shell"><button className="skip-link" onClick={()=>document.getElementById('main-content')?.focus()}>Skip to content</button>
    <aside className="sidebar"><a href="#overview" className="brand"><img src="/icon.svg" className="brand-logo" alt=""/><div>Shrinkcage<small>LESS CONTEXT. MORE CLARITY.</small></div></a>
      <nav aria-label="Main navigation">{navigation.map(n=><a key={n.id} href={'#'+n.id} onClick={()=>setActive(n.id)} className={group.id===n.id?'active':''} aria-current={group.id===n.id?'page':undefined}><Icon kind={n.icon}/><span>{n.label}</span></a>)}</nav>
      <div className="sidebar-bottom"><div className="local-workspace"><span className="workspace-icon"><Icon kind="terminal" size={15}/></span><div>On your machine<small>localhost:8790</small></div><i/></div><div className="sidebar-version"><span>SHRINKCAGE</span><span>v{VERSION}</span></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{activeLabel}</strong></div><div className="top-actions"><span className={'local-label'+(error?' reconnecting':'')}><i/>{error?'Reconnecting':'Local instance'}</span><button className="icon-button" onClick={theme} aria-label={dark?'Switch to light mode':'Switch to dark mode'} title={dark?'Silver appearance':'Graphite appearance'}><Icon kind={dark?'sun':'moon'}/></button><a className="button primary new-session-action" href="#setup" onClick={()=>setActive('setup')}><span aria-hidden="true">＋</span> New session</a></div></header>
      <nav className="mobile-navigation" aria-label="Section navigation">{navigation.map(n=><a key={n.id} href={'#'+n.id} onClick={()=>setActive(n.id)} className={group.id===n.id?'active':''} aria-current={group.id===n.id?'page':undefined}><Icon kind={n.icon} size={16}/>{n.label}</a>)}</nav>
      <main id="main-content" tabIndex={-1}><div className="page-heading"><div><div className="eyebrow">LOCAL WORKSPACE</div><h1 tabIndex={-1}>{active==='registry'?'Optimizers':activeLabel}</h1><p>{descriptions[active]??'Explore the details when you need them.'}</p></div><div className="refresh-control"><button className="button" onClick={()=>{void refresh(true);window.dispatchEvent(new Event('shrinkcage:refresh'));}} disabled={loading}><span className={loading?'refreshing':''}><Icon kind="refresh" size={15}/></span>{loading?'Refreshing…':'Refresh'}</button><span aria-live="polite">{data?'Updated '+stamp(data.updatedAt):'Connecting to local sources…'}</span></div></div>
      {group.screens.length>1&&<nav className="context-navigation" aria-label="Workspace views">{group.screens.map(id=><a key={id} href={'#'+id} onClick={()=>setActive(id)} aria-current={active===id?'page':undefined}>{sections.find(([key])=>key===id)?.[2]}</a>)}</nav>}
      {error && <div role="alert" className="global-error">{error} {data && `Showing the last response from ${stamp(data.updatedAt)}.`}<button onClick={() => void refresh(true)} disabled={loading}>Retry</button></div>}
      <Suspense fallback={<section className="panel"><p>Loading optimizer controls…</p></section>}><ControlWorkspace active={active}/></Suspense>
      <Screen id="overview" active={active}><div className="overview-section-heading"><h2>Shared optimizer activity</h2><a href="#analytics">View history ↗</a></div>
      <div className="overview-grid" aria-busy={loading && !data}>
        <OverviewCard icon="layers" name="Headroom" subtitle="Context compression" state={h?.state} value={h ? compact(h.saved) : '—'} unit="tokens saved · proxy runtime" detail={<><span>{h ? pct(h.percent) : '—'} <small>reduction</small></span><span>{h ? fmt(h.requests) : '—'} <small>requests</small></span></>}/>
        <OverviewCard icon="terminal" name="RTK" subtitle="Terminal output reduction" state={r?.state} value={r ? compact(r.saved) : '—'} unit="estimated tokens saved · global" detail={<><span>{r ? pct(r.percent) : '—'} <small>reduction</small></span><span>{r ? fmt(r.commands) : '—'} <small>commands</small></span></>}/>
        <OverviewCard icon="code" name="Serena" subtitle="Symbol-aware code navigation" state={s?.state} statusLabel={s?.state === 'connected' ? 'Dashboard reachable' : undefined} value={serenaValue} message={s?.calls === null} unit={serenaUnit} detail={<><span>{s?.instances.length ?? '—'} <small>{s?.instances.length === 1 ? 'dashboard' : 'dashboards'}</small></span><span className="mcp-unverified">MCP unverified</span></>}/>
      </div>
      <div className="integrity-note"><Icon kind="info" size={14}/><span>Reported savings, output estimates, and tool activity stay separate. Savings can overlap.</span><span className="auto-refresh"><span className="privacy-dot"/>Only local data</span></div>
      </Screen><Screen id="analytics" active={active}>{data && <div className="workspace-row"><Analytics data={data}/><div className="panel activity-panel"><SerenaActivityLog entries={(s!.activityLog ?? []).slice(0, 5)} preview onExplore={() => setSerenaView('activity')}/></div></div>}

      </Screen><Screen id="sessions" active={active}><SessionExplorer state={workspaceState}/></Screen>
      <Screen id="connectors" active={active}><ConnectorCenter state={workspaceState}/></Screen>
      {data ? <>

        <Screen id="headroom" active={active}><section id="headroom" className="panel tool-section"><div className="section-heading"><div className="tool-heading"><span className="tool-icon green"><Icon kind="layers"/></span><div><h2>Headroom</h2><p>Proxy compression, token accounting & cache activity</p></div></div><div className="heading-actions"><Status state={h!.state}/>{h!.state !== 'offline' && <NativeLink href={h!.dashboard}/>}</div></div>
          {h!.telemetry === 'off' && <div className="telemetry-note"><Icon kind="info" size={16}/><p><strong>Local telemetry is disabled.</strong> For telemetry-dependent fields, restart your existing Headroom command with <code>HEADROOM_TELEMETRY=on</code>. Available proxy counters are still shown.</p></div>}
          <DetailTabs label="Headroom views" value={headroomView} onChange={setHeadroomView} options={[{value:'metrics',label:'Metrics',count:h!.metrics.length},{value:'history',label:'History'},{value:'requests',label:'Recent requests',count:h!.recent.length}]}/>
          {headroomView === 'metrics' && <DataTable rows={h!.metrics} columns={metricColumns} name="metrics"/>}
          {headroomView === 'history' && <><div className="subsection-heading"><h3>Persisted history</h3><div className="segmented small">{(['daily','weekly','monthly'] as const).map(p => <button key={p} onClick={() => setPeriod(p)} className={period === p ? 'selected' : ''} aria-pressed={period === p}>{p[0].toUpperCase()+p.slice(1)}</button>)}</div></div><DataTable rows={h!.periods[period]} columns={historyColumns} name="periods" initial="date" searchable={false}/></>}
          {headroomView === 'requests' && <DataTable rows={h!.recent} name="requests" initial="date" columns={[
            { key: 'date', label: 'Time', value: x => x.date, render: x => <time title={fullDate(x.date)}>{stamp(x.date)}</time> },
            { key: 'input', label: 'Original input', value: x => x.input, numeric: true, render: x => fmt(x.input) },
            { key: 'output', label: 'Optimized input', value: x => x.output, numeric: true, render: x => fmt(x.output) },
            { key: 'saved', label: 'Saved', value: x => x.saved, numeric: true, render: x => fmt(x.saved) },
            { key: 'exact', label: 'Accounting', value: x => x.exact === null ? 'Not available' : x.exact ? 'Reported exact' : 'Estimated' },
          ]}/>}<SourceNotes source={h!}/>
        </section></Screen>
        <Screen id="rtk" active={active}><section id="rtk" className="panel tool-section"><div className="section-heading"><div className="tool-heading"><span className="tool-icon blue"><Icon kind="terminal"/></span><div><h2>RTK</h2><p>Less terminal output, estimated from bytes</p></div></div><Status state={r!.state}/></div>
          <div className="inline-metrics"><div><span>Raw output · est. tokens</span><strong>{fmt(r!.input)}</strong></div><div><span>Optimized output · est. tokens</span><strong>{fmt(r!.output)}</strong></div><div><span>Est. savings / command</span><strong>{fmt(r!.perCommand, 1)}</strong></div></div>
          <DetailTabs label="RTK views" value={rtkView} onChange={setRtkView} options={[{value:'commands',label:'Commands',count:r!.rows.length},{value:'recent',label:'Recent activity',count:r!.recent.length},{value:'history',label:'History'}]}/>
          {rtkView === 'commands' && <><DataTable rows={r!.rows} columns={commandColumns} name="commands" initial="count" empty={r!.commands === 0 ? 'No tracking data yet' : 'Command details not available'}/><div className="table-source">{r!.detailSource} · output sizes are token estimates; raw byte sizes are not supplied.</div></>}
          {rtkView === 'recent' && <DataTable rows={r!.recent} name="recent commands" columns={[{ key: 'date', label: 'Time', value: x => x.date, render: x => x.date ? <time title={fullDate(x.date)}>{stamp(x.date)}</time> : 'N/A' }, ...commandColumns.filter(x => x.key !== 'count')]} initial="date"/>}
          {rtkView === 'history' && <div className="period-tables">{(['daily','weekly','monthly'] as const).map(p => <div key={p}><h3 className="history-label">{p}</h3><DataTable rows={r!.periods[p]} name={`${p} periods`} columns={[{ key: 'date', label: 'Period starts · source date', value: x => x.date, render: x => calendar(x.date) }, { key: 'calls', label: 'Commands', value: x => x.calls, numeric: true, render: x => fmt(x.calls) }, { key: 'saved', label: 'Saved · estimated tokens', value: x => x.saved, numeric: true, render: x => fmt(x.saved) }]} initial="date" searchable={false}/></div>)}</div>}<SourceNotes source={r!}/>
        </section></Screen>
        <Screen id="serena" active={active}><section id="serena" className="panel tool-section"><div className="section-heading"><div className="tool-heading"><span className="tool-icon sand"><Icon kind="code"/></span><div><h2>Serena MCP</h2><p>Observable tool activity, without inferred savings</p></div></div><Status state={s!.state} label={s!.state === 'connected' ? 'Dashboard reachable' : undefined}/></div>
          {s!.instances.length > 0 && <div className="serena-usage"><strong>{s!.calls !== null ? `${fmt(s!.calls)} observed tool ${s!.calls === 1 ? 'call' : 'calls'}` : s!.activity === 'empty' ? 'No activity recorded' : 'Usage statistics unavailable'}</strong><p>{s!.calls !== null ? `${s!.reportingInstances} of ${s!.instances.length} instances report call counts. ${s!.emptyInstances} have empty statistics; ${s!.unavailableInstances} have unavailable counters. Only reported counts are included.` : s!.activity === 'empty' ? 'Serena returned empty tool-statistics maps. Counts will appear here when your normal MCP tool activity is recorded.' : 'The dashboards are reachable, but no valid call counts are available. Check the source errors below.'}</p></div>}
          <DetailTabs label="Serena views" value={serenaView} onChange={setSerenaView} options={[{value:'activity',label:'Activity',count:s!.activityLog?.length ?? 0},{value:'tools',label:'Tool usage',count:s!.rows.length},{value:'instances',label:'Instances',count:s!.instances.length}]}/>
          {serenaView === 'activity' && <SerenaActivityLog entries={s!.activityLog ?? []}/>}
          {serenaView === 'instances' && (!s!.instances.length ? <Empty title="Serena is disconnected">No valid dashboard heartbeat on ports {s!.ports[0]}–{s!.ports.at(-1)}. Codex and the other integrations can keep working.</Empty> : <><div className="instance-selector" role="group" aria-label="Serena instances">{s!.instances.map(instance => <button key={instance.port} onClick={() => setInstancePort(instance.port)} aria-pressed={selectedInstance?.port === instance.port} className={selectedInstance?.port === instance.port ? 'selected' : ''}><span className={`instance-dot ${instance.state}`}/><code>:{instance.port}</code><span>{instance.calls !== null ? `${fmt(instance.calls)} calls` : instance.activity === 'empty' ? 'No activity' : 'Unavailable'}</span></button>)}</div>{selectedInstance && <div className="instance"><div className="instance-heading"><strong>Instance <code>:{selectedInstance.port}</code></strong><NativeLink href={selectedInstance.dashboard}/></div><div className="configuration-grid">{[['Observed tool calls',selectedInstance.calls !== null ? fmt(selectedInstance.calls) : selectedInstance.activity === 'empty' ? 'No activity recorded' : 'Unavailable'],['Usage source',selectedInstance.statsSource],['Active project',selectedInstance.project ?? 'None reported'],['Context',selectedInstance.context ?? 'N/A'],['Language',selectedInstance.languages.join(', ') || 'None reported'],['Active / available tools',`${fmt(selectedInstance.activeTools)} / ${fmt(selectedInstance.availableTools)}`],['Client',selectedInstance.client ?? 'Not identified'],['Interface',selectedInstance.interface ?? 'N/A']].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="connection-note"><Icon kind="info" size={15}/><span>{selectedInstance.project === null ? 'No project is active on this instance. ' : ''}Dashboard reachability alone does not confirm an agent MCP connection.</span></div></div>}</>)}
          {serenaView === 'tools' && <><DataTable rows={s!.rows} columns={toolColumns} name="tools" initial="calls"/><p className="table-source">¹ Serena-supplied tool payload token statistics, not savings. Missing counters remain N/A.</p></>}<SourceNotes source={s!}/>
        </section></Screen>
        <Screen id="health" active={active}><section id="health" className="panel health-section"><div className="section-heading"><div><div className="eyebrow">ON YOUR MACHINE</div><h2>System health</h2></div><span className="muted text-sm">Checked {stamp(data.updatedAt)}</span></div>
          <DataTable rows={data.services} name="services" searchable={false} columns={[
            { key: 'name', label: 'Service', value: x => x.name }, { key: 'port', label: 'Port', value: x => x.port, render: x => <code>{x.port}</code> },
            { key: 'listening', label: 'TCP listener', value: x => x.listening === null ? 'Unknown' : x.listening ? 'Listening' : 'Not listening' },
            { key: 'http', label: 'HTTP', value: x => x.reachable ? 'Reachable' : 'Offline', render: x => <Status state={x.reachable ? 'connected' : 'offline'} label={x.reachable ? 'Reachable' : 'Offline'}/> },
            { key: 'integration', label: 'Integration', value: x => x.integration }, { key: 'process', label: 'Process', value: x => x.process, render: x => <span className="muted">{x.process ?? 'N/A'}{x.pid ? ` · ${x.pid}` : ''}</span> },
            { key: 'link', label: 'Open', value: x => x.dashboard, render: x => x.dashboard ? <NativeLink href={x.dashboard}>Dashboard</NativeLink> : <span className="muted">N/A</span> },
          ]}/>
          {data.systemErrors.map((x,i) => <p className="error-note" key={i}>{x}</p>)}
          <details className="diagnostics-disclosure"><summary>Quick diagnostics <span>4 read-only commands</span></summary><div className="diagnostics"><div><h3>Check a connection</h3><p>Copy a command and run it locally.</p></div><div className="diagnostic-commands"><CopyCommand value="curl -fsS http://localhost:8787/health"/><CopyCommand value="rtk gain --all --format json"/><CopyCommand value={`curl -fsS http://localhost:${s!.instances[0]?.port ?? s!.ports[0]}/heartbeat`}/><CopyCommand value="lsof -nP -iTCP -sTCP:LISTEN"/></div></div></details>
          <details className="troubleshooting"><summary>Connection troubleshooting</summary><p><strong>Headroom:</strong> Confirm the proxy is running on 8787. For telemetry-dependent statistics, prefix your existing launch command with <code>HEADROOM_TELEMETRY=on</code> and restart it yourself.</p><p><strong>RTK:</strong> Make sure <code>rtk</code> is on the PATH inherited by this server. “No tracking data yet” means the source reports no commands.</p><p><strong>Serena:</strong> Inspect Serena’s startup errors and language-server availability. Check your coding agent’s existing MCP configuration and logs for a successful Serena handshake and a tool invocation. A heartbeat alone cannot verify MCP. The monitor never starts Serena or edits configuration.</p><p>Port discovery: {s!.ports[0]}–{s!.ports.at(-1)}. Override at startup with <code>SERENA_PORT_START</code> and <code>SERENA_PORT_COUNT</code> (maximum 20 ports).</p></details>
        </section></Screen>
        <footer><span><span className="privacy-dot"/>Local data. Native permissions.</span><span>Refreshes every 10 seconds</span></footer>
      </> : <div className="panel initial-loading"><Icon kind="health" size={28}/><h2>{error ? 'Waiting for the local server' : 'Reading your local tools…'}</h2><p>Each integration connects independently.</p></div>}
      </main>
    </div>
  </div>;
}
function OverviewCard({ icon, name, subtitle, state, statusLabel, value, unit, detail, message = false }: { icon: string; name: string; subtitle: string; state?: string; statusLabel?: string; value: string; unit: string; detail: ReactNode; message?: boolean }) {
  return <a className={`overview-card ${name.toLowerCase()}`} href={`#${name.toLowerCase()}`}><div className="card-top"><span className="card-name"><span className="card-icon"><Icon kind={icon} size={17}/></span>{name}</span>{state ? <Status state={state} label={statusLabel}/> : <span className="muted text-sm">Connecting</span>}</div><p className="card-subtitle">{subtitle}</p><div className={`card-value${message ? ' card-message' : ''}`} key={value}>{value}<Icon kind="chevron" size={17}/></div><div className="card-unit">{unit}</div><div className="card-detail">{detail}</div></a>;
}
createRoot(document.getElementById('root')!).render(<App/>);
