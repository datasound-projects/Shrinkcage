import type { BillingMode, ControlAgent, Detection, OptimizerManifest } from '../types.js';
import { TOOL_IDS } from '../types.js';

export function recommendStack(catalog:OptimizerManifest[],detections:Detection[],context:{agent:ControlAgent;billing:BillingMode;intent:'minimal'|'balanced'|'maximum'|'terminal'|'navigation'|'long-context'|'experimental'}){
  const reasons:{id:string;reason:string}[]=[],omitted:{id:string;reason:string}[]=[],tools:string[]=[];const seen=new Set<string>();
  const candidates=catalog.filter(m=>m.mode==='managed').sort((a,b)=>Number(!TOOL_IDS.includes(a.id as never))-Number(!TOOL_IDS.includes(b.id as never))||a.id.localeCompare(b.id));
  for(const m of candidates){const d=detections.find(d=>d.id===m.id),layers=m.layers.join(' ').toLowerCase(),registered=!TOOL_IDS.includes(m.id as never);
    let reason='';if(!m.agents.includes(context.agent)||!m.platforms.includes(process.platform))reason='Unsupported agent or operating system.';
    else if(!d?.installed||!d.compatible)reason='Installation or validation is unavailable.';
    else if(m.id==='headroom'&&(context.billing!=='api'||d.serviceHealthy!==true))reason='Requires Codex API billing and a verified existing proxy.';
    else if(m.billingModes&&!m.billingModes.includes(context.billing))reason='Billing mode is outside the adapter contract.';
    else if(registered&&context.intent!=='experimental')reason='Registered protocol support is verified; resource benefit is unmeasured. Opt in through Custom or Experimental.';
    else if(['minimal','terminal'].includes(context.intent)&&!(/output/.test(layers)&&m.mechanism==='hook'))reason='This intent prefers the reviewed terminal rewrite path.';
    else if(context.intent==='navigation'&&!/semantic|navigation|retrieval/.test(layers))reason='This intent focuses on symbol-aware navigation.';
    else if(context.intent==='long-context'&&!/context|semantic|navigation/.test(layers))reason='This intent focuses on context and retrieval capabilities.';
    const category=m.mechanism+':'+(m.layers[0]??m.id).toLowerCase();
    if(!reason&&(seen.has(category)||m.conflicts.some(id=>tools.includes(id))||m.exclusive&&tools.some(id=>catalog.find(c=>c.id===id)?.exclusive===m.exclusive)))reason='Overlaps an already selected capability or conflicts with its routing.';
    if(reason){omitted.push({id:m.id,reason});continue;}
    seen.add(category);tools.push(m.id);reasons.push({id:m.id,reason:registered?'Approved stdio plugin included for an explicit experiment; no quality or savings claim.':`Available ${m.layers.join(' / ')} capability matches this intent. Actual benefit and overhead still need measurement.`});
  }
  return {tools,reasons,omitted,limitations:['Deterministic capability selection, not a proven savings ranking.','Inherited hooks/routing, dependencies and project configuration are validated in the actual launch plan.','Maximum and Experimental stacks need baseline comparisons and quality review; no automatic changes are applied.']};
}
