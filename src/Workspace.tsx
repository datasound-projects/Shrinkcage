import { useCallback, useEffect, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AgentConnector, AgentId, SessionDetail, SessionPage, Workspace } from '../server/workspace-types';

const agents:Record<AgentId,string>={codex:'Codex CLI',claude:'Claude Code',gemini:'Gemini CLI'};
const n=(value:number|null|undefined)=>value==null?'N/A':value.toLocaleString();
const when=(value:string|null)=>value?new Date(value).toLocaleString():'Not reported';
const provider=(value:string|null)=>value?({openai:'OpenAI',anthropic:'Anthropic',google:'Google',azure:'Azure',bedrock:'AWS Bedrock'}[value]??value):'Provider not reported';

export function useWorkspace(){
  const [workspace,setWorkspace]=useState<Workspace|null>(null),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(false);
  const flight=useRef(false),mounted=useRef(true),abort=useRef<AbortController|null>(null);
  const refresh=useCallback(async(force=false)=>{
    if(flight.current)return;flight.current=true;setLoading(true);const controller=new AbortController();abort.current=controller;const timeout=setTimeout(()=>controller.abort(),15000);
    try{const r=await fetch(force?'/api/discover':'/api/workspace',{signal:controller.signal,cache:'no-store'});if(!r.ok)throw new Error('Local agent discovery is unavailable.');const data=await r.json() as Workspace;if(mounted.current){setWorkspace(data);setError(null);}}
    catch{if(mounted.current)setError('Could not refresh agent metadata. The next discovery will retry.');}
    finally{clearTimeout(timeout);flight.current=false;if(mounted.current)setLoading(false);}
  },[]);
  useEffect(()=>{mounted.current=true;void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh();},15000);const visible=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',visible);return()=>{mounted.current=false;clearInterval(timer);abort.current?.abort();document.removeEventListener('visibilitychange',visible);};},[refresh]);
  return {workspace,error,loading,refresh};
}

function ConnectorSetup({connector,token,onSaved}:{connector:AgentConnector;token:string;onSaved:()=>void}){
  const [root,setRoot]=useState(connector.customRoot??''),[enabled,setEnabled]=useState(connector.enabled),[approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState<string|null>(null);
  useEffect(()=>{setRoot(connector.customRoot??'');setEnabled(connector.enabled);},[connector.customRoot,connector.enabled]);
  return <details className="connector-setup"><summary>Configure discovery location</summary><form onSubmit={async e=>{
    e.preventDefault();setBusy(true);setMessage(null);
    try{const r=await fetch('/api/connectors/config',{method:'POST',headers:{'Content-Type':'application/json','X-Shrinkcage-Token':token},body:JSON.stringify({agent:connector.id,root:root.trim()||null,enabled,approved})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not save location.');setMessage('Saved. Only Shrinkcage settings were updated.');setApproved(false);onSaved();}
    catch(e){setMessage(e instanceof Error?e.message:'Could not save location.');}finally{setBusy(false);}
  }}>
    <label className="field-label">Approved session folder<input aria-label={`${connector.name} session folder`} value={root} onChange={e=>setRoot(e.target.value)} placeholder="Leave empty to use standard agent locations" autoComplete="off" spellCheck={false}/></label>
    <p className="field-help">Use a folder containing this agent’s session files. No executables, arbitrary URLs, prompts or authentication files can be configured here.</p>
    <label className="checkbox-label"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Enable this connector</label>
    <label className="checkbox-label"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>I approve read-only discovery in this folder, or the standard locations when empty.</label>
    <button className="button" disabled={!approved||busy} type="submit">{busy?'Saving…':'Save approved location'}</button>
    {message&&<p className="settings-message" role="status">{message}</p>}
  </form></details>;
}

export function ConnectorCenter({state}:{state:ReturnType<typeof useWorkspace>}){
  const {workspace,error,loading,refresh}=state;
  return <section id="connectors" className="panel workspace-section"><div className="section-heading"><div><div className="eyebrow">LOCAL CONNECTIONS</div><h2>Connector center</h2><p className="section-subtitle">Discover existing agents. Keep their configuration and authentication untouched.</p></div><button className="button" disabled={loading} onClick={()=>void refresh(true)}>{loading?'Discovering…':'Refresh discovery'}</button></div>
    {error&&<p className="error-note" role="alert">{error}</p>}
    {!workspace?<div className="workspace-empty">Looking for supported local session folders…</div>:<>
      {workspace.settingsError&&<p className="error-note">{workspace.settingsError}</p>}
      <div className="connector-grid">{workspace.connectors.map(c=><article key={c.id} className={`connector-card agent-${c.id}`}>
        <div className="connector-card-top"><span className="agent-symbol">{c.id==='codex'?'O':c.id==='claude'?'C':'G'}</span><h3>{c.name}</h3><span className={`status ${c.integration==='local-history'?'connected':c.integration==='disabled'?'offline':'degraded'}`}><i/>{c.integration==='local-history'?'History available':c.integration==='disabled'?'Disabled':c.integration==='no-session-data'?'No saved sessions':'Not available'}</span></div>
        <dl className="connector-facts"><div><dt>CLI installation</dt><dd>{c.installed?'Found on PATH':'Not found on PATH'}</dd></div><div><dt>Process name</dt><dd>{c.process==='observed'?'Observed':c.process==='unavailable'?'Inspection unavailable':'Not observed'}</dd></div><div><dt>Saved sessions</dt><dd>{n(c.sessions)}</dd></div><div><dt>Agent connection</dt><dd>Not verified by history</dd></div></dl>
        <div className="connector-roots"><span>Session locations</span>{c.rootLabels.map(root=><code key={root}>{root}</code>)}</div>
        {c.integration==='no-session-data'&&<p className="connector-explanation">The folder is accessible but contains no recognized saved sessions. Normal CLI use may create them; discovery does not start the agent.</p>}
        {c.integration==='unavailable'&&<p className="connector-explanation">Install the CLI separately if desired, or approve an existing session folder below. Existing history can be read even without a CLI on PATH.</p>}
        {c.errors.map((message,i)=><p className="connector-error" key={i}>{message}</p>)}
        <details className="connector-capabilities"><summary>Capabilities & limitations</summary><ul>{[...c.capabilities,...c.limits].map(item=><li key={item}>{item}</li>)}</ul><p>{c.filesParsed} of {c.filesDiscovered} discovered files indexed · {c.sampledSessions} sampled sessions</p></details>
        <ConnectorSetup connector={c} token={workspace.csrfToken} onSaved={()=>void refresh(true)}/>
        <div className="connector-last-read">Last successful discovery <time>{c.lastSuccess?new Date(c.lastSuccess).toLocaleTimeString():'Not yet'}</time></div>
      </article>)}</div>
      <div className="connector-privacy"><strong>Read-only by design.</strong> A detected installation, process name or saved session is not a confirmed live connection. Agent authentication is left to the existing CLI. Shared Headroom, RTK and Serena metrics remain in their own sections.</div>
    </>}
  </section>;
}

function SessionInspector({session}:{session:SessionDetail}){
  return <div className="session-inspector">
    <div className="session-detail-heading"><div><span className="eyebrow">{agents[session.agent]} · {session.shortId}</span><h3>{session.project.label}</h3></div><span className="status"><i/>{session.status==='updated-recently'?'File updated recently':'Recorded session'}</span></div>
    <p className="session-observation">Status describes the saved file’s modification time, not a running agent or a confirmed connection.</p>
    <dl className="session-facts"><div><dt>Reported provider</dt><dd>{provider(session.provider)}</dd></div><div><dt>Latest reported model</dt><dd>{session.model??'Not reported'}</dd></div><div><dt>Started</dt><dd>{when(session.startedAt)}</dd></div><div><dt>Last recorded activity</dt><dd>{when(session.lastActivityAt)}</dd></div><div><dt>Recorded CLI version</dt><dd>{session.version??'Not reported'}</dd></div><div><dt>Coverage</dt><dd>{session.coverage==='sampled'?'Head + tail sample':'Complete file read'}{session.archived?' · archived':''}</dd></div></dl>
    <div className="session-usage-heading"><h3>Token usage</h3><span>{session.usageBasis}</span></div>
    <div className="session-token-grid">{[['Input',session.tokens.input],['Output',session.tokens.output],['Cached input',session.tokens.cached],['Cache writes',session.tokens.cacheWrite],['Reasoning',session.tokens.reasoning],['Reported total',session.tokens.total]].map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{n(value as number|null)}</strong></div>)}</div>
    <p className="session-accounting-note">Cached input and reasoning can be subsets of other counters. Categories are not added together. Cost: <strong>not reported</strong>. Optimization savings: <strong>shared, not attributed</strong>.</p>
    {session.tokenHistory.length>0&&<div className="session-history"><h3>Recorded cumulative usage</h3><div className="session-history-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={session.tokenHistory} margin={{top:12,right:15,left:0,bottom:0}}><CartesianGrid vertical={false} stroke="var(--line)"/><XAxis dataKey="at" tickFormatter={v=>new Date(v).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} tick={{fontSize:10,fill:'var(--muted)'}} minTickGap={60}/><YAxis width={60} tickFormatter={v=>Intl.NumberFormat(undefined,{notation:'compact'}).format(v)} tick={{fontSize:10,fill:'var(--muted)'}}/><Tooltip labelFormatter={v=>when(String(v))} contentStyle={{background:'var(--panel)',border:'1px solid var(--line)',borderRadius:8}}/><Line type="linear" dataKey="total" name="Reported total tokens" stroke="var(--green)" strokeWidth={2} isAnimationActive={false} dot={false} connectNulls={false}/></LineChart></ResponsiveContainer></div></div>}
    <div className="session-tools-heading"><h3>Recorded tool activity</h3><span>{session.observedToolCalls===null?'No tool calls found in the read records':`${n(session.observedToolCalls)} calls in read records`}</span></div>
    <div className="session-tool-list">{session.tools.length?session.tools.map(t=><div key={t.name}><code>{t.name}</code><span>{n(t.count)} {t.count===1?'call':'calls'}</span><time>{t.lastUsedAt?new Date(t.lastUsedAt).toLocaleTimeString():'Time not reported'}</time></div>):<p className="workspace-empty">No recorded tool names are available for this session.</p>}</div>
    <details className="session-notes"><summary>Data provenance & limitations</summary>{session.notes.map(note=><p key={note}>{note}</p>)}</details>
  </div>;
}

export function SessionExplorer({state}:{state:ReturnType<typeof useWorkspace>}){
  const {workspace}=state;const [search,setSearch]=useState(''),[agent,setAgent]=useState(''),[project,setProject]=useState(''),[model,setModel]=useState(''),[providerFilter,setProvider]=useState(''),[range,setRange]=useState('all'),[sort,setSort]=useState('updated'),[offset,setOffset]=useState(0);
  const [page,setPage]=useState<SessionPage|null>(null),[selected,setSelected]=useState<string|null>(null),[detail,setDetail]=useState<SessionDetail|null>(null),[error,setError]=useState<string|null>(null),[detailError,setDetailError]=useState<string|null>(null),[loading,setLoading]=useState(false);
  useEffect(()=>{setOffset(0);},[search,agent,project,model,providerFilter,range,sort]);
  useEffect(()=>{
    if(!workspace)return;const controller=new AbortController();let alive=true;const timer=setTimeout(async()=>{
      setLoading(true);const timeout=setTimeout(()=>controller.abort(),15000);
      try{const params=new URLSearchParams({sort,range,offset:String(offset),limit:'50'});for(const [k,v] of Object.entries({search,agent,project,model,provider:providerFilter}))if(v)params.set(k,v);
        const r=await fetch('/api/sessions?'+params,{signal:controller.signal,cache:'no-store'});if(!r.ok)throw new Error();const data=await r.json() as SessionPage;setPage(data);setError(null);setSelected(id=>data.items.some(s=>s.id===id)?id:data.items[0]?.id??null);
      }catch{if(alive)setError('Session metadata could not be loaded. Try refreshing discovery.');}finally{clearTimeout(timeout);if(alive)setLoading(false);}
    },200);return()=>{alive=false;clearTimeout(timer);controller.abort();};
  },[workspace?.updatedAt,search,agent,project,model,providerFilter,range,sort,offset]);
  useEffect(()=>{
    if(!selected){setDetail(null);return;}const controller=new AbortController();let alive=true;const timeout=setTimeout(()=>controller.abort(),15000);setDetail(null);setDetailError(null);
    void fetch('/api/sessions/'+selected,{signal:controller.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error();return r.json() as Promise<SessionDetail>;}).then(value=>{if(alive)setDetail(value);}).catch(()=>{if(alive)setDetailError('This session is no longer in the index or cannot be read. Refresh discovery to try again.');}).finally(()=>clearTimeout(timeout));
    return()=>{alive=false;controller.abort();clearTimeout(timeout);};
  },[selected,workspace?.updatedAt]);
  const grouped=new Map<string,Map<string,Map<string,typeof page extends null?never:SessionPage['items']>>>();
  for(const session of page?.items??[]){const p=provider(session.provider);if(!grouped.has(p))grouped.set(p,new Map());const agentGroup=grouped.get(p)!;if(!agentGroup.has(session.agent))agentGroup.set(session.agent,new Map());const projects=agentGroup.get(session.agent)!;if(!projects.has(session.project.id))projects.set(session.project.id,[]);projects.get(session.project.id)!.push(session);}
  return <section id="sessions" className="panel workspace-section"><div className="section-heading"><div><div className="eyebrow">ACROSS AGENTS & PROJECTS</div><h2>Session explorer</h2><p className="section-subtitle">Saved metadata organized by reported provider, agent and project.</p></div><span className="session-count">{workspace?n(workspace.totalSessions):'—'} indexed sessions</span></div>
    <div className="session-filters"><input aria-label="Search sessions" placeholder="Search project, model or session ID…" value={search} maxLength={100} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filter agent" value={agent} onChange={e=>setAgent(e.target.value)}><option value="">All agents</option>{Object.entries(agents).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select><select aria-label="Filter provider" value={providerFilter} onChange={e=>setProvider(e.target.value)}><option value="">All providers</option><option value="unknown">Provider not reported</option>{workspace?.providers.map(p=><option key={p} value={p}>{provider(p)}</option>)}</select><select aria-label="Filter project" value={project} onChange={e=>setProject(e.target.value)}><option value="">All projects</option>{workspace?.projects.map(p=><option key={p.id} value={p.id}>{p.label} · {p.id.slice(0,4)}</option>)}</select><select aria-label="Filter model" value={model} onChange={e=>setModel(e.target.value)}><option value="">All models</option>{workspace?.models.map(m=><option key={m}>{m}</option>)}</select><select aria-label="Session time range" value={range} onChange={e=>setRange(e.target.value)}><option value="all">All recorded time</option><option value="today">Updated today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select><select aria-label="Sort sessions" value={sort} onChange={e=>setSort(e.target.value)}><option value="updated">Recently updated</option><option value="started">Newest started</option><option value="tokens">Reported token total</option></select></div>
    {workspace?.scanLimited&&<p className="scan-note">Discovery is bounded to protect performance. More changed files are indexed on subsequent refreshes; up to 500 newest files per connector are retained. Filters apply to the current index.</p>}
    {error&&<p className="error-note" role="alert">{error}</p>}
    {!workspace?<div className="workspace-empty">Discovering local agents…</div>:!page?.items.length?<div className="workspace-empty"><strong>{loading?'Loading session metadata…':'No matching saved sessions'}</strong><p>Try another filter or check the <a href="#connectors">connector center</a>. Empty history is not an installation or authentication failure.</p></div>:<div className="session-layout" aria-busy={loading}>
      <aside className="session-sidebar" aria-label="Sessions by provider"><div className="session-list-status">{loading?'Refreshing…':`${page.total} matching sessions`}<span>{offset+1}–{Math.min(offset+50,page.total)}</span></div>
        <div className="session-groups">{[...grouped].map(([p,agentGroups])=><div key={p} className="provider-group"><h3>{p}</h3>{[...agentGroups].map(([id,projects])=><div key={id} className="session-agent-group"><h4>{agents[id as AgentId]}</h4>{[...projects].map(([pid,sessions])=><div key={pid} className="session-project-group"><div className="session-project-title">{sessions[0].project.label}<small>{pid.slice(0,4)}</small></div>{sessions.map(s=><button key={s.id} className={selected===s.id?'selected':''} onClick={()=>setSelected(s.id)} aria-pressed={selected===s.id}><span><code>{s.shortId}</code><time>{new Date(s.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time></span><small>{s.model??'Model not reported'}</small><em>{s.status==='updated-recently'?'File updated recently':s.archived?'Archived record':'Recorded session'}{s.coverage==='sampled'?' · sampled':''}</em></button>)}</div>)}</div>)}</div>)}</div>
        <div className="session-pagination"><button disabled={offset===0||loading} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous</button><button disabled={offset+50>=page.total||loading} onClick={()=>setOffset(offset+50)}>Next</button></div>
      </aside>
      <div className="session-content">{detailError?<p className="error-note" role="alert">{detailError}</p>:detail?<SessionInspector session={detail}/>:<div className="workspace-empty">Reading selected session metadata…</div>}</div>
    </div>}
  </section>;
}
