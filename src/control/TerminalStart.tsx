import { useEffect,useState } from 'react';
import type { OptimizationPlan } from '../../server/control/types';
import type { PublicTerminalLaunch,TerminalChoice,TerminalTarget } from '../../server/control/terminal-types';

const BASE='/api/control/v1';
type Props={plan:OptimizationPlan;reviewed:boolean;mutate:(path:string,value:unknown)=>Promise<any>;refresh:(force?:boolean)=>Promise<void>};
export function TerminalStart({plan,reviewed,mutate,refresh}:Props){
  const [choices,setChoices]=useState<TerminalChoice[]>([]),[target,setTarget]=useState<TerminalTarget>('terminal'),[launch,setLaunch]=useState<PublicTerminalLaunch|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[discovery,setDiscovery]=useState(0);
  useEffect(()=>{const abort=new AbortController();void fetch(BASE+'/terminals',{signal:abort.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error(r.status===404?'Restart the Shrinkcage dashboard to enable Start session. Copy command remains available.':'Terminal discovery is unavailable. Copy command remains available.');return r.json();}).then(setChoices).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return()=>abort.abort();},[discovery]);
  const waiting=!!launch&&['opening','waiting','claimed'].includes(launch.state);
  useEffect(()=>{if(!launch||!waiting)return;let stopped=false,timer:ReturnType<typeof setTimeout>;const abort=new AbortController();
    const poll=async()=>{try{const r=await fetch(BASE+'/terminal-launches',{signal:abort.signal,cache:'no-store'});if(!r.ok)throw Error();const values=await r.json() as PublicTerminalLaunch[],next=values.find(v=>v.id===launch.id);if(stopped)return;
      if(next){setLaunch(next);setError('');if(next.sessionId){await refresh();return;}if(next.state==='failed')return;}
      if(Date.now()>launch.expiresAt){setError('This launch approval expired. Review the configuration again.');return;}
    }catch{if(!stopped)setError('Waiting for the local server. Check the terminal before retrying to avoid a duplicate session.');}if(!stopped)timer=setTimeout(()=>void poll(),1500);};
    void poll();return()=>{stopped=true;abort.abort();clearTimeout(timer);};
  },[launch?.id,waiting,refresh]);
  const selected=choices.find(c=>c.id===target);
  const start=async()=>{setBusy(true);setError('');try{setLaunch(await mutate('/terminal-launches',{fingerprint:plan.fingerprint,target,requestId:crypto.randomUUID(),approved:true}));}catch(e){setError(e instanceof Error?e.message:'The terminal could not open.');}finally{setBusy(false);}};
  return <div className="terminal-start" aria-label="Start reviewed session">
    <div className="terminal-start-controls"><label>Open in<select aria-label="Session terminal" value={target} disabled={busy||waiting} onChange={e=>setTarget(e.target.value as TerminalTarget)}><option value="terminal">{choices.find(c=>c.id==='terminal')?.name??'Terminal'}</option><option value="herdr">Herdr</option></select></label><button className="button primary" disabled={!plan.ready||!reviewed||busy||waiting||!selected?.available} onClick={()=>void start()}>{busy?'Opening…':waiting?'Waiting for terminal…':'Start session'}</button></div>
    <p className="control-help">{selected?.reason??'Checking terminal availability…'} Native sign-in, project trust and approvals still apply.</p>
    {launch&&<p role="status" className={launch.state==='failed'?'control-error':'terminal-launch-status'}>{launch.state==='failed'?launch.error:launch.sessionId?<><strong>Session {launch.sessionId.slice(0,8)} created.</strong> Check its optimizer activation in <a href="#managed">Sessions →</a></>:'Terminal requested. Waiting for the managed launcher to confirm. No optimizer is marked active yet.'}</p>}
    {error&&<p role="alert" className="control-error">{error}</p>}
    <details><summary>Terminal availability</summary>{choices.map(c=><p key={c.id}><strong>{c.name}</strong>{c.version?` ${c.version}`:''}: {c.reason}</p>)}<button className="button" disabled={busy||waiting} onClick={()=>{setError('');setDiscovery(v=>v+1);}}>Recheck terminals</button><p className="control-help">Launch approval is single-use and expires after five minutes. Herdr uses separate private configuration; automatic session restoration and Windows Herdr launching are not supported.</p></details>
  </div>;
}
