import { randomUUID } from 'node:crypto';
import { basename, isAbsolute } from 'node:path';
import { lstat, realpath } from 'node:fs/promises';
import { parse as parseToml } from 'smol-toml';
import { ControlError, object, text } from '../schema.js';
import { readBounded } from '../paths.js';
import { sensitiveLocation } from './binding.js';
import { parsePluginManifest } from './manifest.js';
import type { OptimizerCandidate, PluginManifest } from './types.js';
import type { ControlPlane } from '../core.js';
import { join } from 'node:path';
import { codexHome } from '../probe.js';

export function githubRepository(value:unknown):{owner:string;repo:string;url:string}{
  if(typeof value!=='string'||value.length>300)throw new ControlError('Use a public GitHub repository URL.');
  const m=/^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9][A-Za-z0-9_.-]{0,99})(?:\/)?$/.exec(value);
  if(!m||m[2]==='..'||m[2].endsWith('.git'))throw new ControlError('Use https://github.com/owner/repository without credentials, branches, query strings or fragments.');
  return {owner:m[1],repo:m[2],url:`https://github.com/${m[1]}/${m[2]}`};
}
type Reader=(url:string)=>Promise<unknown>;
export async function githubJson(url:string):Promise<unknown>{
  const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='api.github.com'||u.username||u.password||!/^\/repos\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+(?:\/(?:contents\/shrinkcage\.optimizer\.json|readme))?$/.test(u.pathname)||u.search)throw new ControlError('Only fixed public GitHub metadata documents can be inspected.');
  const r=await fetch(u,{redirect:'error',headers:{Accept:'application/vnd.github+json','User-Agent':'Shrinkcage-local-inspection'},signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw new ControlError(r.status===404?'Public repository metadata was not found. Private repositories can use a local manifest instead.':'GitHub metadata is unavailable or rate-limited. Try again or use a local manifest.');
  const reader=r.body?.getReader();if(!reader)throw new ControlError('GitHub returned an empty document.');let size=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();throw new ControlError('Repository metadata exceeded the inspection limit.');}chunks.push(value);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ControlError('GitHub metadata was malformed. No code was loaded.');}
}
const safeDescription=(v:unknown)=>typeof v==='string'?v.replace(/[\x00-\x1f<>]/g,' ').replace(/\b(?:sk-[\w-]+|gh[pousr]_[\w]+|github_pat_[\w]+)/gi,'[redacted]').slice(0,240):'No description supplied.';
export async function inspectGithub(value:unknown,read:Reader=githubJson):Promise<OptimizerCandidate>{
  const repo=githubRepository(value),base=`https://api.github.com/repos/${repo.owner}/${repo.repo}`,raw=await read(base) as Record<string,unknown>;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new ControlError('Repository metadata was malformed. No code was loaded.');
  let manifest:PluginManifest|null=null;const facts=['Public repository metadata inspected. No package, script or executable was downloaded.'],missing:string[]=[];
  const [manifestRead,readmeRead]=await Promise.allSettled([read(base+'/contents/shrinkcage.optimizer.json'),read(base+'/readme')]);
  try{if(manifestRead.status!=='fulfilled')throw Error();const file=manifestRead.value as {encoding?:unknown;content?:unknown};if(file.encoding!=='base64'||typeof file.content!=='string')throw Error();const bytes=Buffer.from(file.content,'base64');if(bytes.length>16384)throw Error();manifest=parsePluginManifest(JSON.parse(bytes.toString('utf8')));if(manifest.source!==repo.url){manifest=null;throw Error();}facts.push('Repository provides a validated SDK manifest.');}catch{missing.push('No usable SDK manifest found. Documentation needs review; CLI flags and capabilities were not guessed.');}
  const readme=readmeRead.status==='fulfilled'?readmeRead.value as {encoding?:unknown;content?:unknown}:null;
  if(readme?.encoding==='base64'&&typeof readme.content==='string')facts.push(`Repository README retrieved (${Math.min(Buffer.from(readme.content,'base64').length,262144)} bytes). Its instructions are not executed; interface claims require review.`);else missing.push('No readable repository README was returned. Review official interface documentation manually.');
  if(!manifest)missing.push('Choose a reviewed pattern and register a trusted local installation, or generate an adapter proposal.');
  else missing.push('A public manifest is not an installed or trusted executable. Local registration and isolated protocol validation are still required.');
  return {id:'candidate-'+randomUUID().slice(0,12),source:'github',name:safeDescription(raw.name||repo.repo),url:repo.url,description:safeDescription(raw.description),mechanism:manifest?.mechanism??null,state:manifest?.template==='mcp-stdio'?'needs_configuration':'integration_required',facts,missing,manifest,createdAt:new Date().toISOString()};
}
export function inspectManifestCandidate(value:unknown):OptimizerCandidate {const manifest=parsePluginManifest(value);return {id:'candidate-'+randomUUID().slice(0,12),source:'manifest',name:manifest.name,url:manifest.source,description:manifest.description,mechanism:manifest.mechanism,state:manifest.template==='mcp-stdio'?'needs_configuration':'integration_required',facts:['Strict SDK schema validated. Importing metadata cannot execute or install anything.'],missing:[manifest.template==='mcp-stdio'?'Bind a trusted local executable and approve isolated validation in the terminal.':'No executable template exists. Generate a proposal and conformance tests for review.'],manifest,createdAt:new Date().toISOString()};}
export async function inspectLocal(value:unknown):Promise<OptimizerCandidate&{localPath:string}>{
  if(typeof value!=='string'||!isAbsolute(value)||value.length>4096||sensitiveLocation(value)||/^[\\/]{2}/.test(value))throw new ControlError('Choose an explicit local executable outside credential directories.');
  const actual=await realpath(value).catch(()=>null);if(!actual||sensitiveLocation(actual))throw new ControlError('Local executable was not found or is in a credential directory.');const s=await lstat(actual);if(!s.isFile())throw new ControlError('Choose a file, not a directory.');
  return {id:'candidate-'+randomUUID().slice(0,12),source:'local-executable',name:basename(actual).slice(0,80),url:null,description:'Local file inspected without executing it.',mechanism:null,state:'integration_required',facts:['File identity is available. No --help, --version or arbitrary code was executed.'],missing:['A reviewed SDK manifest, source approval and isolated protocol test are required.'],manifest:null,createdAt:new Date().toISOString(),localPath:actual};
}
export async function inspectExistingMcp(plane:ControlPlane,agent:string,projectId:string){
  if(!['codex','claude'].includes(agent))throw new ControlError('Choose Codex or Claude Code.');const project=await plane.project({id:projectId});
  const files=agent==='codex'?[['user',join(codexHome(plane.env,plane.options.home),'config.toml')],['project',join(project.path,'.codex','config.toml')]]:[['project',join(project.path,'.mcp.json')]];
  const entries:{name:string;source:string;mechanism:string;programLabel:string|null;state:'integration_required'}[]=[];
  for(const [source,path]of files){const bytes=await readBounded(path);if(!bytes)continue;let data:any;try{data=path.endsWith('.toml')?parseToml(bytes.toString()):JSON.parse(bytes.toString());}catch{throw new ControlError('An approved MCP configuration is malformed. Raw contents were discarded.');}
    if(!data||typeof data!=='object'||Array.isArray(data))throw new ControlError('An approved MCP configuration is malformed. Raw contents were discarded.');
    const servers=data.mcp_servers??data.mcpServers??{};if(!servers||typeof servers!=='object'||Array.isArray(servers))throw new ControlError('MCP server registrations must be an object.');
    for(const [name,raw]of Object.entries(servers)){if(!raw||typeof raw!=='object'||Array.isArray(raw)||!/^[A-Za-z][A-Za-z0-9_.-]{0,80}$/.test(name)||/^sk-|^gh[pousr]_/i.test(name))continue;const r=raw as {command?:unknown;url?:unknown};entries.push({name,source,mechanism:typeof r.command==='string'?'stdio':typeof r.url==='string'?'http':'unknown',programLabel:typeof r.command==='string'?safeDescription(basename(r.command.replaceAll('\\','/'))).slice(0,80):null,state:'integration_required'});}
  }
  return {entries,limitations:['Only safe names and program basenames are shown. Arguments, environment values, URLs and credentials are not imported.','Claude auth-mixed user configuration is not opened. Only approved project MCP JSON is inspected.','Use a reviewed built-in or an approved SDK binding; existing configuration alone is not activation evidence.']};
}
