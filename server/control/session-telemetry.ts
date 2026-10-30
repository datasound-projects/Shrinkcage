import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { constants } from 'node:fs';
import { lstat, open, realpath, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parseSession } from '../session-parser.js';
import { readBounded, sameOpenedFile } from './paths.js';
import { runtimeAlive, runtimeContext, runtimeEntry } from './runtime.js';
import { ControlError } from './schema.js';
import type { ControlAgent, SessionUsage } from './types.js';

const safeId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(v)&&!/^sk-|^AIza|^gh[pousr]_|^github_pat_/i.test(v);
const inside=(root:string,path:string)=>{const r=relative(root,path);return !!r&&!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep);};
export function nativeRoots(agent:ControlAgent,env:NodeJS.ProcessEnv):string[] {
  const home=env.HOME||env.USERPROFILE||homedir();
  return agent==='codex'?[join(env.CODEX_HOME||join(home,'.codex'),'sessions'),join(env.CODEX_HOME||join(home,'.codex'),'archived_sessions')]:[join(env.CLAUDE_CONFIG_DIR||join(home,'.claude'),'projects')];
}
export async function approvedTranscript(path:unknown,agent:ControlAgent,env:NodeJS.ProcessEnv,allowMissing=false):Promise<string|null> {
  if(typeof path!=='string'||path.length>4096||!isAbsolute(path)||!path.endsWith('.jsonl'))return null;
  try{
    const s=await lstat(path).catch(e=>{if(allowMissing&&e.code==='ENOENT')return null;throw e;});if(s&&(!s.isFile()||s.isSymbolicLink()))return null;
    const actual=s?await realpath(path):join(await realpath(dirname(path)),basename(path));
    for(const root of nativeRoots(agent,env))try{if(inside(await realpath(root),actual))return actual;}catch{/* absent optional root */}
  }catch{/* unavailable record */}
  return null;
}

/** A hook provides identity only. The parser still verifies the native record and project. */
export async function linkNativeSession(input:unknown,env:NodeJS.ProcessEnv=process.env) {
  if(!input||typeof input!=='object')return;
  const v=input as Record<string,unknown>,agent=env.SHRINKCAGE_AGENT as ControlAgent;
  if(!['codex','claude'].includes(agent)||!safeId(v.session_id)||v.agent_id||!env.SHRINKCAGE_PROJECT_ROOT)return;
  const context=await runtimeContext(env);if(!context||!await runtimeAlive(context.path))return;
  if(typeof v.cwd!=='string'||await realpath(v.cwd).catch(()=>null)!==await realpath(env.SHRINKCAGE_PROJECT_ROOT).catch(()=>null))return;
  if(agent==='claude'&&v.session_id!==context.id)return;
  const transcript=await approvedTranscript(v.transcript_path,agent,env,true);if(!transcript)return;
  const old=await readBounded(join(context.path,'native-link.json'),8192).catch(()=>null);
  if(old&&JSON.parse(old.toString()).id!==v.session_id)return; // /clear and subagents cannot silently change attribution.
  const target=join(context.path,'native-link.json'),temporary=target+'.'+randomUUID();
  let handle;
  try{handle=await open(temporary,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);await handle.writeFile(JSON.stringify({id:v.session_id,agent,path:transcript}));await handle.close();handle=undefined;await rename(temporary,target);}
  finally{await handle?.close();await rm(temporary,{force:true});}
}

const usageCache=new Map<string,{path:string;project:string;agent:ControlAgent;ino:bigint;dev:bigint;mtime:bigint;size:bigint;usage:SessionUsage}>();
export const forgetNativeUsage=(runtimePath:string)=>usageCache.delete(runtimePath);
export async function observeNativeUsage(runtimePath:string,agent:ControlAgent,project:string,env:NodeJS.ProcessEnv):Promise<SessionUsage|null> {
  try{
    const link=JSON.parse((await readBounded(join(runtimePath,'native-link.json'),8192))?.toString()||'null');
    if(!link||!safeId(link.id)||link.agent!==agent)return null;
    const path=await approvedTranscript(link.path,agent,env);if(!path)return null;
    // Resource bounded: large records are sampled, and never assigned a complete cost.
    const before=await lstat(path,{bigint:true});const prior=usageCache.get(runtimePath);
    if(prior&&prior.path===path&&prior.project===project&&prior.agent===agent&&prior.ino===before.ino&&prior.dev===before.dev&&prior.mtime===before.mtimeNs&&prior.size===before.size)return prior.usage;
    const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));let bytes:Buffer,sampled=false,modifiedAt:string;
    try{const opened=await handle.stat({bigint:true});if(!opened.isFile()||!sameOpenedFile(before,opened)||await realpath(path)!==path||await approvedTranscript(path,agent,env)!==path)return null;const stat=await handle.stat();modifiedAt=stat.mtime.toISOString();sampled=stat.size>8*1024*1024;
      if(sampled){const head=Buffer.alloc(65536),tail=Buffer.alloc(2*1024*1024);const a=await handle.read(head,0,head.length,0),b=await handle.read(tail,0,tail.length,Math.max(0,stat.size-tail.length));bytes=Buffer.concat([head.subarray(0,a.bytesRead),Buffer.from('\n'),tail.subarray(0,b.bytesRead)]);}
      else {bytes=Buffer.alloc(stat.size);const r=await handle.read(bytes,0,bytes.length,0);bytes=bytes.subarray(0,r.bytesRead);}
    }finally{await handle.close();}
    const records:unknown[]=[];let recognized=false,unresolvedModel=false,activeModel:string|null=null;
    const models=new Set<string>(),providers=new Set<string>();
    const safeLabel=(v:unknown):v is string=>typeof v==='string'&&/^[\w.\/:@-]{1,120}$/.test(v)&&!/^sk-|^AIza|^gh[pousr]_|^github_pat_/i.test(v);
    const lines=bytes.toString('utf8').split('\n');if(lines.length>50001)sampled=true;
    for(const line of lines.slice(0,50000)){
      if(!line)continue;if(line.length>1024*1024){sampled=true;continue;}
      try{const v=JSON.parse(line);const id=agent==='codex'&&v.type==='session_meta'?v.payload?.id??v.payload?.session_id:v.sessionId;
        if(id&&id!==link.id)return null;
        const cwd=agent==='codex'&&v.type==='session_meta'?v.payload?.cwd:v.cwd;
        if(id===link.id&&typeof cwd==='string'&&resolve(cwd)===resolve(project))recognized=true;
        if(agent==='codex'){
          if(v.type==='turn_context'){activeModel=safeLabel(v.payload?.model)?v.payload.model:null;if(activeModel&&models.size<9)models.add(activeModel);}
          if((v.type==='token_usage_record'||v.type==='event_msg'&&v.payload?.type==='token_count')&&!activeModel)unresolvedModel=true;
          if(v.type==='session_meta'&&safeLabel(v.payload?.model_provider)&&providers.size<9)providers.add(v.payload.model_provider);
        }else if(v.type==='assistant'&&v.message?.usage){
          if(safeLabel(v.message.model)){if(models.size<9)models.add(v.message.model);}else unresolvedModel=true;
          if(safeLabel(v.message.provider??v.provider)&&providers.size<9)providers.add(v.message.provider??v.provider);
        }
        records.push(v);
      }catch{sampled=true;/* incomplete tail line cannot establish complete accounting */}
    }
    if(!recognized)return null;
    const parsed=parseSession(agent,records,{fileKey:'managed',modifiedAt,sampled});if(!parsed)return null;
    const validToken=(v:number|null)=>v!==null&&Number.isSafeInteger(v)&&v>=0?v:null;
    const t=Object.fromEntries(Object.entries(parsed.tokens).map(([key,v])=>[key,validToken(v)])) as unknown as typeof parsed.tokens;
    // Claude's native input excludes cache reads/writes. Codex's input already includes cached tokens.
    const input=agent==='claude'?(t.input===null||t.cached===null||t.cacheWrite===null?null:t.input+t.cached+t.cacheWrite):t.input;
    const metadata=(v:string|null)=>v&&!/^sk-|^AIza|^gh[pousr]_|^github_pat_/i.test(v)?v:null;
    const modelCoverage=models.size>1||providers.size>1?'mixed':unresolvedModel||models.size===0?'unresolved':'single';
    const usage:SessionUsage={source:'native-session-record',observedAt:modifiedAt,nativeSessionId:link.id,model:modelCoverage==='single'?metadata(parsed.model):null,models:[...models].slice(0,8),modelCoverage,provider:providers.size>1?null:metadata(parsed.provider),
      inputTokens:input,outputTokens:t.output,cachedTokens:t.cached,cacheWriteTokens:t.cacheWrite,...(agent==='codex'?{cacheWriteIncludedInInputRate:true}:{}),
      reasoningTokens:t.reasoning,totalTokens:t.total??(input===null||t.output===null?null:input+t.output),toolCalls:parsed.observedToolCalls,
      retries:null,errors:null,latencyMs:null,reportedCostUsd:null,measurement:agent==='claude'?'derived':'provider-reported',coverage:sampled?'sampled-file':'complete-file',
      limitations:['Native identity and project matched the owned session hook. Counters describe this native session, not optimizer savings.','Reasoning is an output subset; cached tokens are an input subset.','Retries, per-request latency, quotas and invoice costs are unavailable from this record.',...(modelCoverage!=='single'?['Model/provider allocation is mixed or unresolved; the latest model cannot price the whole session.']:[]),...(sampled?['Large file sampled; tool counts and Claude usage cover sampled records only.']:[])]};
    if(usageCache.size>=128)usageCache.delete(usageCache.keys().next().value!);usageCache.set(runtimePath,{path,project,agent,ino:before.ino,dev:before.dev,mtime:before.mtimeNs,size:before.size,usage});return usage;
  }catch{return null;}
}

const quote=(s:string)=>process.platform==='win32'?`"${s}"`:`'${s.replace(/'/g,"'\\''")}'`;
export function hookCommand(event:'observe'|'rtk'):string {
  const entry=runtimeEntry('session-hook');
  if(process.platform==='win32'&&[entry.command,...entry.args].some(s=>/["%!\r\n]/.test(s)))throw new ControlError('This Windows installation path cannot safely be represented in a native hook command.');
  return [entry.command,...entry.args,'--event',event].map(quote).join(' ');
}
export function tomlValue(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(tomlValue).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).map(([k,v])=>JSON.stringify(k)+' = '+tomlValue(v)).join(',')+'}';
  return JSON.stringify(value);
}
export function sessionHookOverrides(agent:ControlAgent,rtk:boolean):string[] {
  const handler=(event:'observe'|'rtk')=>({type:'command',command:hookCommand(event),timeout:8});
  const hooks:Record<string,unknown>={SessionStart:[{hooks:[handler('observe')]}],SessionEnd:[{hooks:[handler('observe')]}]};
  if(rtk)hooks.PreToolUse=[{matcher:agent==='codex'?'^Bash$':'Bash',hooks:[handler('rtk')]}];
  return agent==='claude'?['--settings',JSON.stringify({hooks})]:Object.entries(hooks).flatMap(([event,groups])=>['--config',`hooks.${event}=${tomlValue(groups)}`]);
}
