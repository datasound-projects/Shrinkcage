import { fingerprint } from '../schema.js';
import type { BillingMode, ControlAgent, Detection, Evidence, OptimizerManifest } from '../types.js';
import type { PluginManifest, RegisteredPlugin, ValidationGate, ValidationReport } from './types.js';

export const GATE_NAMES=['Discovery','Compatibility','Security','Configuration','Integration','Runtime effectiveness','Quality and regression'] as const;
export function gate(id:ValidationGate['id'],status:ValidationGate['status'],kind:ValidationGate['kind'],reasons:string[],evidence:string[]=[]):ValidationGate{return {id,name:GATE_NAMES[id-1],status,kind,reasons,evidence,checkedAt:new Date().toISOString()};}
export function report(id:string,version:string|null,gates:ValidationGate[],context:unknown,options:{integrationRequired?:boolean;updateAvailable?:boolean;restart?:boolean;active?:boolean}={}):ValidationReport {
  const beforeActivation=gates.filter(g=>g.id<=5),canActivate=!options.integrationRequired&&!options.updateAvailable&&beforeActivation.every(g=>g.status==='passed'||g.status==='not-applicable');
  const runtime=gates.find(g=>g.id===6);let state:ValidationReport['state'];
  if(options.integrationRequired)state='integration_required';else if(options.updateAvailable)state='update_available';else if(options.restart)state='requires_restart';
  else if(gates.some(g=>g.status==='failed'&&g.id===2))state='incompatible';else if(gates.some(g=>g.status==='failed'&&g.id<6))state='validation_failed';
  else if(runtime?.status==='failed')state='degraded';else if(runtime?.status==='passed')state='verified_active';else if(options.active)state='active';else if(canActivate)state='ready_to_activate';
  else if(gates[0]?.status==='passed')state=gates[1]?.status==='passed'?'needs_configuration':'installed';else state='discovered';
  return {id,contextFingerprint:fingerprint(context),state,version,gates,canActivate,checkedAt:new Date().toISOString(),limitations:['Startup and connection do not establish token or financial savings.','Quality, request latency and optimizer overhead remain unavailable unless measured with valid controls.']};
}
export function validatePluginContext(plugin:RegisteredPlugin,context:{agent:ControlAgent;billing:BillingMode;platform?:string;architecture?:string;bindingCurrent:boolean;configurationValid:boolean;agentCompatible?:boolean;agentVersion?:string|null;evidence?:Evidence;pending?:boolean}):ValidationReport {
  const m=plugin.manifest,platform=context.platform??process.platform,architecture=context.architecture??process.arch;
  const compatible=context.agentCompatible!==false&&m.agents.includes(context.agent)&&m.billingModes.includes(context.billing)&&m.platforms.includes(platform)&&(m.architectures.includes('any')||m.architectures.includes(architecture));
  const protocol=plugin.validation.gates.find(g=>g.id===5),observed=context.evidence;
  const gates=[gate(1,context.bindingCurrent?'passed':'failed','boundary-check',[context.bindingCurrent?'Approved local installation identity matches.':'Local executable changed or disappeared; review an update before reuse.']),
    gate(2,compatible?'passed':'failed','boundary-check',[compatible?'Agent, billing, OS and architecture match the declared tested pattern.':'Agent, billing mode, OS or architecture is incompatible.']),
    gate(3,'passed','boundary-check',['Local registration was explicitly approved. Only the trusted stdio template can execute it; provider credentials are not inherited.','Approval is not a malware audit or an OS sandbox.']),
    gate(4,context.configurationValid?'passed':'failed','boundary-check',[context.configurationValid?'Typed options and process-scoped configuration are valid.':'Configuration is outside the approved schema.']),
    protocol??gate(5,'pending','unavailable',['Run an approved isolated MCP test before activation.']),
    gate(6,observed?.status==='failed'?'failed':observed?.status==='usage_observed'?'passed':'pending',observed?'session-observation':'unavailable',[observed?observed.source:'Awaiting actual session loading and successful tool activity.']),
    gate(7,'unavailable','unavailable',['Compare a baseline and reviewed optimized task; no quality or savings guarantee is inferred.'])];
  return report(m.id,plugin.binding.toolVersion,gates,{manifest:m,binding:plugin.binding.fingerprint,protocolProof:plugin.validation.contextFingerprint,context:{...context,evidence:observed?.status}}, {integrationRequired:m.template!=='mcp-stdio',updateAvailable:!context.bindingCurrent,restart:context.pending,active:observed?.status==='agent_connected'});
}
export function builtinValidation(manifest:OptimizerManifest,detection:Detection|undefined,context:{agent:ControlAgent;billing:BillingMode;agentVersion?:string|null;agentCompatible?:boolean;evidence?:Evidence}):ValidationReport {
  const executable=manifest.mode==='managed',compatible=context.agentCompatible!==false&&manifest.agents.includes(context.agent)&&manifest.platforms.includes(process.platform)&&detection?.compatible===true&&(manifest.id!=='headroom'||context.billing==='api');
  const e=context.evidence;
  return report(manifest.id,detection?.version??null,[
    gate(1,detection?.installed?'passed':'pending','native-interface',[detection?.installed?'Installed fixed-name CLI found.':'Install separately and recheck; nothing is downloaded automatically.']),
    gate(2,compatible?'passed':detection?.installed?'failed':'pending','native-interface',[compatible?'Reviewed version/interface and requested context match.':'Version, agent, OS or billing capability is not established.']),
    gate(3,executable?'passed':'pending','boundary-check',['Reviewed built-in code, fixed argument arrays, native permission policy and owned child cleanup.']),
    gate(4,manifest.id==='headroom'&&detection?.serviceHealthy!==true?'failed':executable?'passed':'pending','boundary-check',['A project-specific launch plan still checks inherited hooks, routing, dependencies and conflicts.']),
    gate(5,executable&&detection?.compatible?'passed':'pending','fixture-conformance',['Release conformance tests exercise the reviewed adapter with isolated fixtures. This is distinct from an authenticated model-backed test.']),
    gate(6,e?.status==='failed'?'failed':e?.status==='usage_observed'?'passed':'pending',e?'session-observation':'unavailable',[e?e.source:'Awaiting owned native session activation/use evidence.']),
    gate(7,'unavailable','unavailable',['Task quality and savings need a qualified paired comparison; installation is not effectiveness.'])
  ],{manifest,version:detection?.version,binary:detection?.binaryFingerprint,context},{integrationRequired:!executable,active:e?.status==='agent_connected'});
}
export function pluginCatalog(manifest:PluginManifest):OptimizerManifest{return {schemaVersion:1,id:manifest.id,name:manifest.name,source:manifest.source,layers:manifest.layers,permissions:manifest.permissions,agents:manifest.agents,platforms:manifest.platforms,minVersion:manifest.toolVersion.min,maxMajor:manifest.toolVersion.maxMajor,mechanism:'mcp',mode:manifest.template==='mcp-stdio'?'managed':'guided',dependencies:manifest.dependencies,conflicts:manifest.conflicts,exclusive:null,restartRequired:true,billingModes:manifest.billingModes,architectures:manifest.architectures,adapterVersion:manifest.version,metricSources:['Owned MCP initialization and successful tool-name/count receipts'],ownership:'Only approved Shrinkcage metadata, optional owned entry-script copy and session-owned processes. External software is preserved.',installGuidance:'Register a reviewed local installation through the CLI preview/approval flow. Imported metadata alone cannot execute code.',limitations:['Provider credentials are not inherited. Generic stdio integrations require a foreground MCP server.','No token or USD savings are inferred from successful protocol activity.']};}
