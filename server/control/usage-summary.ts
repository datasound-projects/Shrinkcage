import type {ManagedSession} from './types.js';

/** A native transcript reports a cumulative scope, even when several launch records reference it. */
export function uniqueUsageRecords(records:ManagedSession[]):ManagedSession[]{
  const groups=new Map<string,ManagedSession[]>();
  for(const record of records){const key=record.usage?.nativeSessionId?record.agent+':'+record.usage.nativeSessionId:'launch:'+record.id;groups.set(key,[...(groups.get(key)??[]),record]);}
  const at=(record:ManagedSession)=>Date.parse(record.usage?.observedAt??record.startedAt)||0;
  return [...groups.values()].map(group=>{
    const latest=group.reduce((a,b)=>at(b)>at(a)||at(b)===at(a)&&Date.parse(b.startedAt)>Date.parse(a.startedAt)?b:a);
    const modes=new Set(group.map(s=>s.billing?.mode??'unknown'));
    if(modes.size<2||!latest.accounting)return latest;
    // A cumulative transcript cannot divide spending between conflicting billing declarations.
    return {...latest,accounting:{...latest.accounting,apiEstimatedUsd:null,apiEquivalentUsd:null,limitations:[...latest.accounting.limitations,'This native usage scope has conflicting billing modes; monetary summary attribution is unavailable.']}};
  });
}
