import { createHash } from 'node:crypto';
import { basename, win32 } from 'node:path';
import { date, first, list, num, obj, str, sum } from './util.js';
import type { AgentId, SessionDetail, SessionTokens } from './workspace-types.js';

export const digest = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 24);
const label = (x: unknown) => typeof x === 'string' && /^[\w.\/:@-]{1,120}$/.test(x) ? x : null;
const pathText = (x: unknown) => typeof x === 'string' && x.length <= 4096 && !x.includes('\0') ? x : null;
const toolName = (x: unknown) => typeof x === 'string' && /^[\w.:-]{1,120}$/.test(x) ? x : null;
const blank = (): SessionTokens => ({ input:null, output:null, cached:null, cacheWrite:null, reasoning:null, total:null });
const usage = (x: unknown, gemini = false): SessionTokens => gemini ? {
  input:first(x,'input'), output:first(x,'output'), cached:first(x,'cached'), cacheWrite:null, reasoning:first(x,'thoughts'), total:first(x,'total'),
} : { input:first(x,'input_tokens'), output:first(x,'output_tokens'), cached:first(x,'cached_input_tokens','cache_read_input_tokens'), cacheWrite:first(x,'cache_write_input_tokens','cache_creation_input_tokens'), reasoning:first(x,'reasoning_output_tokens'), total:first(x,'total_tokens') };
const hasUsage = (u: SessionTokens) => Object.values(u).some(x => x !== null);
const combine = (values: SessionTokens[]): SessionTokens => Object.fromEntries(Object.keys(blank()).map(key => [key, sum(values.map(x => x[key as keyof SessionTokens]))])) as unknown as SessionTokens;
function projectLabel(cwd: string | null) {
  if (!cwd) return 'Project not reported';
  const name = (cwd.includes('\\') ? win32.basename(cwd) : basename(cwd)).replace(/[\x00-\x1f]/g, '').slice(0, 80);
  return name || 'Workspace';
}

/** Projects only allowlisted metadata. Message text, arguments and results never enter the returned object. */
export function parseSession(agent: AgentId, records: unknown[], context: { fileKey: string; modifiedAt: string; sampled: boolean; archived?: boolean }): SessionDetail | null {
  let sourceId: string | null = null; let cwd: string | null = null; let projectHash: string | null = null;
  let provider: string | null = null; let model: string | null = null; let version: string | null = null;
  let startedAt: string | null = null; let lastActivityAt: string | null = null; let tokens = blank(); let recognized = false;
  let rewriteUnknown = false; let malformed = 0;
  const tools = new Map<string, { name:string; at:string|null }>();
  const messages = new Map<string, { tokens:SessionTokens; model:string|null; at:string|null; tools:{id:string;name:string;at:string|null}[] }>();
  const tokenHistory: SessionDetail['tokenHistory'] = [];
  const addTool = (name: unknown, id: unknown, at: unknown) => {
    const safe = toolName(name); if (!safe) return;
    tools.set(typeof id === 'string' ? id : `anonymous-${tools.size}`, { name:safe, at:date(at) });
  };
  const readGeminiMessage = (item: unknown) => {
    const m = obj(item); const id = str(m.id); if (!id) return;
    if (m.type !== 'gemini') { messages.set(id, { tokens:blank(), model:null, at:date(m.timestamp), tools:[] }); return; }
    messages.set(id, { tokens:usage(m.tokens,true), model:label(m.model), at:date(m.timestamp), tools:list(m.toolCalls).flatMap((t,i) => {
      const n = toolName(obj(t).name); return n ? [{id:str(obj(t).id) || `${id}-${i}`,name:n,at:date(obj(t).timestamp)}] : [];
    }) });
  };
  for (let index=0;index<records.length;index++) {
    const r = obj(records[index]); const p = obj(r.payload); const at = date(r.timestamp);
    if (at) { startedAt ??= at; if (!lastActivityAt || at > lastActivityAt) lastActivityAt = at; }
    if (agent === 'codex') {
      if (r.type === 'session_meta') {
        sourceId = label(p.id ?? p.session_id); cwd = pathText(p.cwd); provider=label(p.model_provider); version=label(p.cli_version); startedAt=date(p.timestamp) ?? startedAt; recognized = sourceId !== null;
      }
      if (r.type === 'turn_context') model = label(p.model) ?? model;
      if (r.type === 'event_msg' && p.type === 'token_count') {
        const u=usage(obj(p.info).total_token_usage); if (hasUsage(u)) { tokens=u; if(at)tokenHistory.push({at,input:u.input,output:u.output,total:u.total}); }
      }
      // Newer rollouts persist the same cumulative counters in a distinct record.
      if (r.type === 'token_usage_record') { const u=usage(p.thread_token_usage); if (hasUsage(u)) tokens=u; }
      if (r.type === 'response_item' && ['function_call','custom_tool_call'].includes(String(p.type))) addTool(p.name,p.call_id ?? p.id,at);
    } else if (agent === 'claude') {
      if (typeof r.sessionId === 'string' && ['user','assistant','system','progress'].includes(String(r.type))) {
        sourceId=label(r.sessionId) ?? sourceId; cwd=pathText(r.cwd) ?? cwd; version=label(r.version) ?? version; recognized=sourceId !== null;
      }
      if (r.type === 'assistant') {
        const m=obj(r.message); const id=str(m.id) ?? str(r.uuid); if (!id) continue;
        provider=label(m.provider ?? r.provider) ?? provider; model=label(m.model) ?? model;
        const previous=messages.get(id); const u=usage(m.usage);
        const merged = Object.fromEntries(Object.entries(u).map(([k,v])=>[k,v ?? previous?.tokens[k as keyof SessionTokens] ?? null])) as unknown as SessionTokens;
        const calls=list(m.content).flatMap((item,i)=>{const c=obj(item);const n=toolName(c.name);return c.type==='tool_use'&&n?[{id:str(c.id)??`${id}-${i}`,name:n,at}]:[];});
        messages.set(id,{tokens:merged,model,at,tools:calls.length?calls:previous?.tools??[]});
      }
    } else {
      const metadata = typeof r.sessionId === 'string' ? r : obj(r.$set);
      if (typeof metadata.sessionId === 'string' || typeof metadata.projectHash === 'string') {
        sourceId=label(metadata.sessionId) ?? sourceId; projectHash=label(metadata.projectHash) ?? projectHash;
        provider=label(metadata.provider) ?? provider; cwd=pathText(metadata.cwd) ?? cwd;
        startedAt=date(metadata.startTime) ?? startedAt; lastActivityAt=date(metadata.lastUpdated) ?? lastActivityAt; recognized=sourceId!==null;
      }
      if (metadata.lastUpdated) lastActivityAt=date(metadata.lastUpdated) ?? lastActivityAt;
      if (Array.isArray(metadata.messages)) { messages.clear(); metadata.messages.forEach(readGeminiMessage); }
      else if (r.type && r.id) readGeminiMessage(r);
      if (typeof r.$rewindTo === 'string') {
        const keys=[...messages.keys()]; const i=keys.indexOf(r.$rewindTo);
        if(i<0)rewriteUnknown=true;else keys.slice(i).forEach(k=>messages.delete(k));
      }
      const patch=obj(r.$patch);
      for (const id of list(patch.removeIds)) if(typeof id==='string') messages.delete(id);
      // Patches only alter content/tool results, which are deliberately not retained.
      // Unknown full-record rewrite variants with sampled input cannot establish a total.
      if (context.sampled && (r.$patch || r.$rewindTo || r.$set)) rewriteUnknown=true;
    }
    if (r.__malformed === true) malformed++;
  }
  if (!recognized || !sourceId) return null;
  if (agent !== 'codex') {
    const usable=[...messages.values()].filter(m=>hasUsage(m.tokens));
    tokens=combine(usable.map(m=>m.tokens));
    for(const m of messages.values()) { model=m.model ?? model; for(const t of m.tools)addTool(t.name,t.id,t.at); }
    if (rewriteUnknown) { tokens=blank(); tools.clear(); }
  }
  const projectId=digest(cwd ?? projectHash ?? `${agent}-unknown-project`);
  const id=digest(`${agent}|${sourceId}|${projectId}`);
  const activity=[...tools.values()].sort((a,b)=>(b.at??'').localeCompare(a.at??''));
  const grouped=new Map<string,{name:string;count:number;lastUsedAt:string|null}>();
  for(const t of activity) { const prior=grouped.get(t.name); if(prior)prior.count++;else grouped.set(t.name,{name:t.name,count:1,lastUsedAt:t.at}); }
  const notes=[
    'Local session metadata only. Installation, process observation and saved history do not confirm a live agent connection.',
    'Optimization metrics remain shared: this session has no verified Headroom, RTK or Serena savings attribution.',
    'Input, cached input and reasoning counters may overlap; they are not added together. Costs are not inferred from model names.',
  ];
  if(context.sampled)notes.push('Large file: metadata and the most recent 2 MiB were sampled. Tool counts and message-based usage cover only sampled records. Codex cumulative usage remains source-reported when present.');
  if(agent==='claude')notes.push('Assistant usage is deduplicated by message ID before summing. Unreported token categories remain unavailable. Provider routing is not inferred from the Claude model name.');
  if(agent==='gemini')notes.push('Gemini usage sums recorded model-message counters. Rewinds remove affected messages; only tool names are retained from calls.');
  if(rewriteUnknown)notes.push('A sampled rewrite could not be reconstructed safely; message-based usage and tool counts are unavailable.');
  if(malformed)notes.push(`${malformed} malformed or incomplete sampled records were ignored.`);
  return { id,shortId:sourceId.slice(0,8),agent,provider,model,project:{id:projectId,label:cwd?projectLabel(cwd):projectHash?`Project ${projectHash.slice(0,8)}`:'Project not reported'},
    startedAt,updatedAt:context.modifiedAt,lastActivityAt,status:Date.now()-Date.parse(context.modifiedAt)<120_000?'updated-recently':'recorded',archived:!!context.archived,
    tokens,coverage:context.sampled?'sampled':'complete-file',usageBasis:agent==='codex'?'Reported cumulative session usage':context.sampled?'Sampled message usage':'Deduplicated recorded message usage',
    observedToolCalls:tools.size?tools.size:null,version,tools:[...grouped.values()].sort((a,b)=>b.count-a.count),activity:activity.slice(0,50),tokenHistory:tokenHistory.slice(-60),notes };
}
