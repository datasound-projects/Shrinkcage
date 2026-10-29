import { VERSION } from './version.js';
import { constants } from 'node:fs';
import { access, lstat, mkdir, open, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { appDataDir, agentProcess, findBinary, processNames } from './platform.js';
import { digest, parseSession } from './session-parser.js';
import { obj } from './util.js';
import type { AgentConnector, AgentId, AgentSettings, SessionDetail, SessionPage, SessionSummary, Settings, Workspace } from './workspace-types.js';

export const AGENTS: AgentId[] = ['codex','claude','gemini'];
const NAMES = {codex:'Codex CLI',claude:'Claude Code',gemini:'Gemini CLI'};
const DEFAULTS = (): Settings => ({codex:{enabled:true,root:null},claude:{enabled:true,root:null},gemini:{enabled:true,root:null}});
export function defaultRoots(agent: AgentId, home=homedir(), env=process.env) {
  if(agent==='codex')return ['sessions','archived_sessions'].map(k=>join(env.CODEX_HOME||join(home,'.codex'),k));
  if(agent==='claude')return [join(env.CLAUDE_CONFIG_DIR||join(home,'.claude'),'projects')];
  return [join(home,'.gemini','tmp')];
}
function eligible(agent: AgentId, name: string) {
  return agent==='codex'? /^rollout-[\w.-]+\.jsonl$/.test(name) : agent==='gemini'? /^session-[\w.-]+\.jsonl?$/.test(name) : /^(?:[a-fA-F0-9]{8}-[a-fA-F0-9-]{20,}|agent-[a-zA-Z0-9-]{6,})\.jsonl$/.test(name);
}
type FileEntry = {path:string;root:string;mtime:number;size:number;archived:boolean};
export async function discoverFiles(agent: AgentId, roots: string[], max=2000): Promise<{files:FileEntry[];accessible:number;errors:string[];limited:boolean}> {
  const files:FileEntry[]=[];const errors:string[]=[];let accessible=0;let directories=0;let limited=false;
  const walk=async(root:string,directory:string,depth:number):Promise<void>=>{
    if(depth>7||directories++>=2000||files.length>=max){limited=true;return;}
    let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch{errors.push('A session directory could not be read. Check local permissions.');return;}
    for(const e of entries){
      if(e.isSymbolicLink())continue;
      if(files.length>=max){limited=true;break;}
      const path=join(directory,e.name);
      if(e.isDirectory() && !['node_modules','.git','memories','memory','tool-results'].includes(e.name))await walk(root,path,depth+1);
      else if(e.isFile()&&eligible(agent,e.name))try{const s=await stat(path);files.push({path,root,mtime:s.mtimeMs,size:s.size,archived:path.split(sep).includes('archived_sessions')});}catch{errors.push('A session file disappeared or became inaccessible during discovery.');}
    }
  };
  for(const root of roots)try{if(/^[\\/]{2}/.test(root)){errors.push('Network session roots are not read. Choose a local session folder.');continue;}if((await lstat(root)).isSymbolicLink()){errors.push('A session root is a symbolic link. Select its real directory explicitly.');continue;}if(!(await stat(root)).isDirectory())continue;accessible++;await walk(root,root,0);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')errors.push('The configured session directory is inaccessible.');}
  return {files:files.sort((a,b)=>b.mtime-a.mtime).slice(0,500),accessible,errors:[...new Set(errors)].slice(0,4),limited:limited||files.length>500};
}
export async function readSessionFile(file:FileEntry):Promise<{records:unknown[];sampled:boolean}> {
  // Re-check the canonical boundary at open time; never traverse symlinked files.
  const actual=await realpath(file.path),root=await realpath(file.root);
  if((await lstat(file.path)).isSymbolicLink()||relative(root,actual).startsWith('..'+sep)||isAbsolute(relative(root,actual)))throw new Error('Unsafe session path');
  const handle=await open(file.path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try {
    const s=await handle.stat(); if(!s.isFile())throw new Error('Not a regular session file');
    if(file.path.endsWith('.json')) {
      if(s.size>8*1024*1024)throw new Error('Session JSON exceeds the 8 MiB safety limit');
      const text=await handle.readFile('utf8');try{return {records:[JSON.parse(text)],sampled:false};}catch{throw new Error('Invalid session JSON');}
    }
    const max=2*1024*1024;const sampled=s.size>max;const ranges=sampled?[{at:0,length:65536},{at:Math.max(65536,s.size-max),length:Math.min(max,s.size-65536)}]:[{at:0,length:s.size}];
    const records:unknown[]=[];
    for(const r of ranges){const buffer=Buffer.alloc(r.length);const {bytesRead}=await handle.read(buffer,0,r.length,r.at);let text=buffer.subarray(0,bytesRead).toString('utf8');
      if(r.at>0)text=text.includes('\n')?text.slice(text.indexOf('\n')+1):'';
      if(sampled&&r.at===0)text=text.slice(0,text.lastIndexOf('\n')+1);
      for(const line of text.split('\n')){if(!line.trim())continue;try{records.push(JSON.parse(line));}catch{records.push({__malformed:true});}}
    }
    return {records,sampled};
  } finally {await handle.close();}
}

export async function validateSessionRoot(value: unknown, home=homedir()): Promise<string|null> {
  if(value===null||value==='')return null;
  if(typeof value!=='string'||value.length>2048||value.includes('\0')||!isAbsolute(value))throw new Error('Choose an absolute local folder path.');
  if(/^[\\/]{2}/.test(value))throw new Error('Choose a local disk folder rather than a network share.');
  const path=await realpath(value).catch(()=>{throw new Error('The approved folder does not exist or cannot be read.');});
  if(!(await stat(path)).isDirectory())throw new Error('The approved location must be a folder.');
  const canonicalHome=await realpath(home).catch(()=>resolve(home));
  if(path===dirname(path)||path===canonicalHome||path.split(sep).some(p=>['.ssh','.aws','.gnupg','node_modules'].includes(p)))throw new Error('Choose a specific agent session folder, not a home, system, credential or dependency directory.');
  await access(path,constants.R_OK).catch(()=>{throw new Error('The approved folder cannot be read.');});return path;
}

export function createWorkspaceRepository(options:{home?:string;dataDir?:string;env?:NodeJS.ProcessEnv;platform?:NodeJS.Platform}={}) {
  const home=options.home??homedir(),env=options.env??process.env,platform=options.platform??process.platform;
  const directory=options.dataDir??appDataDir(platform,home,env);
  const csrfToken=randomBytes(24).toString('hex');let settings=DEFAULTS(),loaded=false,settingsError:string|null=null;
  const cache=new Map<string,{fingerprint:string;session:SessionDetail|null;error?:string}>();const successful=new Map<AgentId,string>();
  let details=new Map<string,SessionDetail>();let current:Workspace|undefined;let completed=0;let flight:Promise<Workspace>|null=null;let configuring=false;
  const load=async()=>{if(loaded)return;loaded=true;try{
    const text=await readFile(join(directory,'settings.json'),'utf8');if(text.length>16384)throw new Error('Large settings');const raw=obj(JSON.parse(text));
    for(const id of AGENTS){const x=obj(raw[id]);if(typeof x.enabled==='boolean')settings[id].enabled=x.enabled;if(x.root!==undefined)settings[id].root=await validateSessionRoot(x.root,home);}
  }catch(e){settings=DEFAULTS();if((e as NodeJS.ErrnoException).code!=='ENOENT')settingsError='Shrinkcage settings could not be loaded. Defaults are in use; save approved locations again.';}};
  const scan=async():Promise<Workspace>=>{
    await load();const now=new Date().toISOString();let budget=32*1024*1024;let scanLimited=false;
    const names=await processNames();const collected:SessionDetail[]=[];const seenFiles=new Set<string>();
    const connectors:AgentConnector[]=[];
    for(const agent of AGENTS){
      const config=settings[agent];const roots=config.root?[config.root]:defaultRoots(agent,home,env);
      const installed=await findBinary(agent,platform,env);
      const discovery=config.enabled?await discoverFiles(agent,roots):{files:[],accessible:0,errors:[],limited:false};
      let parsed=0;const sessions:SessionDetail[]=[];const errors=[...discovery.errors];
      for(const file of discovery.files){
        seenFiles.add(file.path);const fingerprint=`${file.mtime}:${file.size}`;let cached=cache.get(file.path);
        if(!cached||cached.fingerprint!==fingerprint){
          const bytes=Math.min(file.size,file.path.endsWith('.json')?8*1024*1024:2*1024*1024+65536);
          if(budget<bytes){scanLimited=true;continue;}budget-=bytes;
          try{const sample=await readSessionFile(file);const session=parseSession(agent,sample.records,{fileKey:digest(file.path),modifiedAt:new Date(file.mtime).toISOString(),sampled:sample.sampled,archived:file.archived});cached={fingerprint,session};cache.set(file.path,cached);if(!session)errors.push('A session file has an unsupported or incomplete schema.');}
          catch{const error='A session file could not be parsed safely (permissions, format or size limit).';errors.push(error);cache.set(file.path,{fingerprint,session:null,error});continue;}
        }
        if(cached?.error)errors.push(cached.error);if(cached&&!cached.session&&!cached.error)errors.push('A session file has an unsupported or incomplete schema.');if(cached?.session){parsed++;cached.session.status=Date.now()-Date.parse(cached.session.updatedAt)<120000?'updated-recently':'recorded';sessions.push(cached.session);}
      }
      if(config.enabled&&discovery.accessible>0)successful.set(agent,now);
      collected.push(...sessions);scanLimited ||= discovery.limited;
      connectors.push({id:agent,name:NAMES[agent],enabled:config.enabled,installed,process:agentProcess(agent,names),integration:!config.enabled?'disabled':sessions.length?'local-history':discovery.accessible?'no-session-data':'unavailable',
        rootLabels:roots.map(p=>p.startsWith(home+sep)?'~'+p.slice(home.length):p),customRoot:config.root,accessibleRoots:discovery.accessible,sessions:sessions.length,filesDiscovered:discovery.files.length,filesParsed:parsed,errors:[...new Set(errors)].slice(0,5),lastSuccess:successful.get(agent)??null,
        sampledSessions:sessions.filter(x=>x.coverage==='sampled').length,capabilities:['Read-only session discovery','Provider/model metadata when reported','Reported token counters','Tool names without arguments'],
        limits:['Saved history is not a live agent connection.','Process observation cannot identify Node-wrapped CLI sessions reliably.','No authentication files are read and no agent process is started.','Shared optimization metrics are not attributed to individual sessions.']});
    }
    for(const path of cache.keys())if(!seenFiles.has(path))cache.delete(path);
    // Legacy JSON and newer JSONL may coexist for the same Gemini session.
    details=new Map();for(const s of collected.sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt)))details.set(s.id,s);
    const all=[...details.values()];const projects=[...new Map(all.map(s=>[s.project.id,s.project])).values()].sort((a,b)=>a.label.localeCompare(b.label));
    for(const connector of connectors){const unique=all.filter(s=>s.agent===connector.id);connector.sessions=unique.length;connector.sampledSessions=unique.filter(s=>s.coverage==='sampled').length;}
    return current={updatedAt:now,version:VERSION,platform,csrfToken,connectors,totalSessions:all.length,projects,providers:[...new Set(all.map(s=>s.provider).filter((p):p is string=>!!p))].sort(),models:[...new Set(all.map(s=>s.model).filter((p):p is string=>!!p))].sort(),scanLimited,settingsError};
  };
  const get=(force=false):Promise<Workspace>=>{if(flight)return flight;if(current&&!force&&Date.now()-completed<15000)return Promise.resolve(current);flight=scan().then(v=>{completed=Date.now();return v;}).finally(()=>{flight=null;});return flight;};
  return {
    get, csrfToken,
    async configure(body:unknown){if(configuring)throw new Error('Choose one settings change at a time.');configuring=true;try{await load();const x=obj(body);if(Object.keys(x).some(k=>!['agent','root','enabled','approved'].includes(k))||!AGENTS.includes(x.agent as AgentId)||typeof x.enabled!=='boolean'||x.approved!==true)throw new Error('Choose a supported connector and explicitly approve read-only discovery.');
      const root=await validateSessionRoot(x.root,home);const next={...settings,[x.agent as AgentId]:{root,enabled:x.enabled}};
      await mkdir(directory,{recursive:true,mode:0o700});await writeFile(join(directory,'settings.tmp'),JSON.stringify(next,null,2),{mode:0o600});await rename(join(directory,'settings.tmp'),join(directory,'settings.json'));
      settings=next;settingsError=null;completed=0;cache.clear();if(flight)await flight;return await get(true);}finally{configuring=false;}
    },
    async sessions(params:URLSearchParams):Promise<SessionPage>{await get();const allowed=['agent','provider','project','model','search','sort','range','offset','limit'];for(const key of params.keys())if(!allowed.includes(key)||params.getAll(key).length!==1)throw new Error('Unsupported session filter.');
      const agent=params.get('agent');if(agent&&!AGENTS.includes(agent as AgentId))throw new Error('Unknown agent.');
      const search=params.get('search')||'';if(search.length>100)throw new Error('Search is too long.');
      const sort=params.get('sort')||'updated';if(!['updated','started','tokens'].includes(sort))throw new Error('Unknown sort order.');
      const range=params.get('range')||'all';if(!['all','today','7','30'].includes(range))throw new Error('Unknown time range.');
      const offset=Number(params.get('offset')||0),limit=Number(params.get('limit')||50);if(!Number.isSafeInteger(offset)||offset<0||offset>10000||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('Invalid pagination.');
      const cutoff=range==='all'?0:range==='today'?new Date().setHours(0,0,0,0):Date.now()-Number(range)*86400000;
      let rows=[...details.values()].filter(s=>(!agent||s.agent===agent)&&(!params.get('provider')||(s.provider??'unknown')===params.get('provider'))&&(!params.get('project')||s.project.id===params.get('project'))&&(!params.get('model')||s.model===params.get('model'))&&Date.parse(s.updatedAt)>=cutoff&&`${s.shortId} ${s.agent} ${s.project.label} ${s.model??''} ${s.provider??''}`.toLowerCase().includes(search.toLowerCase()));
      rows=rows.sort((a,b)=>sort==='tokens'?(b.tokens.total??-1)-(a.tokens.total??-1):((sort==='started'?b.startedAt:b.updatedAt)??'').localeCompare((sort==='started'?a.startedAt:a.updatedAt)??''));
      const items=rows.slice(offset,offset+limit).map(({tools,activity,tokenHistory,notes,...summary})=>summary);
      return {items,total:rows.length,offset,limit,updatedAt:current!.updatedAt};
    },
    async session(id:string){await get();return details.get(id)??null;},
  };
}
export type WorkspaceRepository = ReturnType<typeof createWorkspaceRepository>;
