import { verifyBinding } from './binding.js';
import { pluginVersionCompatible } from './manifest.js';
import type { Detection } from '../types.js';
import type { RegisteredPlugin } from './types.js';

export async function detectPlugin(plugin:RegisteredPlugin):Promise<Detection>{
  const current=await verifyBinding(plugin.binding),compatible=current&&plugin.manifest.template==='mcp-stdio'&&plugin.validation.gates.some(g=>g.id===5&&g.status==='passed')&&pluginVersionCompatible(plugin.binding.toolVersion,plugin.manifest.toolVersion.min,plugin.manifest.toolVersion.maxMajor);
  return {id:plugin.manifest.id,installed:current,version:plugin.binding.toolVersion||null,compatible,configured:true,serviceHealthy:null,agentConnected:null,effective:null,usageObserved:null,status:current?'installed':'stale',checkedAt:new Date().toISOString(),binaryFingerprint:current?plugin.binding.fingerprint:null,
    evidence:[],diagnostics:current?['Approved local registration. Runtime activation and use still require an owned session receipt.']:['Installation changed or disappeared. Review an update and revalidate; changed code is not executed automatically.']};
}
