import {access,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,delimiter} from 'node:path';
import {homedir} from 'node:os';
import {spawn} from 'node:child_process';
import {runBounded,type Executable} from './probe.js';
import {ControlError} from './schema.js';

export interface DesktopTerminal {id:string;name:string;icon:string;command:string;bundle?:string}
export interface TerminalAdapter {id:string;name:string;icon:string;bundleId?:string;app?:string;executables:string[];platforms:string[];args:(file:string,windows:boolean)=>string[]}
const sh=(file:string)=>['/bin/sh',file];
export const TERMINAL_ADAPTERS:readonly TerminalAdapter[]=[
 {id:'terminal-app',name:'Terminal',icon:'▣',bundleId:'com.apple.Terminal',app:'Terminal',executables:[],platforms:['darwin'],args:sh},
 {id:'iterm2',name:'iTerm2',icon:'⌘',bundleId:'com.googlecode.iterm2',app:'iTerm',executables:[],platforms:['darwin'],args:sh},
 {id:'ghostty',name:'Ghostty',icon:'◉',bundleId:'com.mitchellh.ghostty',app:'Ghostty',executables:['ghostty'],platforms:['darwin','linux'],args:f=>['-e',...sh(f)]},
 {id:'wezterm',name:'WezTerm',icon:'▤',bundleId:'org.wezfurlong.wezterm',app:'WezTerm',executables:['wezterm','wezterm-gui'],platforms:['darwin','linux','win32'],args:(f,w)=>['start','--always-new-process','--',...(w?['powershell.exe','-NoLogo','-NoProfile','-NoExit','-File',f]:sh(f))]},
 {id:'kitty',name:'Kitty',icon:'▥',bundleId:'net.kovidgoyal.kitty',app:'kitty',executables:['kitty'],platforms:['darwin','linux'],args:f=>sh(f)},
 {id:'alacritty',name:'Alacritty',icon:'△',bundleId:'org.alacritty',app:'Alacritty',executables:['alacritty'],platforms:['darwin','linux','win32'],args:(f,w)=>['-e',...(w?['powershell.exe','-NoLogo','-NoProfile','-NoExit','-File',f]:sh(f))]},
 {id:'windows-terminal',name:'Windows Terminal',icon:'▣',executables:['wt'],platforms:['win32'],args:f=>{if(f.includes(';'))throw new ControlError('Windows Terminal cannot safely open this launcher path; choose another terminal.');return ['-w','new','new-tab','--','powershell.exe','-NoLogo','-NoProfile','-NoExit','-File',f];}},
 {id:'gnome-terminal',name:'GNOME Terminal',icon:'▣',executables:['gnome-terminal'],platforms:['linux'],args:f=>['--',...sh(f)]},
 {id:'konsole',name:'Konsole',icon:'▣',executables:['konsole'],platforms:['linux'],args:f=>['-e',...sh(f)]},
 {id:'xterm',name:'XTerm',icon:'▣',executables:['xterm'],platforms:['linux'],args:f=>['-e',...sh(f)]},
];
async function usable(path:string){try{const p=await realpath(path),s=await lstat(p);if(!s.isFile())return null;await access(p,process.platform==='win32'?constants.F_OK:constants.X_OK);return p;}catch{return null;}}
const binary=(command:string):Executable=>({command,prefix:[],fingerprint:command});
export async function discoverDesktops(env:NodeJS.ProcessEnv=process.env,platform:string=process.platform):Promise<DesktopTerminal[]>{
 if(platform==='linux'&&!env.DISPLAY&&!env.WAYLAND_DISPLAY)return [];
 const adapters=TERMINAL_ADAPTERS.filter(a=>a.platforms.includes(platform));let bundles:string[]=[];let windows:Record<string,string[]>={};
 if(platform==='darwin')try{const query=adapters.filter(a=>a.bundleId).map(a=>`kMDItemCFBundleIdentifier == '${a.bundleId}'`).join(' || ');const r=await runBounded(binary('/usr/bin/mdfind'),[query],{env,timeout:2000});if(r.code===0)bundles=r.stdout.split('\n').filter(Boolean).slice(0,128);}catch{}
 if(platform==='win32')try{const ps=await usable(join(env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'));if(ps){const code=String.raw`$ErrorActionPreference='Stop';$r=@{};foreach($n in @('wt','wezterm','wezterm-gui','alacritty')){$p=@();$c=Get-Command ($n+'.exe') -ErrorAction SilentlyContinue;if($c){$p+=$c.Source};foreach($h in @('HKCU:','HKLM:')){$v=Get-ItemProperty ($h+'\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\'+$n+'.exe') -ErrorAction SilentlyContinue;if($v){$p+=$v.'(default)'}};$r[$n]=@($p)};Get-AppxPackage Microsoft.WindowsTerminal -ErrorAction SilentlyContinue|ForEach-Object{$r['wt']+=Join-Path $_.InstallLocation 'wt.exe'};$r|ConvertTo-Json -Compress`;const r=await runBounded(binary(ps),['-NoProfile','-NonInteractive','-Command',code],{env,timeout:3000});if(r.code===0)windows=JSON.parse(r.stdout);}}catch{}
 return (await Promise.all(adapters.map(async a=>{
   if(platform==='darwin'&&a.bundleId){
     const candidates=[...bundles,...['/System/Applications/Utilities','/Applications/Utilities','/Applications',join(env.HOME||homedir(),'Applications')].map(d=>join(d,a.app+'.app'))];
     for(const path of [...new Set(candidates)]){if(!path.endsWith('.app')||/[\r\n\0]/.test(path))continue;try{const r=await runBounded(binary('/usr/bin/plutil'),['-convert','json','-o','-',join(path,'Contents','Info.plist')],{env,timeout:1000});if(r.code!==0)continue;const info=JSON.parse(r.stdout);if(info.CFBundleIdentifier!==a.bundleId||typeof info.CFBundleExecutable!=='string'||! /^[\w.-]+$/.test(info.CFBundleExecutable))continue;const command=await usable(join(path,'Contents','MacOS',info.CFBundleExecutable));if(command)return {id:a.id,name:a.name,icon:a.icon,command,bundle:await realpath(path)};}catch{}}
   }
   for(const name of a.executables)for(const path of windows[name]??[]){if(typeof path!=='string'||/^[\\\\/]{2}/.test(path))continue;const command=await usable(path);if(command)return {id:a.id,name:a.name,icon:a.icon,command};}
   for(const name of a.executables)for(const dir of (env.PATH??env.Path??'').split(platform==='win32'?';':delimiter).filter(Boolean)){if(/^[\\/]{2}/.test(dir))continue;const command=await usable(join(dir,name+(platform==='win32'?'.exe':'')));if(command)return {id:a.id,name:a.name,icon:a.icon,command};}
   return null;
 }))).filter((a):a is DesktopTerminal=>a!==null);
}
export function selectDesktop(terminals:DesktopTerminal[],requested?:string,preferred?:string|null){
 if(requested){const selected=terminals.find(t=>t.id===requested);if(!selected)throw new ControlError('The selected terminal is no longer available. Rescan and choose another terminal.');return selected;}
 const selected=terminals.find(t=>t.id===preferred)??terminals.find(t=>t.id==='terminal-app')??terminals[0];if(!selected)throw new ControlError('No compatible graphical terminal is available. Install one and rescan.');return selected;
}
export function desktopCommand(terminal:DesktopTerminal,file:string,platform:string=process.platform):{command:string;args:string[]}{
 const adapter=TERMINAL_ADAPTERS.find(a=>a.id===terminal.id&&a.platforms.includes(platform));if(!adapter)throw new ControlError('Unsupported terminal adapter.');
 if(platform==='darwin'&&terminal.bundle){if(terminal.id==='iterm2')return {command:'/usr/bin/osascript',args:['-e','on run argv\n tell application id "com.googlecode.iterm2"\n create window with default profile command ("/bin/sh " & quoted form of item 1 of argv)\n end tell\nend run','--',file]};if(terminal.id==='terminal-app')return {command:'/usr/bin/open',args:['-a',terminal.bundle,file]};return {command:'/usr/bin/open',args:['-n','-a',terminal.bundle,'--args',...adapter.args(file,false)]};}
 return {command:terminal.command,args:adapter.args(file,platform==='win32')};
}
export async function openDesktop(file:string,env:NodeJS.ProcessEnv,requested?:string,preferred?:string|null){
 const terminal=selectDesktop(await discoverDesktops(env),requested,preferred),launch=desktopCommand(terminal,file);
 if(process.platform==='darwin'){const r=await runBounded(binary(launch.command),launch.args,{env,timeout:10000});if(r.code!==0)throw new ControlError('The selected terminal could not open. Rescan or choose another terminal; no automatic retry was made.');}
 else await new Promise<void>((resolve,reject)=>{const child=spawn(launch.command,launch.args,{env,shell:false,detached:true,stdio:'ignore'});child.once('error',()=>reject(new ControlError('The selected terminal could not open. Rescan or choose another terminal.')));child.once('spawn',()=>{child.unref();resolve();});});
 return terminal.id;
}
