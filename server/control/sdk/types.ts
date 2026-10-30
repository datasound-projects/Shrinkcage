import type { BillingMode, ControlAgent } from '../types.js';

export const PLUGIN_API_VERSION=2 as const;
export const PLUGIN_MECHANISMS=['mcp-stdio','cli-wrapper','shell-hook','context-compressor','output-filter','api-gateway','prompt-cache','semantic-retrieval','local-memory','telemetry-observer'] as const;
export type PluginMechanism=typeof PLUGIN_MECHANISMS[number];
export type PluginAction='discover'|'inspect'|'validate'|'install'|'configure'|'activate'|'verify'|'observe'|'deactivate'|'rollback'|'uninstall';
export interface PluginOption {type:'integer'|'boolean'|'enum';label:string;default:number|boolean|string;min?:number;max?:number;values?:string[]}
export type PluginArgument=string|{option:string};
export interface PluginManifest {
  schemaVersion:2;id:string;name:string;version:string;source:string;description:string;
  mechanism:PluginMechanism;template:'mcp-stdio'|'review-required';layers:string[];
  agents:ControlAgent[];platforms:string[];architectures:string[];billingModes:BillingMode[];
  permissions:('project-read'|'project-write'|'network'|'persistent-memory')[];
  arguments:PluginArgument[];configuration:Record<string,PluginOption>;
  dependencies:string[];conflicts:string[];
  toolVersion:{min:string;maxMajor:number};
}
export interface PluginBinding {
  command:string;requestedCommand:string;prefix:string[];fingerprint:string;scriptFingerprint:string|null;
  label:string;owned:boolean;ownedDirectory:string|null;toolVersion:string;
}
export interface RuntimePlugin {manifest:PluginManifest;binding:PluginBinding;configuration:Record<string,string|number|boolean|undefined>}
export type GateStatus='passed'|'failed'|'pending'|'unavailable'|'not-applicable';
export type GateKind='boundary-check'|'native-interface'|'live-protocol'|'fixture-conformance'|'session-observation'|'user-attestation'|'unavailable';
export interface ValidationGate {id:1|2|3|4|5|6|7;name:string;status:GateStatus;kind:GateKind;checkedAt:string;reasons:string[];evidence:string[]}
export type IntegrationState='discovered'|'installed'|'compatible'|'needs_configuration'|'ready_to_activate'|'active'|'verified_active'|'degraded'|'incompatible'|'validation_failed'|'requires_restart'|'update_available'|'integration_required';
export interface ValidationReport {id:string;contextFingerprint:string;state:IntegrationState;version:string|null;gates:ValidationGate[];checkedAt:string;canActivate:boolean;limitations:string[]}
export interface RegisteredPlugin {
  manifest:PluginManifest;binding:PluginBinding;registeredAt:string;approvalFingerprint:string;
  validation:ValidationReport;lifecycle?:'ready'|'removing';previous?:Omit<RegisteredPlugin,'previous'>;
}
export interface PublicPlugin {
  manifest:PluginManifest;installation:{label:string;owned:boolean;version:string;fingerprint:string};
  validation:ValidationReport;hasRollback:boolean;
}
export interface OptimizerCandidate {
  id:string;source:'github'|'local-executable'|'manifest'|'existing-mcp';name:string;url:string|null;
  description:string;mechanism:PluginMechanism|null;state:'integration_required'|'needs_configuration';
  facts:string[];missing:string[];manifest:PluginManifest|null;createdAt:string;
  validation?:ValidationReport;
}
export interface PluginLifecycle {
  apiVersion:2;actions:Partial<Record<PluginAction,{supported:boolean;approvalRequired:boolean;description:string}>>;
  discover?():Promise<unknown>;inspect?():Promise<unknown>;validate?(context:PluginOperationContext):Promise<ValidationReport>;
  install?(context:PluginOperationContext):Promise<PluginOperationResult>;
  configure?(context:PluginOperationContext):Promise<PluginOperationResult>;
  activate?(context:PluginOperationContext):Promise<PluginOperationResult>;
  verify?(context:PluginOperationContext):Promise<ValidationReport>;
  observe?(context:PluginOperationContext):Promise<PluginOperationResult>;
  deactivate?(context:PluginOperationContext):Promise<PluginOperationResult>;
  rollback?(context:PluginOperationContext):Promise<PluginOperationResult>;
  uninstall?(context:PluginOperationContext):Promise<PluginOperationResult>;
}
export interface PluginOperationContext {agent:ControlAgent;billing:BillingMode;sessionId?:string;configuration:Record<string,string|number|boolean>;approvalFingerprint?:string}
export interface PluginOperationResult {state:IntegrationState;changed:boolean;diagnostics:string[];evidence:string[];ownedResourceIds:string[]}
