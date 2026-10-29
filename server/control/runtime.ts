import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { digest, ControlError } from './schema.js';
import { readBounded } from './paths.js';
import type { ToolId } from './types.js';

export interface ReceiptEvent { tool:ToolId; phase:'agent_connected'|'usage_observed'|'failed'; name:string; at:string }
export function runtimeEntry(name:'supervisor'|'mcp-bridge'|'entry'):{command:string;args:string[]}{
  const source=import.meta.url.endsWith('.ts');const entry=fileURLToPath(new URL('./'+name+(source?'.ts':'.js'),import.meta.url));
  return {command:process.execPath,args:source?['--import',createRequire(import.meta.url).resolve('tsx'),entry]:[entry]};
}
export async function prepareRuntime(dataDir:string,id:string,token:string,tools:ToolId[],fingerprints:Record<string,string|null>={}){
  const parent=resolve(dataDir,'control','runtime');await mkdir(parent,{recursive:true,mode:0o700});if((await lstat(parent)).isSymbolicLink()||await realpath(parent)!==parent)throw new ControlError('Unsafe runtime directory.');
  const path=join(parent,id);await mkdir(path,{mode:0o700});const owner=await open(join(path,'owner.json'),constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);
  try{await owner.writeFile(JSON.stringify({id,tokenHash:digest(token),tools,fingerprints}));await owner.sync();}finally{await owner.close();}
  const heartbeat=await open(join(path,'heartbeat'),constants.O_CREAT|constants.O_EXCL|constants.O_RDWR,0o600);
  const beat=async()=>{const bytes=Buffer.from(new Date().toISOString());await heartbeat.write(bytes,0,bytes.length,0);};await beat();
  return {path,beat,close:async()=>{await heartbeat.close();await rm(path,{recursive:true,force:true});}};
}
export async function runtimeContext(env:NodeJS.ProcessEnv=process.env):Promise<{path:string;id:string;tools:ToolId[];fingerprints:Record<string,string|null>}|null>{
  const id=env.SHRINKCAGE_SESSION_ID,token=env.SHRINKCAGE_SESSION_TOKEN,root=env.SHRINKCAGE_DATA_DIR;
  if(!id||!/^[a-f0-9-]{36}$/.test(id)||!token||!/^[a-f0-9]{64}$/.test(token)||!root)return null;
  const path=resolve(root,'control','runtime',id);
  try{if(await realpath(path)!==path||(await lstat(path)).isSymbolicLink())return null;const bytes=await readBounded(join(path,'owner.json'),2048);if(!bytes)return null;const owner=JSON.parse(bytes.toString('utf8'));if(owner.id!==id||owner.tokenHash!==digest(token)||!Array.isArray(owner.tools))return null;return {path,id,tools:owner.tools,fingerprints:owner.fingerprints??{}};}catch{return null;}
}
export async function runtimeAlive(path:string){try{const value=await readBounded(join(path,'heartbeat'),40);return !!value&&Date.now()-Date.parse(value.toString('utf8'))<20000;}catch{return false;}}
export async function writeReceipt(event:ReceiptEvent,env:NodeJS.ProcessEnv=process.env){
  const context=await runtimeContext(env);if(!context||!context.tools.includes(event.tool)||!await runtimeAlive(context.path))return;
  if(!/^[a-zA-Z0-9_.:-]{1,96}$/.test(event.name))return;
  const file=join(context.path,'events.jsonl');let handle;
  try{const s=await lstat(file).catch(()=>null);if(s&&(s.isSymbolicLink()||!s.isFile()||s.size>1048576))return;handle=await open(file,constants.O_CREAT|constants.O_APPEND|constants.O_WRONLY|(constants.O_NOFOLLOW??0),0o600);await handle.appendFile(JSON.stringify({tool:event.tool,phase:event.phase,name:event.name,at:event.at})+'\n');}catch{/* observation is best effort; never log payloads */}finally{await handle?.close();}
}
export async function receiptEvents(path:string):Promise<ReceiptEvent[]>{
  let data:Buffer;let handle;try{handle=await open(join(path,'events.jsonl'),constants.O_RDONLY|(constants.O_NOFOLLOW??0));const info=await handle.stat();if(!info.isFile())return [];const buffer=Buffer.alloc(1048576);const read=await handle.read(buffer,0,buffer.length,0);data=buffer.subarray(0,read.bytesRead);}catch{return [];}finally{await handle?.close();}
  const events:ReceiptEvent[]=[];
  for(const line of data.toString('utf8').split('\n').slice(0,10000)){
    if(!line||line.length>512)continue;
    try{const v=JSON.parse(line);if(['rtk','serena','headroom'].includes(v.tool)&&['agent_connected','usage_observed','failed'].includes(v.phase)&&typeof v.name==='string'&&/^[a-zA-Z0-9_.:-]{1,96}$/.test(v.name)&&typeof v.at==='string'&&Number.isFinite(Date.parse(v.at)))events.push({tool:v.tool,phase:v.phase,name:v.name,at:v.at});}catch{/* malformed receipt is not evidence */}
  }
  return events;
}
