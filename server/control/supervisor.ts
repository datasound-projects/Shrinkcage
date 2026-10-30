import { spawn, type ChildProcess } from 'node:child_process';
import { runtimeAlive,runtimeContext } from './runtime.js';
import { executable } from './probe.js';
import { rm } from 'node:fs/promises';
import { constants,writeFileSync,openSync,closeSync } from 'node:fs';
import { join } from 'node:path';
import { ControlStore } from './store.js';

export async function supervise(){
  const context=await runtimeContext();if(!context||!process.send||!await runtimeAlive(context.path))throw Error('No managed owner.');
  let child:ChildProcess|undefined,stopping=false,finished=false,orphaned=false,finalized=false;
  let stopSignal:NodeJS.Signals|null=null,exitCode:number|null=null,exitSignal:NodeJS.Signals|null=null;
  let force:ReturnType<typeof setTimeout>|undefined,ack:ReturnType<typeof setTimeout>|undefined;
  let phase='started',failure:string|null=null;
  const record=()=>{try{const fd=openSync(join(context.path,'guardian.json'),constants.O_CREAT|constants.O_WRONLY|constants.O_TRUNC|(constants.O_NOFOLLOW??0),0o600);try{writeFileSync(fd,JSON.stringify({phase,finished,orphaned,finalized,connected:process.connected,exitCode,exitSignal,stopSignal,failure,at:new Date().toISOString()}));}finally{closeSync(fd);}}catch{/* Never recreate a removed runtime or follow a replaced diagnostic file. */}};
  record();process.once('exit',()=>{phase='guardian_exit';record();});
  const send=(value:unknown)=>{if(process.connected)process.send?.(value as object,()=>{});};
  const disconnect=()=>{if(ack)clearTimeout(ack);if(process.connected)process.disconnect?.();};
  const abandoned=async()=>{
    if(finalized)return;finalized=true;phase='recovering';record();disconnect();let store:ControlStore|undefined;
    try{
      store=new ControlStore(process.env.SHRINKCAGE_DATA_DIR);const session=store.sessions().find(s=>s.id===context.id),token=process.env.SHRINKCAGE_SESSION_TOKEN!;
      if(session&&store.owns(context.id,token)){session.status='abandoned';session.signal=stopSignal??exitSignal;session.exitCode=exitCode;session.endedAt=new Date().toISOString();session.heartbeatAt=session.endedAt;session.elapsedMs=Date.now()-Date.parse(session.startedAt);session.diagnostics.push('Owning CLI disconnected before finalization. Its guardian stopped the owned child without using a persisted PID.');store.updateSession(session,token);}
      await rm(context.path,{recursive:true,force:true});
    }catch(e){failure=e instanceof Error&&'code' in e&&/^[A-Z_0-9]{1,40}$/.test(String(e.code))?String(e.code):'unavailable';phase='cleanup_failed';record();console.error('Managed guardian metadata cleanup was unavailable; stale heartbeat remains the safe fallback.');}finally{store?.close();}
  };
  const finish=(code:number|null,signal:NodeJS.Signals|null)=>{
    if(finished)return;finished=true;exitCode=code;exitSignal=signal;if(force)clearTimeout(force);clearInterval(timer);
    phase='agent_exited';record();process.exitCode=stopSignal==='SIGINT'?130:stopSignal==='SIGTERM'?143:signal?1:code??1;
    if(orphaned||!process.connected){void abandoned();return;}
    // Keep the guardian alive until the owner durably saves metadata and closes
    // runtime files. A successful send alone does not prove the owner survived.
    ack=setTimeout(()=>{orphaned=true;void abandoned();},10000);send({type:'exited',code,signal:stopSignal??signal});
  };
  const stop=(signal:NodeJS.Signals='SIGTERM')=>{
    if(stopping||finished)return;stopping=true;stopSignal=signal;
    if(child&&child.exitCode===null&&child.signalCode===null){child.kill(signal);force=setTimeout(()=>{if(child?.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');},3000);force.unref();}else if(!child)finish(1,null);
  };
  const timer=setInterval(()=>{void runtimeAlive(context.path).then(alive=>{if(!alive){orphaned=true;stop();}});},4000);timer.unref();
  process.on('message',message=>{void(async()=>{
    if(!message||typeof message!=='object')return;const m=message as {type?:unknown;program?:unknown;args?:unknown;binaryFingerprint?:unknown;signal?:unknown};
    if(m.type==='owner-finalized'){if(finished&&!orphaned){finalized=true;disconnect();}return;}
    if(m.type==='stop'){stop(m.signal==='SIGINT'?'SIGINT':'SIGTERM');return;}
    if(m.type!=='launch'||child||finished||!['codex','headroom'].includes(String(m.program))||!Array.isArray(m.args)||m.args.length>160||m.args.some(a=>typeof a!=='string'||a.includes('\0')||a.length>16384))throw Error('Invalid managed launch.');
    const binary=await executable(m.program as 'codex'|'headroom');if(!binary||binary.fingerprint!==m.binaryFingerprint)throw Error('Executable changed after approval.');
    child=spawn(binary.command,[...binary.prefix,...m.args],{cwd:process.cwd(),env:process.env,shell:false,stdio:'inherit',windowsHide:false});
    child.once('spawn',()=>send({type:'spawned'}));child.once('error',()=>finish(1,null));child.once('close',(code,signal)=>finish(code,signal));
  })().catch(()=>{send({type:'launch-error'});if(child)stop();else finish(1,null);});});
  process.once('disconnect',()=>{if(finalized)return;orphaned=true;if(finished)void abandoned();else stop();});
  process.once('SIGINT',()=>stop('SIGINT'));process.once('SIGTERM',()=>stop('SIGTERM'));send({type:'ready'});
}
void supervise().catch(()=>{console.error('Managed supervisor could not verify its owner.');process.exitCode=1;});
