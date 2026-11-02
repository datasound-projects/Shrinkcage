import { chooseSession } from './projectChoice';
import { useEffect,useRef,useState } from 'react';
import type { OptimizationPlan } from '../../server/control/types';
import type { PublicTerminalLaunch,TerminalChoice } from '../../server/control/terminal-types';

const BASE='/api/control/v1';
type Props={plan:OptimizationPlan;reviewed:boolean;mutate:(path:string,value:unknown)=>Promise<any>;refresh:(force?:boolean)=>Promise<void>};
export function TerminalStart({plan,reviewed,mutate,refresh}:Props){
  const request=useRef({id:crypto.randomUUID(),settled:false});
  const [choices,setChoices]=useState<TerminalChoice[]>([]),[launch,setLaunch]=useState<PublicTerminalLaunch|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[discovery,setDiscovery]=useState(0);
  useEffect(()=>{const abort=new AbortController();void fetch(BASE+'/terminals',{signal:abort.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error(r.status===404?'Restart the Shrinkcage dashboard to enable Start session. Copy command remains available.':'Terminal discovery is unavailable. Copy command remains available.');return r.json();}).then(setChoices).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return()=>abort.abort();},[discovery]);
  const waiting=!!launch&&['opening','waiting','claimed'].includes(launch.state);
  useEffect(()=>{if(!launch||!waiting)return;let stopped=false,timer:ReturnType<typeof setTimeout>;const abort=new AbortController();
    const poll=async()=>{try{const r=await fetch(BASE+'/terminal-launches',{signal:abort.signal,cache:'no-store'});if(!r.ok)throw Error();const values=await r.json() as PublicTerminalLaunch[],next=values.find(v=>v.id===launch.id);if(stopped)return;
      if(next){setLaunch(next);setError('');if(next.sessionId){await refresh();return;}if(next.state==='failed')return;}
      if(Date.now()>launch.expiresAt){setError('This launch approval expired. Review the configuration again.');return;}
    }catch{if(!stopped)setError('Waiting for the local server. Check the terminal before retrying to avoid a duplicate session.');}if(!stopped)timer=setTimeout(()=>void poll(),1500);};
    void poll();return()=>{stopped=true;abort.abort();clearTimeout(timer);};
  },[launch?.id,waiting,refresh]);
  const target='herdr' as const;
  const selected=choices.find(c=>c.id==='herdr');
  useEffect(()=>{if(!launch?.sessionId)return;chooseSession(launch.sessionId,plan.project.id);window.location.hash='managed';},[launch?.sessionId]);
  const start=async()=>{if(request.current.settled)request.current={id:crypto.randomUUID(),settled:false};setBusy(true);setError('');try{const value=await mutate('/terminal-launches',{fingerprint:plan.fingerprint,target,requestId:request.current.id,approved:true});request.current.settled=true;setLaunch(value);if(value.sessionId)void refresh();}catch(e){setError(e instanceof TypeError||e instanceof Error&&e.name==='AbortError'?'The launch was not confirmed. Check Herdr, then retry safely.':e instanceof Error?e.message:'Herdr could not open.');}finally{setBusy(false);}};
  return <div className="terminal-start" aria-label="Start reviewed session">
    <div className="terminal-start-controls"><button className="button primary" disabled={!plan.ready||!reviewed||busy||waiting||!selected?.available} onClick={()=>void start()}>{busy?'Opening Herdr…':waiting?'Waiting for Herdr…':'Open in Herdr'}</button><span className="control-help">A persistent Herdr session with its own configuration.</span></div>
    <p className="control-help">{selected?.available?'Herdr keeps the session running when you detach. Your native sign-in and permissions still apply.':selected?.reason??'Checking Herdr availability…'}</p>
    {selected?.available===false&&<p className="control-help"><a href="https://herdr.dev/tui/docs/install/" target="_blank" rel="noreferrer">Get Herdr ↗</a> · Install it separately, then recheck. No agent is started.</p>}
    {launch&&<p role="status" className={launch.state==='failed'?'control-error':'terminal-launch-status'}>{launch.state==='failed'?launch.error:launch.sessionId?<><strong>Session {launch.sessionId.slice(0,8)} created.</strong> Check its optimizer activation in <a href="#managed">Sessions →</a></>:'Herdr requested. Waiting for the managed launcher to confirm. No optimizer is marked active yet.'}</p>}
    {error&&<p role="alert" className="control-error">{error}</p>}
    <details><summary>Herdr availability & persistence</summary>{choices.filter(c=>c.id==='herdr').map(c=><p key={c.id}><strong>{c.name}</strong>{c.version?` ${c.version}`:''}: {c.reason}</p>)}<button className="button" disabled={busy||waiting} onClick={()=>{setError('');setDiscovery(v=>v+1);}}>Recheck Herdr</button><p className="control-help">Detach with Ctrl+B, then Q. Reopen the same running session from Projects. A computer restart or stopped Herdr server ends live processes; automatic agent restoration is disabled. Windows Herdr launch is not supported.</p></details>
  </div>;
}

export function HerdrReopen({id,mutate}:{id:string;mutate:Props['mutate']}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
  return <div className="herdr-reopen"><button className="button primary" disabled={busy} onClick={async()=>{setBusy(true);setError('');setDone(false);try{await mutate('/sessions/reopen',{id,approved:true});setDone(true);}catch(e){setError(e instanceof Error?e.message:'Herdr could not reopen.');}finally{setBusy(false);}}}>{busy?'Reopening…':'Reopen in Herdr'}</button>{done&&<span role="status" className="control-help">Opened the existing Herdr session.</span>}{error&&<p role="alert" className="control-error">{error}</p>}</div>;
}
