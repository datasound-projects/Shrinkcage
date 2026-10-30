import { createHash } from 'node:crypto';
import { BILLING_MODES, TOOL_IDS, type BillingMode, type OptimizerManifest, type Profile, type Benchmark, type LaunchOptions, type ToolConfiguration, type ToolId } from './types.js';
export class ControlError extends Error { constructor(message:string,readonly code='invalid',readonly status=400){super(message);} }
export function billingMode(value:unknown):BillingMode {if(!BILLING_MODES.includes(value as BillingMode))throw new ControlError('Billing must be subscription, api, hybrid or unknown.');return value as BillingMode;}
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
export interface SchemaContext { ids:ReadonlySet<string>; configuration?:(id:string,value:unknown)=>ToolConfiguration }
const builtinSchema:SchemaContext={ids:new Set(TOOL_IDS)};
export function parseToolConfiguration(tool:ToolId,value:unknown,context:SchemaContext=builtinSchema):ToolConfiguration {
  if(!TOOL_IDS.includes(tool as never)){if(!context.ids.has(tool)||!context.configuration)throw new ControlError('Unknown optimizer configuration.');return context.configuration(tool,value);}
  const v=object(value,['timeoutSeconds']);
  if(v.timeoutSeconds!==undefined&&(!['serena','headroom'].includes(tool)||!Number.isSafeInteger(v.timeoutSeconds)||Number(v.timeoutSeconds)<5||Number(v.timeoutSeconds)>120))throw new ControlError('Only MCP request timeouts from 5 to 120 seconds are configurable.');
  return v.timeoutSeconds===undefined?{}:{timeoutSeconds:Number(v.timeoutSeconds)};
}
export function parseLaunchOptions(value:unknown,context:SchemaContext=builtinSchema):LaunchOptions {
  const v=object(value,['billing','model','tools','toolConfig']);const out:LaunchOptions={};
  if(v.billing!==undefined)out.billing=billingMode(v.billing);
  if(v.model!==undefined){if(typeof v.model!=='string'||(!/^[a-zA-Z0-9_.:@-]{1,120}$/.test(v.model)||/^sk-|^AIza|^gh[pousr]_|^github_pat_/i.test(v.model)))throw new ControlError('Use an exact model ID without paths or secrets.');out.model=v.model;}
  if(JSON.stringify(value).length>16384)throw new ControlError('Launch metadata exceeds its byte limit.');
  if(v.tools!==undefined){if(!Array.isArray(v.tools)||new Set(v.tools).size!==v.tools.length||v.tools.some(t=>typeof t!=='string'||!context.ids.has(t)))throw new ControlError('Choose distinct registered tools.');out.tools=v.tools as ToolId[];}
  if(v.toolConfig!==undefined){const configs=object(v.toolConfig,[...context.ids]);out.toolConfig={};for(const [tool,config] of Object.entries(configs))out.toolConfig[tool]=parseToolConfiguration(tool,config,context);}
  return out;
}
export function parseProfile(value:unknown,context:SchemaContext=builtinSchema):Profile{
  const v=object(value,['schemaVersion','id','name','agent','description','scope','fallback','tools']);
  if(JSON.stringify(value).length>16384||v.schemaVersion!==1||!id(v.id)||!['codex','claude','gemini'].includes(String(v.agent))||!['process','project'].includes(String(v.scope))||!['explicit','block'].includes(String(v.fallback))||!Array.isArray(v.tools))throw new ControlError('Invalid profile schema or version.');
  const seen=new Set();const tools=v.tools.map(raw=>{const t=object(raw,['id','required','priority','config']);if(typeof t.id!=='string'||!context.ids.has(t.id)||typeof t.required!=='boolean'||!Number.isInteger(t.priority)||Number(t.priority)<0||Number(t.priority)>100||seen.has(t.id))throw new ControlError('Invalid or duplicate profile tool.');seen.add(t.id);return {id:t.id as ToolId,required:t.required,priority:Number(t.priority),...(t.config===undefined?{}:{config:parseToolConfiguration(t.id as ToolId,t.config,context)})};});
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
  const v=object(value,['schemaVersion','baselineSession','optimizedSession','taskLabel','sameTask','sameGitState','sameModel','sameEffort','sameCaching','quality']);
  if(v.sameCaching!==undefined&&typeof v.sameCaching!=='boolean')throw new ControlError('Caching equivalence must be an explicit attestation.');
  if(v.schemaVersion!==1||![v.baselineSession,v.optimizedSession].every(s=>typeof s==='string'&&/^[a-f0-9-]{36}$/.test(s))||v.baselineSession===v.optimizedSession||!['sameTask','sameGitState','sameModel','sameEffort'].every(k=>typeof v[k]==='boolean')||!['passed','failed','not-reviewed'].includes(String(v.quality)))throw new ControlError('Invalid comparison metadata.');
  return {...v,taskLabel:text(v.taskLabel,80)} as ReturnType<typeof parseBenchmark>;
}
