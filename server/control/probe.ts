import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, lstat, open, realpath, stat } from 'node:fs/promises';
import { delimiter, dirname, extname, join } from 'node:path';
import { homedir } from 'node:os';
import { CATALOG } from './catalog.js';
import { ControlError, digest } from './schema.js';
import { readBounded } from './paths.js';
import { versionCompatible } from './planner.js';
import type { AgentDetection, Detection, ToolId, BuiltinToolId } from './types.js';

export interface Executable { command:string; prefix:string[]; fingerprint:string }
const NAMES=['codex','claude','gemini','rtk','serena','headroom','codemem','litellm','langfuse','context-mode','leanctx'] as const;
/** Modern official npm installations wrap a native Windows binary instead of cli.js. */
export async function nativeClaudeShim(directory:string):Promise<Executable|null>{
  const file=join(directory,'node_modules','@anthropic-ai','claude-code','bin','claude.exe');
  try{const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink())return null;const handle=await open(file,'r');try{const header=Buffer.alloc(2);await handle.read(header,0,2,0);if(header.toString()!=='MZ')return null;}finally{await handle.close();}const command=await realpath(file);return {command,prefix:[],fingerprint:digest(`${command}:${info.dev}:${info.ino}:${info.mtimeMs}:${info.size}`)};}catch{return null;}
}
export async function executable(name:typeof NAMES[number],env:NodeJS.ProcessEnv=process.env):Promise<Executable|null>{
  if(!NAMES.includes(name))throw new ControlError('Unknown executable.');
  const path=(env.PATH||env.Path||'').split(process.platform==='win32'?';':delimiter).filter(Boolean);
  for(const directory of path){
    if(/^[\\/]{2}/.test(directory))continue;
    for(const suffix of process.platform==='win32'?['.exe','.cmd','.bat','']:['']){
      const file=join(directory.replace(/^"|"$/g,''),(name==='leanctx'?'lean-ctx':name)+suffix);try{
        await access(file,process.platform==='win32'?constants.F_OK:constants.X_OK);const resolved=await realpath(file);const info=await stat(resolved);if(!info.isFile())continue;
        let command=resolved,prefix:string[]=[],scriptIdentity='';
        if(/\.(cmd|bat)$/i.test(resolved)){
          if(name==='claude'){const native=await nativeClaudeShim(dirname(file));if(native)return native;}
          const candidates=name==='codex'?[join(dirname(file),'node_modules','@openai','codex','bin','codex.js')]:name==='claude'?[join(dirname(file),'node_modules','@anthropic-ai','claude-code','cli.js')]:[];
          const shim=await readBounded(file,16384);if(shim&&/\bnode(?:\.exe)?\b/i.test(shim.toString()))for(const extension of ['.mjs','.js'])if(shim.toString().includes(name+extension))candidates.push(join(dirname(file),name+extension));
          let js:string|undefined;for(const p of candidates){try{const s=await lstat(p);if(s.isFile()&&!s.isSymbolicLink()){js=await realpath(p);scriptIdentity=`${s.dev}:${s.ino}:${s.mtimeMs}:${s.size}`;break;}}catch{}}
          if(!js)continue;command=process.execPath;prefix=[js];
        }else if(process.platform==='win32'&&!['.exe','.com'].includes(extname(resolved).toLowerCase()))continue;
        return {command,prefix,fingerprint:digest(`${resolved}:${info.dev}:${info.ino}:${info.mtimeMs}:${info.size}:${prefix.join(':')}:${scriptIdentity}`)};
      }catch{/* keep searching fixed names; never invoke a shell shim */}
    }
  }
  return null;
}
export function runBounded(binary:Executable,args:string[],options:{env?:NodeJS.ProcessEnv;cwd?:string;input?:string;timeout?:number;signal?:AbortSignal}={}):Promise<{code:number|null;stdout:string;stderr:string}>{
  return new Promise((resolve,reject)=>{
    if(options.signal?.aborted){reject(new ControlError('Probe cancelled.','cancelled'));return;}
    const child=spawn(binary.command,[...binary.prefix,...args],{cwd:options.cwd,env:options.env??process.env,shell:false,stdio:['pipe','pipe','pipe'],windowsHide:true});
    let stdout='',stderr='',size=0,settled=false;let killTimer:ReturnType<typeof setTimeout>|undefined;
    const finish=(error?:Error,code:number|null=null)=>{if(settled)return;settled=true;clearTimeout(timer);if(killTimer&&!error)clearTimeout(killTimer);options.signal?.removeEventListener('abort',cancel);if(error)reject(error);else resolve({code,stdout,stderr});};
    const stop=(reason:string)=>{if(settled)return;child.kill('SIGTERM');killTimer=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');},400);killTimer.unref();finish(new ControlError(reason));};
    const cancel=()=>stop('Probe cancelled.');options.signal?.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(()=>stop('Probe timed out.'),options.timeout??4000);
    const collect=(chunk:Buffer,error:boolean)=>{size+=chunk.length;if(size>65536){stop('Probe output exceeded its limit.');return;}if(error)stderr+=chunk.toString('utf8');else stdout+=chunk.toString('utf8');};
    child.stdout.on('data',chunk=>collect(chunk,false));child.stderr.on('data',chunk=>collect(chunk,true));child.on('error',()=>finish(new ControlError('Executable could not start.')));child.on('close',code=>{if(killTimer)clearTimeout(killTimer);finish(undefined,code);});
    child.stdin.on('error',()=>{});child.stdin.end(options.input??'');
  });
}
const versionOf=(s:string)=>s.match(/\b(\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?)\b/)?.[1]??null;
export function headroomPort(env:NodeJS.ProcessEnv=process.env){const value=env.SHRINKCAGE_HEADROOM_PORT??'8787';if(!/^\d{2,5}$/.test(value)||Number(value)<1024||Number(value)>65535||Number(value)===8790)throw new ControlError('Headroom port must be a valid explicit loopback service port.');return Number(value);}
export async function headroomDocument(path:'health'|'stats',env:NodeJS.ProcessEnv=process.env):Promise<Record<string,unknown>|null>{
  if(!['health','stats'].includes(path))throw new ControlError('Unsupported local document.');
  try{const r=await fetch(`http://127.0.0.1:${headroomPort(env)}/${path}`,{redirect:'error',signal:AbortSignal.timeout(1500)});if(!r.ok||!r.headers.get('content-type')?.includes('json'))return null;
    const reader=r.body?.getReader();if(!reader)return null;let size=0;const chunks:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>524288){await reader.cancel();return null;}chunks.push(value);}const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));return data&&typeof data==='object'&&!Array.isArray(data)?data:null;
  }catch{return null;}
}
export async function headroomHealth(env:NodeJS.ProcessEnv=process.env):Promise<boolean>{
  const data=await headroomDocument('health',env);return !!data&&typeof data.service==='string'&&/headroom/i.test(data.service)&&data.status==='healthy';
}
export async function detectAgent(env:NodeJS.ProcessEnv=process.env,id:'codex'|'claude'='codex'):Promise<AgentDetection>{
  const binary=await executable(id,env);const empty:AgentDetection={id,installed:!!binary,version:null,compatible:false,binaryFingerprint:binary?.fingerprint??null};if(!binary)return empty;
  try{const v=await runBounded(binary,['--version'],{env,timeout:8000});const version=versionOf(v.stdout);const reviewed=id==='codex'?['0.165.0','0.166.0'].some(floor=>versionCompatible(version,floor,0)):versionCompatible(version,'2.1.0',2);if(v.code!==0||!reviewed)return {...empty,version};const help=await runBounded(binary,['--help'],{env});const flags=id==='codex'?['--config','--no-daemon']:['--settings','--session-id','--mcp-config','--strict-mcp-config'];return {...empty,version,compatible:v.code===0&&help.code===0&&reviewed&&flags.every(flag=>help.stdout.includes(flag))};}catch{return empty;}
}
export async function detectTool(id:BuiltinToolId,env:NodeJS.ProcessEnv=process.env):Promise<Detection>{
  const manifest=CATALOG.find(m=>m.id===id)!;const checkedAt=new Date().toISOString();const binary=await executable(id,env);
  const d:Detection={id,installed:!!binary,version:null,compatible:false,configured:null,serviceHealthy:null,agentConnected:null,effective:null,usageObserved:null,status:binary?'installed':'missing',checkedAt,binaryFingerprint:binary?.fingerprint??null,evidence:[],diagnostics:[]};
  if(!binary){d.diagnostics.push('Executable not found on PATH. '+manifest.installGuidance);return d;}
  if(manifest.mode==='guided'){d.status='unsupported';d.diagnostics.push(...manifest.limitations);return d;}
  try{
    const safeEnv={...env,HEADROOM_BEACON:'off',DO_NOT_TRACK:'1',HEADROOM_OFFLINE:'1'};
    const args=id==='rtk'?['hook','--help']:id==='headroom'?['wrap','codex','--help']:['start-mcp-server','--help'];const [result,help]=await Promise.all([runBounded(binary,['--version'],{env:safeEnv}),runBounded(binary,args,{env:safeEnv})]);d.version=versionOf(result.stdout);d.compatible=result.code===0&&versionCompatible(d.version,manifest.minVersion,manifest.maxMajor);
    const flags=id==='rtk'?['codex']:id==='headroom'?['--no-proxy','--no-mcp','--code-memory']:['--project-from-cwd','--context','--transport','--enable-web-dashboard'];
    d.compatible=d.compatible&&help.code===0&&flags.every(flag=>help.stdout.includes(flag));
    if(id==='rtk'&&d.compatible){const check=await runBounded(binary,['hook','codex'],{env,input:JSON.stringify({hook_event_name:'PreToolUse',tool_name:'Bash',permission_mode:'default',tool_input:{command:'git status'}})});const output=JSON.parse(check.stdout||'{}');d.compatible=check.code===0&&output.hookSpecificOutput?.updatedInput?.command==='rtk git status';}
    if(id==='headroom'){d.endpointPort=headroomPort(env);d.serviceHealthy=await headroomHealth(env);if(d.serviceHealthy)d.status='service_healthy';}
    if(!d.compatible){d.status='unsupported';d.diagnostics.push('Version or native interface is outside the reviewed compatibility contract.');}
    d.evidence.push({tool:id,status:d.status,source:'Installed CLI version and fixed help/contract probes',observedAt:checkedAt,scope:'shared',confidence:d.compatible?'verified':'inconclusive',agentVersion:null,toolVersion:d.version,limitations:manifest.limitations});
  }catch{d.status='failed';d.compatible=false;d.diagnostics.push('Read-only CLI probe failed, timed out or returned malformed data.');}
  return d;
}
export const codexHome=(env:NodeJS.ProcessEnv=process.env,home=homedir())=>env.CODEX_HOME||join(home,'.codex');
export async function safeJson(path:string):Promise<unknown|null>{const b=await readBounded(path);if(b===null)return null;try{return JSON.parse(b.toString('utf8'));}catch{throw new ControlError('A JSON configuration file is malformed.');}}
