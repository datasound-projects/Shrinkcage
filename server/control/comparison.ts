import { accountSession } from './accounting.js';
import type { AccountingSettings, Benchmark, ManagedSession } from './types.js';

type ComparisonInput=Omit<Benchmark,'id'|'createdAt'|'confounders'|'elapsedDifferenceMs'|'conclusion'>;
const difference=(a:number|null|undefined,b:number|null|undefined)=>a===null||a===undefined||b===null||b===undefined?null:b-a;
export function compareSessions(input:ComparisonInput,baseline:ManagedSession,optimized:ManagedSession,settings:AccountingSettings):Omit<Benchmark,'id'> {
  const confounders:string[]=[];
  const overlap=baseline.agent===optimized.agent&&Boolean(baseline.usage?.nativeSessionId)&&baseline.usage?.nativeSessionId===optimized.usage?.nativeSessionId;
  const stale=[baseline,optimized].some(s=>s.usage?.stale);
  if(overlap)confounders.push('Both launches reference the same native usage scope; cumulative counts are not independent task measurements.');
  if(stale)confounders.push('One or both native usage observations are stale.');
  if([baseline,optimized].some(s=>s.usage?.modelCoverage&&s.usage.modelCoverage!=='single'))confounders.push('A single observed model is not established for both sessions.');
  for(const key of ['sameTask','sameGitState','sameModel','sameEffort','sameCaching'] as const)if(!input[key])confounders.push(key+' is not confirmed.');
  if(input.quality!=='passed')confounders.push('Task quality has not passed review.');
  if(baseline.profile!=='baseline')confounders.push('The selected baseline did not use the baseline profile.');
  if(baseline.project.id!==optimized.project.id)confounders.push('Projects differ.');
  if(baseline.agent!==optimized.agent||baseline.agentVersion!==optimized.agentVersion)confounders.push('Agent or versions differ.');
  if(!baseline.usage?.model||baseline.usage.model!==optimized.usage?.model)confounders.push('Observed models differ or are unavailable.');
  if(baseline.usage?.coverage!=='complete-file'||optimized.usage?.coverage!=='complete-file')confounders.push('Complete native usage is unavailable for one or both sessions.');
  if(baseline.billing?.mode!==optimized.billing?.mode||!baseline.billing||['unknown','hybrid'].includes(baseline.billing.mode))confounders.push('Billing modes differ or are not fully identified.');
  if([baseline,optimized].some(s=>s.status!=='exited'||s.exitCode!==0))confounders.push('One or both launch processes did not exit successfully.');
  if(!optimized.evidence.some(e=>e.status==='usage_observed'))confounders.push('No optimizer usage receipt was observed in the optimized session.');
  if([baseline,optimized].some(s=>s.inheritedConfiguration?s.inheritedConfiguration.length>0:s.diagnostics.some(d=>/external.*hook|inherited/i.test(d))))confounders.push('Inherited optimization can contaminate this comparison.');
  const base=accountSession(baseline,settings),opt=accountSession(optimized,settings),eligible=confounders.length===0;
  const delta=(a:number|null|undefined,b:number|null|undefined)=>overlap||stale?null:difference(a,b);
  return {...input,createdAt:new Date().toISOString(),eligible,confounders:[...confounders,'Task, repository state, quality and caching are user attestations, not an independently controlled experiment.','Elapsed time includes launcher, snapshots and teardown. Optimizer overhead, retries and inference latency are unavailable unless explicitly reported.'],
    accountingEvidence:{baseline:base,optimized:opt,rates:settings.prices.filter(p=>p.model===baseline.usage?.model||p.model===optimized.usage?.model)},
    elapsedDifferenceMs:difference(baseline.elapsedMs,optimized.elapsedMs),
    usageDifference:{inputTokens:delta(baseline.usage?.inputTokens,optimized.usage?.inputTokens),outputTokens:delta(baseline.usage?.outputTokens,optimized.usage?.outputTokens),apiEstimatedUsd:delta(base.apiEstimatedUsd,opt.apiEstimatedUsd),apiEquivalentUsd:delta(base.apiEquivalentUsd,opt.apiEquivalentUsd),retries:delta(baseline.usage?.retries,optimized.usage?.retries),toolCalls:delta(baseline.usage?.toolCalls,optimized.usage?.toolCalls)},
    conclusion:eligible?'Qualified paired comparison with user-attested controls. Differences are descriptive, not proof of causal savings.':'Descriptive comparison only: unresolved controls prevent a reliable optimization-effect claim. Shared optimizer savings are never added; no causal cost claim is made. Savings per successfully completed task require passed quality checks.'};
}
