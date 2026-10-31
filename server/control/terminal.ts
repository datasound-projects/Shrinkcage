import { chmod,lstat,mkdir,mkdtemp,realpath,rmdir,unlink,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ControlPlane } from './core.js';
import { ControlError,digest } from './schema.js';
import { inspectTerminals,openTerminalScript,powershellQuote,shellQuote,terminalExecutable } from './terminal-host.js';
import { publicLaunch,type LaunchPreview,type TerminalChoice,type TerminalLaunch,type TerminalTarget } from './terminal-types.js';
import { runManaged } from './runner.js';
import { readBounded } from './paths.js';
import type { LaunchOptions,OptimizationPlan } from './types.js';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const CONTEXT=['PATH','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','CODEX_HOME','CLAUDE_CONFIG_DIR','XDG_CONFIG_HOME','SHRINKCAGE_HEADROOM_PORT'] as const;
const TTL=5*60*1000;
export interface TerminalOptions {
  openScript?:(file:string,env:NodeJS.ProcessEnv)=>Promise<void>;
  discover?:()=>Promise<TerminalChoice[]>;
}
export class TerminalLauncher {
  constructor(private plane:ControlPlane,private options:TerminalOptions={}){}
  discover(){return this.options.discover?.()??inspectTerminals(this.plane.env);}
  remember(plan:OptimizationPlan,input:{agent:string;profile:string;projectId:string;options:LaunchOptions}){
    if(plan.ready){const context:Record<string,string|null>={};for(const key of CONTEXT)context[key]=this.plane.env[key]??null;
      this.plane.store.saveTerminalPreview({...input,fingerprint:plan.fingerprint,expiresAt:Date.now()+TTL,context});}
    return plan;
  }
  list(){return this.plane.store.terminalLaunches().slice(0,20).map(value=>publicLaunch(value.expiresAt<=Date.now()&&['opening','waiting'].includes(value.state)?{...value,state:'failed',error:'The terminal did not claim this approval before it expired. Review and start again.'}:value));}
  async start(input:{fingerprint:string;target:TerminalTarget;requestId:string}){
    if(!HASH.test(input.fingerprint)||!UUID.test(input.requestId)||!['terminal','herdr'].includes(input.target))throw new ControlError('Choose a reviewed plan and a supported terminal.');
    const existing=this.plane.store.terminalLaunch(input.requestId);
    if(existing){if(existing.fingerprint!==input.fingerprint||existing.target!==input.target)throw new ControlError('This launch request already belongs to another configuration.','approval',409);return publicLaunch(existing);}
    const preview=this.plane.store.terminalPreview(input.fingerprint);if(!preview||preview.expiresAt<=Date.now())throw new ControlError('The launch preview expired. Review the session configuration again.','approval',409);
    const {plan,projectPath}=await this.plane.plan(preview.agent,preview.profile,{id:preview.projectId},preview.options);
    if(!plan.ready||plan.fingerprint!==input.fingerprint)throw new ControlError('The configuration changed. Review the session configuration again.','approval',409);
    const choice=(await this.discover()).find(t=>t.id===input.target);if(!choice?.available)throw new ControlError(choice?.reason??'This terminal is unavailable.');
    if(this.plane.store.terminalLaunches().filter(t=>['opening','waiting'].includes(t.state)&&t.expiresAt>Date.now()).length>=5)throw new ControlError('Five terminal launches are still waiting. Finish one or wait for its approval to expire.','busy',409);
    const value:TerminalLaunch={id:input.requestId,fingerprint:input.fingerprint,target:input.target,createdAt:new Date().toISOString(),expiresAt:Math.min(preview.expiresAt,Date.now()+TTL),state:'opening',sessionId:null,error:null,preview};
    if(!this.plane.store.reserveTerminalLaunch(value))return publicLaunch(this.plane.store.terminalLaunch(value.id)!);
    try{const file=await this.script(value,projectPath);const bytes=await readBounded(file,32768);if(!bytes||digest(bytes.toString('utf8'))!==this.plane.store.terminalLaunch(value.id)?.scriptHash)throw new ControlError('The owned launch file changed before opening. Review and start again.');await(this.options.openScript??openTerminalScript)(file,this.plane.env);
      const current=this.plane.store.terminalLaunch(value.id)!;if(current.state==='opening')this.plane.store.updateTerminalLaunch(value.id,{state:'waiting'});
    }catch(e){this.plane.store.updateTerminalLaunch(value.id,{state:'failed',error:e instanceof ControlError?e.message:'The terminal could not open. Check desktop permissions, or use Copy command.'});}
    return publicLaunch(this.plane.store.terminalLaunch(value.id)!);
  }
  private async script(value:TerminalLaunch,projectPath:string){
    const root=join(this.plane.store.dir,'launchers');await mkdir(root,{recursive:true,mode:0o700});if((await lstat(root)).isSymbolicLink()||await realpath(root)!==root)throw new ControlError('The launch directory must not be a symlink.');
    const dir=join(root,value.id);await mkdir(dir,{mode:0o700});if(await realpath(dir)!==dir||(await lstat(dir)).isSymbolicLink())throw new ControlError('The owned launch directory changed. Review and start again.');await chmod(dir,0o700);
    // The compiled package and the source tests have different parent depths.
    const entry=fileURLToPath(new URL(import.meta.url.includes('/dist-server/')?'../../../bin/shrinkcage.mjs':'../../bin/shrinkcage.mjs',import.meta.url));
    const args=[process.execPath,entry,'sessions','start-ticket',value.id];
    const file=join(dir,process.platform==='win32'?'start.ps1':'start.command');
    const ending=value.target==='herdr'?'unset HERDR_AGENT\nexec /bin/sh -i\n':'exit "$result"\n';
    const body=process.platform==='win32'?`$env:SHRINKCAGE_DATA_DIR = ${powershellQuote(this.plane.canonicalDataDir)}\nSet-Location -LiteralPath ${powershellQuote(projectPath)}\n& ${args.map(powershellQuote).join(' ')}\nWrite-Host ('Shrinkcage exited with code ' + $LASTEXITCODE)\n`:`#!/bin/sh\ncd ${shellQuote(projectPath)} || exit 1\nexport SHRINKCAGE_DATA_DIR=${shellQuote(this.plane.canonicalDataDir)}\n${args.map(shellQuote).join(' ')}\nresult=$?\nprintf '\\nShrinkcage session finished (exit %s). You can close this window.\\n' "$result"\n${ending}`;
    await writeFile(file,body,{flag:'wx',mode:0o700});this.plane.store.updateTerminalLaunch(value.id,{scriptHash:digest(body)});
    if(value.target==='terminal')return file;
    const herdr=await terminalExecutable('herdr',this.plane.env);if(!herdr)throw new ControlError('Herdr is no longer installed.');
    // A short private directory also avoids UNIX socket path-length failures.
    const temp=await realpath(await mkdtemp('/tmp/shrinkcage-herdr-'));await chmod(temp,0o700);
    const config=join(temp,'config.toml');await writeFile(config,`onboarding = false\n[terminal]\ndefault_shell = ${JSON.stringify(file)}\nshell_mode = "non_login"\nnew_cwd = "current"\n[update]\nversion_check = false\nmanifest_check = false\n`,{flag:'wx',mode:0o600});
    const wrapper=join(dir,'herdr.command');const prefix=Object.keys(this.plane.env).filter(k=>/^HERDR_[A-Za-z0-9_]+$/.test(k)).map(k=>'unset '+k).join('\n');
    const wrapperBody=`#!/bin/sh\ncd ${shellQuote(projectPath)} || exit 1\n${prefix}\nexport HERDR_AGENT=${shellQuote(value.preview.agent)}\nexport HERDR_CONFIG_PATH=${shellQuote(config)}\nexec ${shellQuote(herdr.command)} --session ${shellQuote('sc-'+value.id.slice(0,8))}\n`;await writeFile(wrapper,wrapperBody,{flag:'wx',mode:0o700});this.plane.store.updateTerminalLaunch(value.id,{scriptHash:digest(wrapperBody)});return wrapper;
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
