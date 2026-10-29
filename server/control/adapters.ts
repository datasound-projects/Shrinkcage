import type { ControlPlane } from './core.js';
import { catalogTool } from './catalog.js';
import { ControlError } from './schema.js';
import { detectTool } from './probe.js';
import { runtimeEntry, type ReceiptEvent } from './runtime.js';
import type { Detection,Evidence,ManagedSession,MetricObservation,OptimizationPlan,OptimizerManifest,ToolId } from './types.js';

export interface AppliedResources {tool:ToolId;overrides:string[];wrapper:boolean;scope:'process'|'project';ownedProcessIds:never[]}
export interface AdapterContext {plane:ControlPlane;plan:OptimizationPlan;approved:string;session:ManagedSession;events:ReceiptEvent[]}
export interface OptimizerAdapter {
  manifest:OptimizerManifest;
  detect(env?:NodeJS.ProcessEnv):Promise<Detection>;
  plan(plan:OptimizationPlan):OptimizationPlan['actions'];
  apply(context:AdapterContext):Promise<AppliedResources>;
  verify(context:AdapterContext):Promise<Evidence>;
  observe(context:AdapterContext):Promise<MetricObservation[]>;
  undo(resources:AppliedResources):Promise<{removed:string[];preserved:string[]}>;
}
export function adapter(id:ToolId):OptimizerAdapter {
  const manifest=catalogTool(id);if(!manifest||manifest.mode!=='managed')throw new ControlError('No trusted execution adapter exists for this tool.');
  return {
    manifest,detect:env=>detectTool(id,env),plan:plan=>plan.actions.filter(a=>a.tool===id),
    async apply(context){
      if(!context.plan.ready||context.approved!==context.plan.fingerprint||!context.plan.tools.includes(id))throw new ControlError('The approved plan does not authorize this adapter.','approval',403);
      const overrides:string[]=[];
      if(context.plan.shadowedMcp.includes(id as 'serena'|'headroom'))overrides.push('--config',`mcp_servers.${id}.enabled=false`);
      if(id!=='rtk'){
        const entry=runtimeEntry('mcp-bridge'),name=id==='serena'?'shrinkcage_serena':'shrinkcage_headroom';
        const config:Record<string,unknown>={command:entry.command,args:[...entry.args,'--tool',id],cwd:context.plane.store.projectPath(context.plan.project.id),env_vars:['SHRINKCAGE_DATA_DIR','SHRINKCAGE_SESSION_ID','SHRINKCAGE_SESSION_TOKEN','SHRINKCAGE_HEADROOM_PORT'],startup_timeout_sec:25,tool_timeout_sec:60,required:true};
        for(const [key,value] of Object.entries(config))overrides.push('--config',`mcp_servers.${name}.${key}=${JSON.stringify(value)}`);
      }
      return {tool:id,overrides,wrapper:id==='headroom',scope:id==='rtk'?'project':'process',ownedProcessIds:[]};
    },
    async verify(context){
      const events=context.events.filter(e=>e.tool===id);const status=events.at(-1)?.phase==='failed'?'failed':events.some(e=>e.phase==='usage_observed')?'usage_observed':events.some(e=>e.phase==='agent_connected')?'agent_connected':'configured';
      return {tool:id,status,source:status==='configured'?'Approved process configuration; connection not yet observed':'Owned native hook or MCP protocol relay receipt',observedAt:events.at(-1)?.at??new Date().toISOString(),scope:id==='rtk'?'project':'process',confidence:status==='configured'?'inconclusive':'verified',agentVersion:context.plan.agentVersion,toolVersion:context.session.evidence.find(e=>e.tool===id)?.toolVersion??null,limitations:id==='rtk'?['A native rewrite receipt proves hook activity; shared estimated savings are not session savings.']:['MCP connection and successful tool calls are observed; token savings are not inferred.']};
    },
    async observe(context){const events=context.events.filter(e=>e.tool===id&&e.phase==='usage_observed');return [{metric:id==='rtk'?'native_hook_rewrites':'successful_mcp_tool_calls',value:events.length?events.length:null,unit:'calls',source:'Owned managed-session receipts',observed_at:events.at(-1)?.at??new Date().toISOString(),scope:'process',session_id:context.session.id,measurement_method:'Successful native rewrite or MCP response metadata only',confidence:events.length?'reported':'inconclusive',coverage:'Bounded managed receipt stream; external and later unobserved activity is excluded',source_version:context.session.evidence.find(e=>e.tool===id)?.toolVersion??null,is_estimate:false}];},
    async undo(resources){if(resources.tool!==id)throw new ControlError('Adapter resource mismatch.');return {removed:['process-scoped overrides expire with the CLI'],preserved:id==='rtk'?['Explicit persistent project setup; undo through its separate approved receipt']:['External services and installed executables']};},
  };
}
