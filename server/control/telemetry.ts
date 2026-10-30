import type { ManagedSession, MetricObservation } from './types.js';

/** GenAI input includes cache reads/writes; output includes reasoning. Never sum these subsets. */
export function nativeMetrics(session:ManagedSession):MetricObservation[] {
  const u=session.usage,at=u?.observedAt??session.heartbeatAt;
  const rows:[string,number|null|undefined,string,MetricObservation['classification']][]=[
    ['gen_ai.usage.input_tokens',u?.inputTokens,'tokens',u?.measurement??'unavailable'],
    ['gen_ai.usage.output_tokens',u?.outputTokens,'tokens','provider-reported'],
    ['cache_read_input_tokens',u?.cachedTokens,'tokens','provider-reported'],
    ['cache_creation_input_tokens',u?.cacheWriteTokens,'tokens','provider-reported'],
    ['reasoning_output_tokens',u?.reasoningTokens,'tokens','provider-reported'],
    ['native_tool_calls',u?.toolCalls,'calls','derived'],
    ['request_retries',u?.retries,'retries','unavailable'],
    ['request_latency',u?.latencyMs,'ms','unavailable'],
    ['optimizer_overhead',null,'ms','unavailable'],
  ];
  const metrics=rows.map(([metric,number,unit,classification])=>{
    const value=u?.stale?null:number??null;
    return {metric,value,unit,classification:value===null?'unavailable' as const:classification,source:'Native session metadata',observed_at:at,scope:'process' as const,session_id:session.id,
      measurement_method:metric==='gen_ai.usage.input_tokens'&&u?.measurement==='derived'?'Claude native input + cache read + cache creation, deduplicated by message ID':'Allowlisted native record counters; cache/reasoning categories are overlapping subsets',
      confidence:value===null?'inconclusive' as const:'reported' as const,coverage:u?u.coverage+(u.stale?' · last successful sample is stale':''):'No correlated native usage',source_version:session.agentVersion,is_estimate:false};
  });
  metrics.push({metric:'managed_elapsed',value:session.elapsedMs,unit:'ms',classification:session.elapsedMs===null?'unavailable':'measured',source:'Owned launcher clock',observed_at:session.endedAt??session.heartbeatAt,scope:'process',session_id:session.id,measurement_method:'Wall time including startup, snapshots and teardown; not model request latency',confidence:session.elapsedMs===null?'inconclusive':'reported',coverage:'This owned CLI launch',source_version:session.agentVersion,is_estimate:false});
  return metrics;
}
export function updateNativeMetrics(session:ManagedSession){session.metrics=[...session.metrics.filter(m=>!['Native session metadata','Owned launcher clock'].includes(m.source)),...nativeMetrics(session)];}
