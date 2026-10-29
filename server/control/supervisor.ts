import { spawn, type ChildProcess } from 'node:child_process';
import { runtimeAlive,runtimeContext } from './runtime.js';
import { executable } from './probe.js';
import { rm } from 'node:fs/promises';
import { ControlStore } from './store.js';

export async function supervise(){
  const context=await runtimeContext();if(!context||!process.send||!await runtimeAlive(context.path))throw Error('No managed owner.');
  let child:ChildProcess|undefined,stopping=false,finished=false,orphaned=false,stopSignal:NodeJS.Signals|null=null,force:ReturnType<typeof setTimeout>|undefined;
  const stop=(signal:NodeJS.Signals='SIGTERM')=>{if(stopping||finished)return;stopping=true;stopSignal=signal;if(child&&child.exitCode===null&&child.signalCode===null){child.kill(signal);force=setTimeout(()=>{if(child?.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');},3000);force.unref();}else if(!child)finish(1,null);};
  const send=(value:unknown)=>{if(process.connected)process.send?.(value as object,()=>{});};
  const finish=(code:number|null,signal:NodeJS.Signals|null)=>{if(finished)return;finished=true;if(force)clearTimeout(force);clearInterval(timer);send({type:'exited',code,signal:stopSignal??signal});process.exitCode=stopSignal==='SIGINT'?130:stopSignal==='SIGTERM'?143:signal?1:code??1;
    if(orphaned)void(async()=>{let store:ControlStore|undefined;try{store=new ControlStore(process.env.SHRINKCAGE_DATA_DIR);const session=store.sessions().find(s=>s.id===context.id);const token=process.env.SHRINKCAGE_SESSION_TOKEN!;if(session&&store.owns(context.id,token)){session.status='abandoned';session.signal=stopSignal??signal;session.exitCode=code;session.endedAt=new Date().toISOString();session.heartbeatAt=session.endedAt;session.elapsedMs=Date.now()-Date.parse(session.startedAt);session.diagnostics.push('Owning CLI disconnected. Its guardian stopped the owned child without using a persisted PID.');store.updateSession(session,token);}await rm(context.path,{recursive:true,force:true});}catch{/* Heartbeat expiry remains a safe fallback; no unrelated PID is touched. */}finally{store?.close();}})();
    if(process.connected)process.disconnect?.();};
  const timer=setInterval(()=>{void runtimeAlive(context.path).then(alive=>{if(!alive)stop();});},4000);timer.unref();
  process.on('message',message=>{void(async()=>{
    if(!message||typeof message!=='object')return;const m=message as {type?:unknown;program?:unknown;args?:unknown;binaryFingerprint?:unknown;signal?:unknown};
    if(m.type==='stop'){stop(m.signal==='SIGINT'?'SIGINT':'SIGTERM');return;}
    if(m.type!=='launch'||child||finished||!['codex','headroom'].includes(String(m.program))||!Array.isArray(m.args)||m.args.length>160||m.args.some(a=>typeof a!=='string'||a.includes('\0')||a.length>16384))throw Error('Invalid managed launch.');
    const binary=await executable(m.program as 'codex'|'headroom');if(!binary||binary.fingerprint!==m.binaryFingerprint)throw Error('Executable changed after approval.');
    child=spawn(binary.command,[...binary.prefix,...m.args],{cwd:process.cwd(),env:process.env,shell:false,stdio:'inherit',windowsHide:false});
    child.once('spawn',()=>send({type:'spawned'}));child.once('error',()=>finish(1,null));child.once('close',(code,signal)=>finish(code,signal));
  })().catch(()=>{send({type:'launch-error'});if(child)stop();else finish(1,null);});});
  process.once('disconnect',()=>{if(!finished){orphaned=true;stop();}});process.once('SIGINT',()=>stop('SIGINT'));process.once('SIGTERM',()=>stop('SIGTERM'));
  send({type:'ready'});
}
void supervise().catch(()=>{console.error('Managed supervisor could not verify its owner.');process.exitCode=1;});
