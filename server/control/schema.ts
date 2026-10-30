import { createHash } from 'node:crypto';
import { TOOL_IDS, type OptimizerManifest, type Profile, type Benchmark } from './types.js';
export class ControlError extends Error { constructor(message:string,readonly code='invalid',readonly status=400){super(message);} }
export function object(value:unknown,keys:readonly string[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new ControlError('Expected a plain object.');
  if(Object.keys(value).some(k=>!keys.includes(k)||['__proto__','constructor','prototype'].includes(k)))throw new ControlError('Unknown or unsafe field.');
  return value as Record<string,unknown>;
}
export const id=(v:unknown)=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,47}$/.test(v);
export function text(v:unknown,max=120):string{if(typeof v!=='string'||!v.trim()||v.length>max||/[\x00-\x1f<>]/.test(v)||/[/\\]|\bsk-(?:proj-)?\w{12,}/.test(v))throw new ControlError('Use a short label without paths, secrets or control characters.');return v.trim();}
export function stable(value:unknown):string{
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';
  return JSON.stringify(value)??'null';
}
export const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export const fingerprint=(v:unknown)=>digest(stable(v));
export function parseProfile(value:unknown):Profile{
  const v=object(value,['schemaVersion','id','name','agent','description','scope','fallback','tools']);
  if(v.schemaVersion!==1||!id(v.id)||!['codex','claude','gemini'].includes(String(v.agent))||!['process','project'].includes(String(v.scope))||!['explicit','block'].includes(String(v.fallback))||!Array.isArray(v.tools)||v.tools.length>6)throw new ControlError('Invalid profile schema or version.');
  const seen=new Set();const tools=v.tools.map(raw=>{const t=object(raw,['id','required','priority']);if(!TOOL_IDS.includes(t.id as never)||typeof t.required!=='boolean'||!Number.isInteger(t.priority)||Number(t.priority)<0||Number(t.priority)>100||seen.has(t.id))throw new ControlError('Invalid or duplicate profile tool.');seen.add(t.id);return {id:t.id as Profile['tools'][number]['id'],required:t.required,priority:Number(t.priority)};});
  const description=v.description===''?'':text(v.description,240);
  if(v.id==='baseline'&&tools.length)throw new ControlError('Baseline cannot include managed optimizers.');
  return {schemaVersion:1,id:v.id as string,name:text(v.name,60),agent:v.agent as Profile['agent'],description,scope:v.scope as Profile['scope'],fallback:v.fallback as Profile['fallback'],tools};
}
export function parseManifest(value:unknown):OptimizerManifest{
  const v=object(value,['schemaVersion','id','name','source','layers','permissions','agents','platforms','minVersion','maxMajor','mechanism','mode','dependencies','conflicts','exclusive','restartRequired','metricSources','ownership','installGuidance','limitations']);
  if(JSON.stringify(value).length>12000||v.schemaVersion!==1||!id(v.id)||TOOL_IDS.includes(v.id as never)||v.mode!=='guided'||v.restartRequired!==false||v.minVersion!==null||v.maxMajor!==null||v.exclusive!==null||!['hook','mcp','wrapper','proxy','observer'].includes(String(v.mechanism)))throw new ControlError('Extensions are declarative guided entries only; executable or reserved manifests are rejected.');
  if(typeof v.source!=='string'||v.source.length>300||!/^https:\/\/[a-z0-9.-]+(?:\/[a-zA-Z0-9_./#-]*)?$/.test(v.source))throw new ControlError('Manifest source must be a public HTTPS documentation link.');
  const list=(key:string,max=12)=>{if(!Array.isArray(v[key])||v[key].length>max)throw new ControlError('Invalid manifest list.');return (v[key] as unknown[]).map(x=>text(x,160));};
  const agents=list('agents',3);const platforms=list('platforms',3);
  if(agents.some(a=>!['codex','claude','gemini'].includes(a))||platforms.some(p=>!['darwin','linux','win32'].includes(p)))throw new ControlError('Unsupported manifest agent or platform.');
  if(list('dependencies').length||list('conflicts').length)throw new ControlError('Community entries cannot change executable dependency or conflict graphs.');
  return {schemaVersion:1,id:v.id as string,name:text(v.name,60),source:v.source,layers:list('layers'),permissions:list('permissions'),agents:agents as OptimizerManifest['agents'],platforms,minVersion:null,maxMajor:null,mechanism:v.mechanism as OptimizerManifest['mechanism'],mode:'guided',dependencies:[],conflicts:[],exclusive:null,restartRequired:false,metricSources:list('metricSources'),ownership:text(v.ownership,200),installGuidance:text(v.installGuidance,240),limitations:list('limitations')};
}
export function parseBenchmark(value:unknown):Omit<Benchmark,'id'|'createdAt'|'confounders'|'elapsedDifferenceMs'|'conclusion'>{
  const v=object(value,['schemaVersion','baselineSession','optimizedSession','taskLabel','sameTask','sameGitState','sameModel','sameEffort','quality']);
  if(v.schemaVersion!==1||![v.baselineSession,v.optimizedSession].every(s=>typeof s==='string'&&/^[a-f0-9-]{36}$/.test(s))||v.baselineSession===v.optimizedSession||!['sameTask','sameGitState','sameModel','sameEffort'].every(k=>typeof v[k]==='boolean')||!['passed','failed','not-reviewed'].includes(String(v.quality)))throw new ControlError('Invalid comparison metadata.');
  return {...v,taskLabel:text(v.taskLabel,80)} as ReturnType<typeof parseBenchmark>;
}
