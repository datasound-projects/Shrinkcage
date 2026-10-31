import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { access,lstat,realpath } from 'node:fs/promises';
import { delimiter,join } from 'node:path';
import { runBounded,type Executable } from './probe.js';
import { ControlError } from './schema.js';
import type { TerminalChoice } from './terminal-types.js';

const NAMES=['herdr','open','powershell.exe','gnome-terminal','konsole','x-terminal-emulator','xterm'] as const;
export async function terminalExecutable(name:typeof NAMES[number],env:NodeJS.ProcessEnv=process.env):Promise<Executable|null>{
  if(!NAMES.includes(name))throw new ControlError('Unsupported terminal executable.');
  const dirs=name==='open'?['/usr/bin']:(env.PATH??env.Path??'').split(delimiter).filter(Boolean);
  for(const dir of dirs){if(/^[\\/]{2}/.test(dir)&&process.platform==='win32')continue;try{const file=await realpath(join(dir,name));const info=await lstat(file);if(!info.isFile())continue;await access(file,process.platform==='win32'?constants.F_OK:constants.X_OK);return {command:file,prefix:[],fingerprint:`${info.dev}:${info.ino}:${info.mtimeMs}:${info.size}`};}catch{/* fixed-name lookup only */}}
  return null;
}
export const shellQuote=(s:string)=>"'"+s.replaceAll("'","'\\''")+"'";
export const powershellQuote=(s:string)=>"'"+s.replaceAll("'","''")+"'";
export async function nativeTerminal(env:NodeJS.ProcessEnv=process.env){
  if(process.platform==='darwin')return terminalExecutable('open',env);
  if(process.platform==='win32')return terminalExecutable('powershell.exe',env);
  if(!env.DISPLAY&&!env.WAYLAND_DISPLAY)return null;
  for(const name of ['gnome-terminal','konsole','x-terminal-emulator','xterm'] as const){const found=await terminalExecutable(name,env);if(found)return found;}
  return null;
}
export async function openTerminalScript(file:string,env:NodeJS.ProcessEnv=process.env){
  const binary=await nativeTerminal(env);if(!binary)throw new ControlError('No supported desktop terminal was detected. Use Copy command, or open a desktop terminal and refresh.');
  const args=process.platform==='darwin'?['-a','Terminal',file]:process.platform==='win32'?['-NoLogo','-NoProfile','-Command',`Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoLogo','-NoProfile','-NoExit','-File',${powershellQuote('"'+file+'"')})`]:binary.command.endsWith('gnome-terminal')?['--','/bin/sh',file]:['-e','/bin/sh',file];
  if(process.platform!=='darwin'&&process.platform!=='win32'){await new Promise<void>((resolve,reject)=>{const child=spawn(binary.command,args,{env,shell:false,detached:true,stdio:'ignore'});child.once('error',()=>reject(new ControlError('The desktop terminal could not open.')));child.once('spawn',()=>{child.unref();resolve();});});return;}
  const result=await runBounded(binary,args,{env,timeout:10000});if(result.code!==0)throw new ControlError('The desktop terminal could not open. Use Copy command or check desktop permissions.');
}
export async function inspectTerminals(env:NodeJS.ProcessEnv=process.env):Promise<TerminalChoice[]>{
  const native=!!await nativeTerminal(env);let compatible=false,version:string|null=null;
  const herdr=await terminalExecutable('herdr',env);
  if(herdr&&process.platform!=='win32')try{const v=await runBounded(herdr,['--version'],{env});version=v.stdout.match(/\b\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?\b/)?.[0]??null;const [help,config]=await Promise.all([runBounded(herdr,['--help'],{env}),runBounded(herdr,['--default-config'],{env})]);compatible=v.code===0&&/^0\.9\.(?:[5-9]|[1-9]\d+)$/.test(version??'')&&help.code===0&&config.code===0&&help.stdout.includes('--session')&&config.stdout.includes('default_shell')&&config.stdout.includes('shell_mode');}catch{/* unavailable integration remains independent */}
  return [{id:'terminal',name:process.platform==='darwin'?'Terminal':process.platform==='win32'?'Windows PowerShell':'Desktop terminal',available:native,reason:native?'Opens a new interactive terminal with the reviewed stack.':'No supported graphical terminal detected. Copy command remains available.'},{id:'herdr',name:'Herdr',available:native&&compatible,version,reason:compatible?(native?'Opens an isolated local Herdr session using private launch configuration.':'A desktop terminal is needed to display the Herdr TUI.'):process.platform==='win32'?'Herdr launch is currently supported on macOS/Linux; Windows shell admission is not verified.':herdr?'This Herdr version does not expose the reviewed 0.9.5+ launch interfaces.':'Install Herdr separately, then refresh. No installation or global integration runs automatically.'}];
}
