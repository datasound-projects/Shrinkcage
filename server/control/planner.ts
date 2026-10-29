import { CATALOG } from './catalog.js';
import { fingerprint } from './schema.js';
import type { AgentDetection, ConfigFacts, Detection, OptimizerManifest, OptimizationPlan, PlanAction, ProjectRef, SavedProfile, ToolId } from './types.js';

export function versionCompatible(version:string|null,min:string|null,maxMajor:number|null):boolean {
  if(!version||!min)return false;
  const parse=(s:string)=>/^\d+\.\d+\.\d+$/.test(s)?s.split('.').map(Number):null;
  const current=parse(version),floor=parse(min);if(!current||!floor)return false;
  if(maxMajor!==null&&current[0]>maxMajor)return false;
  if(current[0]===0&&current[1]!==floor[1])return false;
  for(let i=0;i<3;i++){if(current[i]>floor[i])return true;if(current[i]<floor[i])return false;}
  return true;
}

export interface GraphResult { order:string[]; errors:string[]; required:Record<string,boolean> }
export function resolveComposition(selected:{id:string;required:boolean;priority:number}[],catalog:OptimizerManifest[]):GraphResult {
  const tools=new Map(catalog.map(t=>[t.id,t]));const requirements=new Map<string,boolean>(),priorities=new Map<string,number>();const errors:string[]=[];
  const expand=(id:string,required:boolean,chain:string[])=>{
    if(chain.includes(id)){errors.push('Dependency cycle: '+[...chain,id].join(' → '));return;}
    const manifest=tools.get(id);if(!manifest){errors.push('Unknown dependency or tool: '+id);return;}
    const previous=requirements.get(id);requirements.set(id,required||previous===true);
    if(previous!==undefined&&(!required||previous))return;
    for(const dependency of [...manifest.dependencies].sort())expand(dependency,required,[...chain,id]);
  };
  for(const tool of selected){priorities.set(tool.id,tool.priority);expand(tool.id,tool.required,[]);}
  const ids=[...requirements.keys()].sort();
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
    const a=tools.get(ids[i])!,b=tools.get(ids[j])!;
    if(a.conflicts.includes(b.id)||b.conflicts.includes(a.id)||a.exclusive!==null&&a.exclusive===b.exclusive)errors.push('Conflicting tools: '+a.id+' + '+b.id);
  }
  const order:string[]=[],visited=new Set<string>();
  const visit=(id:string)=>{if(visited.has(id))return;visited.add(id);for(const d of [...tools.get(id)!.dependencies].sort())if(requirements.has(d))visit(d);order.push(id);};
  for(const id of ids.sort((a,b)=>(priorities.get(b)??0)-(priorities.get(a)??0)||a.localeCompare(b,'en')))visit(id);
  return {order,errors:[...new Set(errors)].sort(),required:Object.fromEntries(requirements)};
}

export interface PlannerInput { profile:SavedProfile; project:ProjectRef; agent:AgentDetection; detections:Detection[]; config:ConfigFacts; platform:string; catalog?:OptimizerManifest[] }
export function composePlan(input:PlannerInput):OptimizationPlan {
  const {profile:save,project,agent,config,platform}=input;const profile=save.profile,catalog=input.catalog??CATALOG;
  const graph=resolveComposition(profile.tools,catalog),errors=[...graph.errors,...config.errors],warnings=[...config.baselineConfounders];
  const tools:ToolId[]=[],omitted:{id:string;reason:string}[]=[];const detections=new Map(input.detections.map(d=>[d.id,d]));
  if(agent.id!==profile.agent)errors.push('Profile agent does not match the requested agent.');
  if(agent.id!=='codex')errors.push('Managed runs currently support Codex only. Other agents remain available for read-only monitoring.');
  if(!agent.installed)errors.push('Codex was not found on PATH.');
  if(!agent.compatible)errors.push('This Codex version or its process-scoped interfaces are not supported.');
  for(const toolId of graph.order){
    const manifest=catalog.find(t=>t.id===toolId)!,d=detections.get(toolId as ToolId);
    let reason='';
    if(manifest.mode!=='managed')reason='Guided only; no reviewed activation adapter.';
    else if(!manifest.agents.includes(agent.id)||!manifest.platforms.includes(platform))reason='Unsupported agent or operating system.';
    else if(!d?.installed)reason='Tool is missing from PATH.';
    else if(!d.compatible)reason='Installed version or command interfaces are unsupported.';
    else if(toolId==='rtk'&&config.hooksDisabled)reason='Codex hooks are disabled by existing configuration; Shrinkcage will not override that policy.';
    else if(toolId==='rtk'&&config.rtkHooks===0)reason='Native RTK hook is not configured. Preview shrinkcage tool setup rtk first.';
    else if(toolId==='serena'&&config.serenaEntries>0&&!(config.serenaEntries===1&&config.replaceSerenaEntry))reason='External Serena MCP aliases cannot be safely shadowed. Existing entries remain unchanged; inspect this setup first.';
    else if(toolId==='headroom'&&(config.headroomEntries??0)>0&&!(config.headroomEntries===1&&config.replaceHeadroomEntry))reason='External Headroom MCP aliases cannot be safely shadowed. Existing entries remain unchanged; inspect this setup first.';
    else if(toolId==='headroom'&&d.serviceHealthy!==true)reason='No verified Headroom proxy on its configured loopback port. Start it separately; Shrinkcage does not take ownership.';
    else if(manifest.dependencies.some(id=>!tools.includes(id as ToolId)))reason='A dependency could not be activated.';
    if(reason){omitted.push({id:toolId,reason});if(graph.required[toolId]||profile.fallback==='block')errors.push(toolId+': '+reason);else warnings.push(toolId+' omitted: '+reason);}
    else tools.push(toolId as ToolId);
  }
  if(tools.includes('rtk')&&config.rtkHooks>1)errors.push('Duplicate RTK hook sources were detected; resolve them without deleting unrelated hooks.');
  if(config.headroomHooks>0)warnings.push('External Headroom lifecycle hooks remain in effect and may start or reconfigure services outside this managed plan. The scoped wrapper performs no RTK setup.');
  if(config.memoryHooks>0)warnings.push('External memory hooks can capture content and affect latency. Shrinkcage does not manage or disable them.');
  if((tools.includes('serena')||tools.includes('headroom'))&&config.reservedMcp)errors.push('The reserved Shrinkcage MCP namespace is already configured outside this plan.');
  if(tools.includes('rtk'))warnings.push('RTK project hooks require Codex trust review (/hooks). They are configured, not effective, until a managed hook receipt is observed.');
  if(tools.length)warnings.push('Managed optimizer runs use Codex embedded mode, without its shared background server, so per-process configuration and receipt ownership stay isolated. Existing approval, sandbox, model and effort policies are preserved.');
  if(tools.includes('serena'))warnings.push('Serena can read/index the approved project and create its own project metadata. Only MCP names and call counts are retained by Shrinkcage.');
  if(tools.includes('headroom'))warnings.push('Headroom reuses an external proxy. Proxy totals are shared and cannot be attributed to this session. No RTK, memory or global MCP setup is performed by the wrapper.');
  const shadowedMcp:('serena'|'headroom')[]=[];
  if(tools.includes('serena')&&config.serenaEntries===1&&config.replaceSerenaEntry)shadowedMcp.push('serena');
  if(tools.includes('headroom')&&config.headroomEntries===1&&config.replaceHeadroomEntry)shadowedMcp.push('headroom');
  for(const name of shadowedMcp)warnings.push(`The existing ${name} MCP entry is disabled only for this new process and replaced by a dedicated managed relay. Its saved config and other running sessions are unchanged.`);
  if(profile.id==='baseline')warnings.push('Baseline means no managed optimizers; existing global/project hooks, MCP servers or provider routing may still affect this run.');
  const actions:PlanAction[]=[];
  for(const tool of tools){const m=catalog.find(t=>t.id===tool)!;for(const phase of ['preflight','activate','verify','cleanup'] as const){
    const descriptions={preflight:'Recheck version, approved configuration and dependencies.',activate:tool==='rtk'?'Reuse the reviewed native RTK hook; do not replace global rules.':tool==='serena'?'Pass a dedicated stdio MCP relay through Codex CLI overrides.':'Use the scoped Headroom wrapper with an existing verified proxy and a retrieval MCP relay.',verify:'Report configuration first; promote connection and usage only on owned protocol receipts.',cleanup:'Close owned relays with the CLI. Never stop external services or remove externally installed tools.'};
    actions.push({id:tool+'-'+phase,tool,phase,scope:tool==='rtk'?'project':'process',description:descriptions[phase]+(phase==='activate'&&shadowedMcp.includes(tool as 'serena'|'headroom')?' The existing same-name MCP entry is shadowed only in this process.':''),permissions:m.permissions,resources:tool==='rtk'?['.codex/hooks.json']:tool==='headroom'?['external:127.0.0.1:'+(detections.get('headroom')?.endpointPort??8787),'session:retrieval-mcp']:['session:serena-mcp']});
  }}
  const phaseOrder=['preflight','activate','verify','cleanup'];actions.sort((a,b)=>phaseOrder.indexOf(a.phase)-phaseOrder.indexOf(b.phase));
  const headroomPort=tools.includes('headroom')?detections.get('headroom')?.endpointPort??8787:null;
  const facts={schemaVersion:1,profile:save,project,agent,tools,omitted,config:{...config,errors:[...config.errors].sort()},platform,headroomPort,binaries:input.detections.map(d=>({id:d.id,version:d.version,binary:d.binaryFingerprint,compatible:d.compatible,healthy:d.id==='headroom'?d.serviceHealthy:null})).sort((a,b)=>a.id.localeCompare(b.id,'en'))};
  const hash=fingerprint(facts);const unique=(values:string[])=>[...new Set(values)].sort();
  const binaryFingerprints=Object.fromEntries([[agent.id,agent.binaryFingerprint],...input.detections.filter(d=>tools.includes(d.id)).map(d=>[d.id,d.binaryFingerprint])]);
  return {schemaVersion:1,fingerprint:hash,agent:agent.id,agentVersion:agent.version,profile:profile.id,profileRevision:save.revision,project,scope:profile.scope,tools,omitted,actions,errors:unique(errors),warnings:unique(warnings),ready:errors.length===0,evidence:input.detections.filter(d=>tools.includes(d.id)).flatMap(d=>d.evidence),configDigests:config.digests,launchCommand:`shrinkcage run ${agent.id} --profile ${profile.id} --project-id ${project.id} --approve ${hash}`,approvalRequired:true,headroomPort,binaryFingerprints,shadowedMcp};
}
