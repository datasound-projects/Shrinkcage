import { constants } from 'node:fs';
import { access, lstat, mkdir, realpath } from 'node:fs/promises';
import { basename, delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { ControlError, digest } from '../schema.js';
import { readBounded } from '../paths.js';
import type { PluginBinding } from './types.js';

const forbiddenProgram=/^(?:node|nodejs|python\d*|python\d*\.\d+|sh|bash|zsh|fish|cmd|powershell|pwsh|perl|ruby|osascript|npm|npx|pnpm|yarn|uv|uvx|curl|wget|git|rm|mv|cp|chmod|chown)(?:\.exe)?$/i;
export function sensitiveLocation(path:string):boolean{return /(?:^|[\\/])(?:\.ssh|\.aws|\.gnupg|\.codex|\.claude|\.gemini|Keychains|Credentials|Cookies)(?:[\\/]|$)/i.test(path)||/(?:^|[\\/])(?:auth\.json|credentials(?:\.json)?|\.env(?:\.[^\\/]*)?|\.netrc)$/i.test(path);}
async function resolveProgram(input:string,env:NodeJS.ProcessEnv):Promise<string>{
  if(typeof input!=='string'||!input||input.length>4096||/[\0\r\n]/.test(input)||/^[\\/]{2}/.test(input))throw new ControlError('Choose an existing local executable.');
  if(isAbsolute(input))return input;
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(input))throw new ControlError('Use an absolute executable path or a plain installed command name.');
  for(const dir of (env.PATH||env.Path||'').split(delimiter).filter(Boolean))for(const suffix of process.platform==='win32'?['.exe','']:[''])try{const path=join(dir,input+suffix);await access(path,process.platform==='win32'?constants.F_OK:constants.X_OK);return path;}catch{/* inspect the next installed path; never run a shell */}
  throw new ControlError('Executable not found. Install it separately, then inspect it again.');
}
export async function inspectBinding(input:{executable:string;script?:string},env:NodeJS.ProcessEnv=process.env):Promise<PluginBinding>{
  const requestedCommand=resolve(await resolveProgram(input.executable,env));
  if(sensitiveLocation(requestedCommand))throw new ControlError('Credential and agent-auth directories cannot contain plugin bindings.');
  const command=await realpath(requestedCommand).catch(()=>null);if(!command)throw new ControlError('Executable is unavailable.');
  if(sensitiveLocation(command))throw new ControlError('Credential directories cannot contain plugin bindings.');
  const s=await lstat(command,{bigint:true});if(!s.isFile()||s.isSymbolicLink()||/\.(?:cmd|bat|ps1)$/i.test(command))throw new ControlError('A native executable or explicitly reviewed Node entry script is required; shell launchers are unsupported.');
  await access(command,process.platform==='win32'?constants.F_OK:constants.X_OK);
  let prefix:string[]=[],scriptFingerprint:string|null=null;
  if(input.script){
    if(command!==await realpath(process.execPath)||!isAbsolute(input.script)||! /\.(?:mjs|js)$/.test(input.script)||sensitiveLocation(input.script))throw new ControlError('Entry scripts must be explicit local JavaScript files run by this Node runtime.');
    const script=resolve(input.script);if(sensitiveLocation(await realpath(script)))throw new ControlError('Credential directories cannot contain plugin scripts.');const bytes=await readBounded(script,16*1024*1024);if(!bytes)throw new ControlError('Plugin entry script is missing.');
    prefix=[await realpath(script)];scriptFingerprint=digest(bytes);
  }else if(forbiddenProgram.test(basename(command)))throw new ControlError('Generic shells, interpreters, package managers and system utilities cannot be registered as optimizer executables. Node requires a reviewed entry script.');
  else if(process.platform==='win32'&&!/\.exe$/i.test(command))throw new ControlError('Use a native Windows executable or a reviewed Node entry script.');
  const fingerprint=digest(JSON.stringify({command,requestedCommand,identity:[String(s.dev),String(s.ino),String(s.mtimeNs),String(s.size)],prefix,scriptFingerprint}));
  const name=input.script?basename(input.script):basename(command),label=/(?:\bsk-|AIza|\bgh[pousr]_|github_pat_)/i.test(name)?'Approved local program':name;
  return {command,requestedCommand,prefix,fingerprint,scriptFingerprint,label,owned:false,ownedDirectory:null,toolVersion:''};
}
export async function verifyBinding(binding:PluginBinding):Promise<boolean>{
  try{const current=await inspectBinding({executable:binding.requestedCommand,script:binding.prefix[0]});return current.command===binding.command&&current.fingerprint===binding.fingerprint&&current.scriptFingerprint===binding.scriptFingerprint;}catch{return false;}
}
/** Private HOME and a minimal OS environment; provider credentials and owner tokens are not inherited. This is not an OS sandbox. */
export async function pluginEnvironment(home:string,env:NodeJS.ProcessEnv=process.env):Promise<NodeJS.ProcessEnv>{
  const missing:string[]=[];let parent=resolve(home);while(!await lstat(parent).catch(()=>null)){missing.unshift(parent);const next=dirname(parent);if(next===parent)throw new ControlError('Unsafe plugin home.');parent=next;}
  if(await realpath(parent)!==parent||(await lstat(parent)).isSymbolicLink()||!(await lstat(parent)).isDirectory())throw new ControlError('Unsafe plugin home parent.');
  for(const directory of missing){await mkdir(directory,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});if((await lstat(directory)).isSymbolicLink()||await realpath(directory)!==directory)throw new ControlError('Unsafe plugin home.');}
  const safe:NodeJS.ProcessEnv={};for(const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','PATHEXT','LANG','LC_ALL','TERM','TMPDIR','TEMP','TMP'])if(env[key])safe[key]=env[key];
  return {...safe,HOME:home,USERPROFILE:home,APPDATA:join(home,'Roaming'),LOCALAPPDATA:join(home,'Local'),XDG_CONFIG_HOME:join(home,'.config'),DO_NOT_TRACK:'1',HEADROOM_BEACON:'off',HEADROOM_OFFLINE:'1',UV_OFFLINE:'1'};
}
