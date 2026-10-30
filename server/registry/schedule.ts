/** A metadata observation is committed only after its changed repository was inspected.
 * A bounded run must not consume a version change that it did not have time to review. */
export interface RepositoryObservation {id:number;repository:string;version:string|null;checkedAt:string;pushedAt:string|null;archived?:boolean}
const changed=(a:RepositoryObservation|undefined,b:RepositoryObservation)=>!a||a.version!==b.version||a.pushedAt!==b.pushedAt||Boolean(a.archived)!==Boolean(b.archived);
export function discoveryBatch(previous:RepositoryObservation[],observed:RepositoryObservation[],discovered:string[],limit:number){
  const pending=observed.filter(r=>changed(previous.find(p=>p.id===r.id),r)).map(r=>r.repository);
  return [...new Set([...pending,...discovered].map(n=>n.toLowerCase()))].slice(0,limit);
}
export function discoveryProgress(previous:RepositoryObservation[],observed:RepositoryObservation[],completed:string[]){
  const done=new Set(completed.map(n=>n.toLowerCase())),result=new Map(previous.map(p=>[p.id,p]));
  for(const r of observed)if(!changed(result.get(r.id),r)||done.has(r.repository.toLowerCase()))result.set(r.id,r);
  return [...result.values()];
}
