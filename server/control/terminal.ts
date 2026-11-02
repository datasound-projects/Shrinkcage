import {discoverDesktops,openDesktop,TERMINAL_ADAPTERS} from './desktop-terminals.js';
import { chmod,lstat,mkdir,realpath,rmdir,unlink,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { ControlPlane } from './core.js';
import { ControlError,digest } from './schema.js';
import { inspectTerminals,openTerminalScript,powershellQuote,shellQuote,terminalExecutable } from './terminal-host.js';
import { publicLaunch,type LaunchPreview,type TerminalChoice,type TerminalLaunch,type TerminalTarget } from './terminal-types.js';
import { runManaged } from './runner.js';
import { readBounded } from './paths.js';
import { runBounded } from './probe.js';
import type { LaunchOptions,OptimizationPlan } from './types.js';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const CONTEXT=['PATH','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','CODEX_HOME','CLAUDE_CONFIG_DIR','XDG_CONFIG_HOME','SHRINKCAGE_HEADROOM_PORT'] as const;
const TTL=5*60*1000;
export interface TerminalOptions {
  desktopDiscovery?:()=>Promise<import('./desktop-terminals.js').DesktopTerminal[]>;
  openScript?:(file:string,env:NodeJS.ProcessEnv,emulator?:string)=>Promise<void>;
  discover?:()=>Promise<TerminalChoice[]>;
  sessionRunning?:(name:string)=>Promise<boolean>;
}
export class TerminalLauncher {
  constructor(private plane:ControlPlane,private options:TerminalOptions={}){}
  discover(){return this.options.discover?.()??inspectTerminals(this.plane.env);}
  private desktopCache?:{at:number;value:Awaited<ReturnType<typeof discoverDesktops>>};
  private desktopPending?:Promise<Awaited<ReturnType<typeof discoverDesktops>>>;
  async desktops(force=false){if(!force&&this.desktopCache&&Date.now()-this.desktopCache.at<30000)return this.desktopCache.value;if(this.desktopPending)return this.desktopPending;this.desktopPending=(this.options.desktopDiscovery?.()??discoverDesktops(this.plane.env)).then(value=>{this.desktopCache={at:Date.now(),value};return value;}).finally(()=>{this.desktopPending=undefined;});return this.desktopPending;}
  async desktopChoices(force=false){return {terminals:(await this.desktops(force)).map(({id,name,icon})=>({id,name,icon})),preferred:this.plane.store.terminalPreference()};}
  async preferDesktop(id:string){if(!(await this.desktops(true)).some(t=>t.id===id))throw new ControlError('Choose an installed compatible terminal.');this.plane.store.setTerminalPreference(id);return {preferred:id};}
  private async open(file:string,emulator?:string){if(this.options.openScript)return this.options.openScript(file,this.plane.env,emulator);await openDesktop(file,this.plane.env,emulator,this.plane.store.terminalPreference());}
  links(){return this.plane.store.terminalLaunches().filter(t=>t.target==='herdr'&&t.herdr&&t.sessionId).map(t=>({sessionId:t.sessionId!,name:t.herdr!.name}));}
  private reopening=new Set<string>();
  async reopen(sessionId:string){
    if(!UUID.test(sessionId))throw new ControlError('Choose a valid managed session.');
    const ticket=this.plane.store.terminalLaunches().find(t=>t.sessionId===sessionId&&t.target==='herdr'&&t.herdr);
    if(!ticket?.herdr)throw new ControlError('This session has no saved Herdr link. Start a new session in Herdr.');
    const binding=ticket.herdr;
    if(this.reopening.has(sessionId))throw new ControlError('This session is already opening.','busy',409);
    this.reopening.add(sessionId);try{
      const choice=(await this.discover()).find(t=>t.id==='herdr');if(!choice?.available)throw new ControlError(choice?.reason??'Herdr is unavailable.');
      const root=join(this.plane.store.dir,'launchers'),dir=join(root,ticket.id);
      const verify=async()=>{if(await realpath(root)!==root||await realpath(dir)!==dir||(await lstat(root)).isSymbolicLink()||(await lstat(dir)).isSymbolicLink())throw new ControlError('The owned Herdr launcher moved or changed. Start a new reviewed session.');
      for(const [name,hash]of [['herdr.command',ticket.scriptHash],['herdr.toml',binding.configHash],['start.command',binding.startHash]]){const bytes=await readBounded(join(dir,name!),32768);if(!bytes||digest(bytes.toString('utf8'))!==hash)throw new ControlError('The saved Herdr configuration changed. Start a new reviewed session.');}
      };await verify();
      const name=binding.name;if(!/^sc-[a-f0-9]{24}$/.test(name))throw new ControlError('The saved Herdr identity is invalid.');
      let running=false;
      if(this.options.sessionRunning)running=await this.options.sessionRunning(name);
      else {const binary=await terminalExecutable('herdr',this.plane.env);if(!binary)throw new ControlError('Herdr is not installed.');const env={...this.plane.env};for(const key of Object.keys(env))if(key.startsWith('HERDR_'))delete env[key];
        const result=await runBounded(binary,['session','list','--json'],{env});if(result.code===0){let data:unknown;try{data=JSON.parse(result.stdout);}catch{throw new ControlError('Herdr returned unreadable session status. Try again.');}const sessions=(data as {sessions?:unknown})?.sessions;if(!Array.isArray(sessions))throw new ControlError('Herdr returned unsupported session status.');running=sessions.some(s=>s&&typeof s==='object'&&s.name===name&&s.running===true);}}
      if(!running)throw new ControlError('This Herdr session is no longer running. Start a new reviewed session. Reopening does not restore a stopped agent.');
      await verify();await this.open(join(dir,'herdr.command'),ticket.emulator&& (await this.desktops(true)).some(t=>t.id===ticket.emulator)?ticket.emulator:undefined);return {opened:true,sessionId};
    }catch(e){if(e instanceof ControlError)throw e;throw new ControlError('The saved Herdr session could not open. Check Herdr or start a new reviewed session.');}finally{this.reopening.delete(sessionId);}
  }
  remember(plan:OptimizationPlan,input:{agent:string;profile:string;projectId:string;options:LaunchOptions}){
    if(plan.ready){const context:Record<string,string|null>={};for(const key of CONTEXT)context[key]=this.plane.env[key]??null;
      this.plane.store.saveTerminalPreview({...input,fingerprint:plan.fingerprint,expiresAt:Date.now()+TTL,context});}
    return plan;
  }
  list(){return this.plane.store.terminalLaunches().slice(0,20).map(value=>publicLaunch(value.expiresAt<=Date.now()&&['opening','waiting'].includes(value.state)?{...value,state:'failed',error:'The terminal did not claim this approval before it expired. Review and start again.'}:value));}
  async start(input:{fingerprint:string;target:TerminalTarget;requestId:string;emulator?:string}){
    if(input.emulator!==undefined&&!TERMINAL_ADAPTERS.some(t=>t.id===input.emulator))throw new ControlError('Unsupported terminal application.');
    if(!HASH.test(input.fingerprint)||!UUID.test(input.requestId)||!['terminal','herdr'].includes(input.target))throw new ControlError('Choose a reviewed plan and a supported terminal.');
    const existing=this.plane.store.terminalLaunch(input.requestId);
    if(existing){if(existing.fingerprint!==input.fingerprint||existing.target!==input.target||existing.emulator!==input.emulator)throw new ControlError('This launch request already belongs to another configuration.','approval',409);return publicLaunch(existing);}
    const preview=this.plane.store.terminalPreview(input.fingerprint);if(!preview||preview.expiresAt<=Date.now())throw new ControlError('The launch preview expired. Review the session configuration again.','approval',409);
    const {plan,projectPath}=await this.plane.plan(preview.agent,preview.profile,{id:preview.projectId},preview.options);
    if(!plan.ready||plan.fingerprint!==input.fingerprint)throw new ControlError('The configuration changed. Review the session configuration again.','approval',409);
    if(input.emulator&&!(await this.desktops(true)).some(t=>t.id===input.emulator))throw new ControlError('The selected terminal is no longer available. Rescan and choose another terminal.');
    const choice=(await this.discover()).find(t=>t.id===input.target);if(!choice?.available)throw new ControlError(choice?.reason??'This terminal is unavailable.');
    if(this.plane.store.terminalLaunches().filter(t=>['opening','waiting'].includes(t.state)&&t.expiresAt>Date.now()).length>=5)throw new ControlError('Five terminal launches are still waiting. Finish one or wait for its approval to expire.','busy',409);
    const value:TerminalLaunch={id:input.requestId,fingerprint:input.fingerprint,target:input.target,createdAt:new Date().toISOString(),expiresAt:Math.min(preview.expiresAt,Date.now()+TTL),state:'opening',emulator:input.emulator,sessionId:null,error:null,preview};
    if(!this.plane.store.reserveTerminalLaunch(value))return publicLaunch(this.plane.store.terminalLaunch(value.id)!);
    try{const file=await this.script(value,projectPath);const bytes=await readBounded(file,32768);if(!bytes||digest(bytes.toString('utf8'))!==this.plane.store.terminalLaunch(value.id)?.scriptHash)throw new ControlError('The owned launch file changed before opening. Review and start again.');await this.open(file,input.emulator);
      const current=this.plane.store.terminalLaunch(value.id)!;if(current.state==='opening')this.plane.store.updateTerminalLaunch(value.id,{state:'waiting'});
    }catch(e){this.plane.store.updateTerminalLaunch(value.id,{state:'failed',error:e instanceof ControlError?e.message:'The terminal could not open. Check desktop permissions, or use Copy command.'});}
    return publicLaunch(this.plane.store.terminalLaunch(value.id)!);
  }
  private async script(value:TerminalLaunch,projectPath:string){
    const root=join(this.plane.store.dir,'launchers');await mkdir(root,{recursive:true,mode:0o700});if((await lstat(root)).isSymbolicLink()||await realpath(root)!==root)throw new ControlError('The launch directory must not be a symlink.');
    const dir=join(root,value.id);await mkdir(dir,{mode:0o700});if(await realpath(dir)!==dir||(await lstat(dir)).isSymbolicLink())throw new ControlError('The owned launch directory changed. Review and start again.');await chmod(dir,0o700);
    // The compiled package and the source tests have different parent depths.
    const entry=fileURLToPath(new URL(import.meta.url.includes('/dist-server/')?'../../../bin/shrinkcage.mjs':'../../bin/shrinkcage.mjs',import.meta.url));
const args=[process.execPath,'--disable-warning=ExperimentalWarning',entry,'sessions','start-ticket',value.id];
    const file=join(dir,process.platform==='win32'?'start.ps1':'start.command');
    const ending=value.target==='herdr'?'unset HERDR_AGENT\nexec /bin/sh -i\n':'exit "$result"\n';
    const body=process.platform==='win32'?`$env:SHRINKCAGE_DATA_DIR = ${powershellQuote(this.plane.canonicalDataDir)}\nSet-Location -LiteralPath ${powershellQuote(projectPath)}\n& ${args.map(powershellQuote).join(' ')}\nWrite-Host ('Shrinkcage exited with code ' + $LASTEXITCODE)\n`:`#!/bin/sh\ncd ${shellQuote(projectPath)} || exit 1\nexport SHRINKCAGE_DATA_DIR=${shellQuote(this.plane.canonicalDataDir)}\n${args.map(shellQuote).join(' ')}\nresult=$?\nprintf '\\nShrinkcage session finished (exit %s). You can close this window.\\n' "$result"\n${ending}`;
    await writeFile(file,body,{flag:'wx',mode:0o700});this.plane.store.updateTerminalLaunch(value.id,{scriptHash:digest(body)});
    if(value.target==='terminal')return file;
    const herdr=await terminalExecutable('herdr',this.plane.env);if(!herdr)throw new ControlError('Herdr is no longer installed.');
    const config=join(dir,'herdr.toml');
    const configBody=`onboarding = false\n[terminal]\ndefault_shell = ${JSON.stringify(file)}\nshell_mode = "non_login"\nnew_cwd = "current"\n[session]\nresume_agents_on_restore = false\n[update]\nversion_check = false\nmanifest_check = false\n`;await writeFile(config,configBody,{flag:'wx',mode:0o600});
    const name='sc-'+randomBytes(12).toString('hex');
    const wrapper=join(dir,'herdr.command');const prefix=[...new Set([...Object.keys(this.plane.env).filter(k=>/^HERDR_[A-Za-z0-9_]+$/.test(k)),'HERDR_SESSION','HERDR_SOCKET_PATH','HERDR_AGENT'])].map(k=>'unset '+k).join('\n');
    const context=['HOME','XDG_CONFIG_HOME'].filter(key=>this.plane.env[key]).map(key=>'export '+key+'='+shellQuote(this.plane.env[key]!)).join('\n');
    const wrapperBody=`#!/bin/sh\ncd ${shellQuote(projectPath)} || exit 1\n${prefix}\n${context}\nexport HERDR_AGENT=${shellQuote(value.preview.agent)}\nexport HERDR_CONFIG_PATH=${shellQuote(config)}\nexec ${shellQuote(herdr.command)} --session ${shellQuote(name)}\n`;await writeFile(wrapper,wrapperBody,{flag:'wx',mode:0o700});this.plane.store.updateTerminalLaunch(value.id,{scriptHash:digest(wrapperBody),herdr:{name,configHash:digest(configBody),startHash:digest(body)}});return wrapper;
  }
}

export async function runTerminalTicket(plane:ControlPlane,id:string,options:{interactive?:boolean}={}){
  if(!UUID.test(id))throw new ControlError('Invalid terminal launch approval.');
  if(!(options.interactive??(process.stdin.isTTY&&process.stdout.isTTY)))throw new ControlError('Start Session requires an interactive terminal. This approval was not used.');
  const ticket=plane.store.claimTerminalLaunch(id),preview:LaunchPreview=ticket.preview;
  try{for(const key of Object.keys(preview.context)){const value=preview.context[key];if(!CONTEXT.includes(key as typeof CONTEXT[number])||value!==null&&typeof value!=='string')throw new ControlError('The launch context is invalid.');if(value===null)delete plane.env[key];else plane.env[key]=value;}
    return await runManaged(plane,{agent:preview.agent,profile:preview.profile,project:{id:preview.projectId},approved:preview.fingerprint,args:[],options:preview.options},{onCreated:session=>{plane.store.updateTerminalLaunch(id,{state:'started',sessionId:session.id});}});
  }catch(e){plane.store.updateTerminalLaunch(id,{state:'failed',error:e instanceof ControlError?e.message:'The managed launch failed. Review session diagnostics; private output was not retained.'});throw e;}
  finally{if(plane.store.terminalLaunch(id)?.state==='started')plane.store.updateTerminalLaunch(id,{state:'exited'});
    // Herdr's persistent server still needs its configured default-shell file.
    if(ticket.target==='terminal'){const root=join(plane.store.dir,'launchers'),dir=join(root,id),file=join(dir,process.platform==='win32'?'start.ps1':'start.command');try{const owned=await realpath(root)===root&&await realpath(dir)===dir&&!(await lstat(root)).isSymbolicLink()&&!(await lstat(dir)).isSymbolicLink();if(owned){const bytes=await readBounded(file,32768);if(bytes&&digest(bytes.toString('utf8'))===ticket.scriptHash&&await realpath(dir)===dir){await unlink(file);await rmdir(dir);}}}catch{/* changed or still-open resources are preserved */}}
  }
}
