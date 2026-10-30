import { spawn,type ChildProcess } from 'node:child_process';
import { randomBytes,randomUUID } from 'node:crypto';
import { normalizeHeadroom,normalizeRtk } from '../adapters.js';
import { ControlPlane } from './core.js';
import { adapter, type AdapterContext, type AppliedResources } from './adapters.js';
import { executable,headroomDocument,runBounded } from './probe.js';
import { ControlError } from './schema.js';
import { prepareRuntime,receiptEvents,runtimeEntry, type ReceiptEvent } from './runtime.js';
import type { ManagedSession,MetricObservation,OptimizationPlan } from './types.js';

export function validateAgentArguments(args:string[],plan:OptimizationPlan){
  if(args.length>100||args.reduce((n,a)=>n+a.length,0)>16384||args.some(a=>typeof a!=='string'||a.includes('\0')))throw new ControlError('Agent arguments exceed the safe limit.');
  for(let i=0;i<args.length;i++){
    const a=args[i];if(a==='--')break;
    if(['--remote','--cd','-C','--worktree'].includes(a)||/^(?:--remote|--cd|--worktree)=|^-C.+/.test(a))throw new ControlError('Agent arguments conflict with the approved project or process scope.');
    if(!plan.tools.length)continue;
    if(a==='--profile'||a==='-p'||/^--profile=|^-p.+/.test(a)||plan.tools.includes('headroom')&&['--oss','--local-provider'].some(flag=>a===flag||a.startsWith(flag+'=')))throw new ControlError('Agent arguments conflict with the approved project or process scope.');
    const config=a==='--config'||a==='-c'?args[i+1]:a.startsWith('--config=')?a.slice(9):a.startsWith('-c')&&a.length>2?a.slice(2):'';
    if(config&&/^(?:model_provider(?:s)?|openai_base_url|chatgpt_base_url|mcp_servers|hooks|features)\b/.test(config.trim())||['--enable','--disable'].includes(a)&&args[i+1]==='hooks')throw new ControlError('Agent configuration overrides conflict with the approved optimizer plan.');
  }
}
export async function sharedObservations(env:NodeJS.ProcessEnv=process.env):Promise<MetricObservation[]>{
  try{const binary=await executable('rtk',env);let gain:unknown={};if(binary)try{const result=await runBounded(binary,['gain','--all','--format','json'],{env});if(result.code===0)gain=JSON.parse(result.stdout);}catch{}
    const stats=await headroomDocument('stats',env),h=normalizeHeadroom(stats??{},{},{}),r=normalizeRtk(gain,{}),at=new Date().toISOString();return [
    {metric:'headroom_tokens_saved',value:h.saved,unit:'tokens',source:'Headroom stats',observed_at:at,scope:'shared' as const,measurement_method:'Proxy-reported runtime total',confidence:h.saved===null?'inconclusive' as const:'reported' as const,coverage:'Shared configured proxy; no managed-session correlation',source_version:null,is_estimate:false},
    {metric:'rtk_estimated_tokens_saved',value:r.saved,unit:'estimated tokens',source:'RTK gain',observed_at:at,scope:'shared' as const,measurement_method:'RTK output byte/token estimate',confidence:r.saved===null?'inconclusive' as const:'reported' as const,coverage:'Shared RTK tracking; may overlap Headroom savings',source_version:null,is_estimate:true},
  ];}catch{return [];}
}
export async function updateEvidence(session:ManagedSession,context:Omit<AdapterContext,'events'>,events:ReceiptEvent[]){
  const activity=new Map<string,{tool:ReceiptEvent['tool'];name:string;count:number;observedAt:string}>();
  for(const event of events){if(!session.plannedTools.includes(event.tool)||event.phase!=='usage_observed')continue;const key=event.tool+':'+event.name;const row=activity.get(key)??{tool:event.tool,name:event.name,count:0,observedAt:event.at};row.count++;row.observedAt=event.at;activity.set(key,row);}
  session.toolActivity=[...activity.values()].slice(0,100);const shared=session.metrics.filter(m=>m.scope==='shared');const observed:MetricObservation[]=[];
  for(const tool of session.plannedTools){const a=adapter(tool);const c={...context,events,session};const evidence=await a.verify(c);const index=session.evidence.findIndex(e=>e.tool===tool);if(index<0)session.evidence.push(evidence);else session.evidence[index]=evidence;observed.push(...await a.observe(c));}
  session.metrics=[...shared,...observed];
}
export async function runManaged(plane:ControlPlane,input:{agent:string;profile:string;project:{path?:string;id?:string};approved:string;args:string[]},options:{snapshot?:()=>Promise<MetricObservation[]>;quiet?:boolean}={}):Promise<number>{
  const {plan,projectPath}=await plane.plan(input.agent,input.profile,input.project);
  if(!plan.ready)throw new ControlError('Plan is blocked: '+plan.errors.join(' '));
  if(plan.fingerprint!==input.approved)throw new ControlError('Run approval is stale. Preview and approve the current plan fingerprint.','approval',409);
  validateAgentArguments(input.args,plan);
  const program=plan.tools.includes('headroom')?'headroom':'codex',binary=await executable(program,plane.env);if(!binary)throw new ControlError('The approved executable is no longer available.');
  for(const name of ['codex',...plan.tools] as const){const current=await executable(name,plane.env);if(!current||current.fingerprint!==plan.binaryFingerprints[name])throw new ControlError('An executable changed after approval. Preview the plan again.','approval',409);}
  const id=randomUUID(),token=randomBytes(32).toString('hex'),now=new Date().toISOString();
  const session:ManagedSession={schemaVersion:1,id,origin:'managed',project:plan.project,agent:plan.agent,agentVersion:plan.agentVersion,profile:plan.profile,profileRevision:plan.profileRevision,planFingerprint:plan.fingerprint,status:'preflight',startedAt:now,endedAt:null,heartbeatAt:now,exitCode:null,signal:null,plannedTools:plan.tools,appliedTools:[],evidence:plan.evidence.map(e=>({...e,status:'configured',scope:plan.tools.includes(e.tool)&&e.tool==='rtk'?'project':'process',confidence:'inconclusive'})),diagnostics:[...plan.warnings,'Running means an owned launch process; tool connections and usage require separate receipt evidence.'],elapsedMs:null,toolActivity:[],metrics:[]};
  const runtime=await prepareRuntime(plane.canonicalDataDir,id,token,plan.tools,plan.binaryFingerprints);let created=false;const applied:AppliedResources[]=[];let heartbeat:ReturnType<typeof setInterval>|undefined,beating=false;const started=Date.now();let lastSignal:NodeJS.Signals|null=null;
  let supervisor:ChildProcess|undefined;const context={plane,plan,approved:input.approved,session};let interrupt:(()=>void)|undefined,terminate:(()=>void)|undefined;
  try{
    plane.store.createSession(session,token);created=true;
    for(const tool of plan.tools)applied.push(await adapter(tool).apply({...context,events:[]}));
    const agentArgs=[...(plan.tools.length?['--no-daemon']:[]),...applied.flatMap(a=>a.overrides),...input.args];
    const args=program==='headroom'?['wrap','codex','--no-proxy','--no-mcp','--code-memory','none','--port',String(plan.headroomPort),'--',...agentArgs]:agentArgs;
    session.metrics=await (options.snapshot??(()=>sharedObservations(plane.env)))();
    session.status='starting';plane.store.updateSession(session,token);
    // Windows libuv kills non-detached children when the parent's job closes.
    // Only the guardian escapes that job; it retains inherited streams, live IPC
    // and ownership of the actual agent, and exits after durable owner acknowledgement.
    const entry=runtimeEntry('supervisor');const child=spawn(entry.command,entry.args,{cwd:projectPath,env:{...plane.env,SHRINKCAGE_DATA_DIR:plane.canonicalDataDir,SHRINKCAGE_SESSION_ID:id,SHRINKCAGE_SESSION_TOKEN:token,SHRINKCAGE_HEADROOM_PORT:String(plan.headroomPort??8787),HEADROOM_BEACON:'off',HEADROOM_OFFLINE:'1',DO_NOT_TRACK:'1'},shell:false,stdio:['inherit','inherit','inherit','ipc'],detached:process.platform==='win32',windowsHide:process.platform==='win32'});
    supervisor=child;
    if(!options.quiet)console.error(`Shrinkcage managed session ${id.slice(0,8)} · ${plan.profile}. Stop in this terminal with Ctrl+C.`);
    let ready=false,launchError=false,actualCode:number|null=null,actualSignal:string|null=null;let reportExit:(code:number)=>void=()=>{};
    const sendStop=(signal:NodeJS.Signals)=>{if(lastSignal)return;lastSignal=signal;session.status='stopping';if(child.connected)child.send({type:'stop',signal},()=>{});};
    interrupt=()=>sendStop('SIGINT');terminate=()=>sendStop('SIGTERM');process.once('SIGINT',interrupt);process.once('SIGTERM',terminate);
    const readyTimeout=setTimeout(()=>{if(!ready){launchError=true;if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');}},10000);readyTimeout.unref();
    child.on('message',message=>{if(!message||typeof message!=='object')return;const m=message as {type?:string;code?:number|null;signal?:string|null};if(m.type==='ready'){ready=true;clearTimeout(readyTimeout);child.send({type:'launch',program,args,binaryFingerprint:binary.fingerprint},()=>{});}else if(m.type==='spawned'){session.status='running';session.appliedTools=plan.tools.slice();}else if(m.type==='exited'){actualCode=m.code??null;actualSignal=m.signal??null;reportExit(actualCode??1);}else if(m.type==='launch-error')launchError=true;});
    heartbeat=setInterval(()=>{if(beating)return;beating=true;void(async()=>{await runtime.beat();session.heartbeatAt=new Date().toISOString();await updateEvidence(session,context,await receiptEvents(runtime.path));if(session.evidence.some(e=>e.status==='failed')&&session.status==='running')session.status='degraded';plane.store.updateSession(session,token);})().catch(()=>{if(!session.diagnostics.includes('A heartbeat or receipt update failed.'))session.diagnostics.push('A heartbeat or receipt update failed.');}).finally(()=>{beating=false;});},2000);heartbeat.unref();
    const code=await new Promise<number>(resolve=>{reportExit=resolve;child.once('error',()=>{launchError=true;resolve(1);});child.once('close',code=>resolve(code??1));});
    clearTimeout(readyTimeout);clearInterval(heartbeat);while(beating)await new Promise(r=>setTimeout(r,10));
    await new Promise(r=>setTimeout(r,100));await updateEvidence(session,context,await receiptEvents(runtime.path));session.metrics.push(...await (options.snapshot??(()=>sharedObservations(plane.env)))());
    const finalCode=lastSignal==='SIGINT'?130:lastSignal==='SIGTERM'?143:actualCode??code;
    session.exitCode=finalCode;session.signal=lastSignal??actualSignal;session.status=launchError?'failed':lastSignal?'exited':finalCode===0?'exited':'failed';if(launchError)session.diagnostics.push('The owned launch process failed before startup was confirmed.');return finalCode;
  }catch(e){session.status='failed';session.exitCode=1;session.diagnostics.push(e instanceof ControlError?e.message:'Managed launch failed; private command output was not retained.');throw e;}
  finally{
    if(heartbeat)clearInterval(heartbeat);while(beating)await new Promise(r=>setTimeout(r,10));
    for(const resources of applied.reverse())await adapter(resources.tool).undo(resources).catch(()=>{session.diagnostics.push('An owned resource cleanup needs review.');});
    session.endedAt=new Date().toISOString();session.heartbeatAt=session.endedAt;session.elapsedMs=Date.now()-started;if(created)plane.store.updateSession(session,token);
    await runtime.close();
    if(supervisor?.connected){const owned=supervisor;const closed=new Promise<void>(resolve=>{owned.once('close',()=>resolve());});owned.send({type:'owner-finalized'},()=>{});const force=setTimeout(()=>{if(owned.exitCode===null&&owned.signalCode===null)owned.kill('SIGTERM');},3000);await closed;clearTimeout(force);}
    if(interrupt)process.removeListener('SIGINT',interrupt);if(terminate)process.removeListener('SIGTERM',terminate);
  }
}
