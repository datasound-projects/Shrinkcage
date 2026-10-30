import { parsePluginManifest, pluginConfiguration, pluginArguments } from './manifest.js';
import type { PluginAction, PluginManifest, PluginLifecycle } from './types.js';
export { parsePluginManifest, pluginConfiguration, pluginArguments } from './manifest.js';
export type * from './types.js';
export const SDK_VERSION=2;
export function assertAdapterContract(adapter:PluginLifecycle){if(adapter.apiVersion!==SDK_VERSION)throw new Error('Unsupported adapter API.');for(const [action,capability]of Object.entries(adapter.actions)){if(!['discover','inspect','validate','install','configure','activate','verify','observe','deactivate','rollback','uninstall'].includes(action))throw new Error('Unknown lifecycle action.');if(capability?.supported&&typeof adapter[action as PluginAction]!=='function')throw new Error('Declared lifecycle capability has no implementation: '+action);}return true;}
/** Public capability contract for the reviewed template, not code loaded from a manifest. */
export function adapterCapabilities(manifest:PluginManifest){
  const executable=manifest.template==='mcp-stdio';
  const actions=['discover','inspect','validate','install','configure','activate','verify','observe','deactivate','rollback','uninstall'] as PluginAction[];
  return Object.fromEntries(actions.map(action=>[action,{supported:['discover','inspect'].includes(action)||executable,approvalRequired:['install','activate','rollback','uninstall'].includes(action),description:action==='install'?'Explicit local registration; optional owned single-file copy. No package download.':action==='deactivate'?'Omit from a future session; running sessions require restart.':action==='observe'?'Session-owned MCP handshake and successful tool-name/count receipts.':action==='rollback'?'Restore retained registration only if its approved local source remains intact.':'Reviewed template operation; permissions and evidence remain separate.'}]));
}
/** Static conformance is safe for untrusted metadata. Real protocol conformance requires explicit executable approval. */
export function staticConformance(input:unknown){const manifest=parsePluginManifest(input),config=pluginConfiguration(manifest,{}),args=pluginArguments(manifest,config);return {apiVersion:SDK_VERSION,manifest,defaults:config,arguments:args,capabilities:adapterCapabilities(manifest),passed:true};}
