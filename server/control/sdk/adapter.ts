import type { ControlPlane } from '../core.js';
import type { OptimizerAdapter } from '../adapters.js';
import { ControlError } from '../schema.js';
import { runtimeEntry } from '../runtime.js';
import { detectPlugin } from './detection.js';
import { pluginCatalog, validatePluginContext } from './validation.js';
import { pluginConfiguration } from './manifest.js';
import type { RuntimePlugin } from './types.js';

/** One reviewed implementation serves any approved ID using the stdio MCP contract. No manifest loads JavaScript into the server. */
export function sdkAdapter(id:string,plane:ControlPlane,snapshot?:RuntimePlugin):OptimizerAdapter {
  const registered=plane.store.plugin(id);if(!registered)throw new ControlError('Integration required: no approved stdio registration exists.');
  const plugin=snapshot?{...registered,manifest:snapshot.manifest,binding:snapshot.binding}:registered;if(plugin.manifest.template!=='mcp-stdio')throw new ControlError('Integration required: no approved stdio template exists.');
  const manifest=pluginCatalog(plugin.manifest);
  return {manifest,detect:()=>detectPlugin(plugin),plan:plan=>plan.actions.filter(a=>a.tool===id),
    validate:context=>{
      const result=validatePluginContext(plugin,{agent:context.plan.agent,billing:context.plan.billing?.mode??'unknown',bindingCurrent:context.plan.binaryFingerprints[id]===plugin.binding.fingerprint,configurationValid:true});
      return result.canActivate?[]:result.gates.filter(g=>g.status==='failed').flatMap(g=>g.reasons).concat(result.state==='update_available'?['Revalidate the changed installation.']:[]);
    },
    async apply(context){
      if(!context.plan.ready||context.approved!==context.plan.fingerprint||!context.plan.tools.includes(id)||context.plan.binaryFingerprints[id]!==plugin.binding.fingerprint)throw new ControlError('The current approved plan does not authorize this plugin.','approval',403);
      pluginConfiguration(plugin.manifest,context.plan.toolConfig?.[id]??{});
      const entry=runtimeEntry('mcp-bridge'),name='shrinkcage_'+id.replaceAll('-','_'),args=[...entry.args,'--tool',id],overrides:string[]=[];
      if(context.plan.agent==='claude')overrides.push('--mcp-config',JSON.stringify({mcpServers:{[name]:{command:entry.command,args}}}));
      else for(const [key,value]of Object.entries({command:entry.command,args,cwd:plane.store.projectPath(context.plan.project.id),env_vars:['SHRINKCAGE_DATA_DIR','SHRINKCAGE_SESSION_ID','SHRINKCAGE_SESSION_TOKEN','SHRINKCAGE_AGENT'],startup_timeout_sec:25,tool_timeout_sec:60,required:context.plan.requiredTools?.includes(id)??false}))overrides.push('--config',`mcp_servers.${name}.${key}=${JSON.stringify(value)}`);
      return {tool:id,overrides,wrapper:false,scope:'process',ownedProcessIds:[]};
    },
    async verify(context){const events=context.events.filter(e=>e.tool===id),status=events.at(-1)?.phase==='failed'?'failed':events.some(e=>e.phase==='usage_observed')?'usage_observed':events.some(e=>e.phase==='agent_connected')?'agent_connected':'configured';return {tool:id,status,source:status==='configured'?'Approved SDK stdio configuration; runtime use not yet observed':'Owned SDK stdio protocol receipt',observedAt:events.at(-1)?.at??new Date().toISOString(),scope:'process',confidence:status==='configured'?'inconclusive':'verified',agentVersion:context.plan.agentVersion,toolVersion:plugin.binding.toolVersion,limitations:['Protocol activity is not a token, financial or quality savings measurement.','The external program is user-approved; a private HOME is not an OS sandbox.']};},
    async observe(context){const events=context.events.filter(e=>e.tool===id&&e.phase==='usage_observed');return [{metric:'successful_mcp_tool_calls',value:events.length||null,unit:'calls',source:'Owned SDK protocol receipts',observed_at:events.at(-1)?.at??new Date().toISOString(),scope:'process',session_id:context.session.id,measurement_method:'Matched successful MCP tool responses; names/counts only',confidence:events.length?'reported':'inconclusive',coverage:'This owned session and the bounded receipt stream',source_version:plugin.binding.toolVersion,is_estimate:false,classification:events.length?'measured':'unavailable'}];},
    async undo(resources){if(resources.tool!==id)throw new ControlError('Plugin resource mismatch.');return {removed:['Owned process overrides and runtime snapshots expire with the session'],preserved:['External software, global MCP settings and other sessions']};}
  };
}
