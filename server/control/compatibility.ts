import type { BillingMode, ControlAgent, Detection, OptimizerManifest } from './types.js';

/** Shared by discovery recommendations, the launch planner and UI; no execution or side effects. */
export function toolCompatibility(manifest:OptimizerManifest,detection:Detection|undefined,context:{agent:ControlAgent;billing:BillingMode;platform?:string;architecture?:string;checkService?:boolean}):string|null {
  if(manifest.mode!=='managed')return 'Guided only; no reviewed activation adapter.';
  if(!manifest.agents.includes(context.agent)||context.platform&&!manifest.platforms.includes(context.platform))return 'Not supported for this agent or operating system.';
  if(manifest.billingModes&&!manifest.billingModes.includes(context.billing))return 'Billing mode is outside this adapter’s supported interfaces.';
  if(context.architecture&&manifest.architectures&&!manifest.architectures.includes('any')&&!manifest.architectures.includes(context.architecture))return 'Not supported on this machine architecture.';
  if(!detection?.installed)return 'Not installed. Install the tool, then recheck.';
  if(!detection.compatible||detection.agentSupport?.[context.agent]===false)return 'The installed tool does not expose the required interfaces for this agent. Recheck or use a supported version.';
  if(context.checkService!==false&&manifest.id==='headroom'&&detection.serviceHealthy!==true)return 'Headroom proxy is offline or unverified. Start its local proxy, then recheck.';
  if(context.checkService!==false&&manifest.id==='headroom'&&detection.compressionEnabled===false)return 'Headroom is running with compression disabled. Enable optimization in Headroom, then recheck.';
  return null;
}
