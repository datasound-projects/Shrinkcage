import { BUILTIN_MANIFESTS } from './definitions.js';
import { ControlError } from '../schema.js';
import type { BillingMode, OptimizerManifest, ToolId } from '../types.js';

export interface AdapterContract {
  apiVersion: 2; adapterVersion: string; manifest: OptimizerManifest;
  billingModes: readonly BillingMode[]; activation: 'next-launch' | 'guided'; liveChanges: false;
  lifecycle: readonly ['detect','validate','plan','apply','verify','observe','undo'];
  configuration: readonly string[]; uninstall: 'owned-session-resources-only' | 'external-guidance';
}
export class OptimizerRegistry {
  private entries=new Map<string,AdapterContract>();
  constructor(manifests:OptimizerManifest[]=BUILTIN_MANIFESTS){
    for(const manifest of manifests){
      if(this.entries.has(manifest.id))throw new ControlError('Duplicate reviewed optimizer ID.');
      if(manifest.mode==='managed'&&!['rtk','serena','headroom'].includes(manifest.id))throw new ControlError('No reviewed executable adapter.');
      const freeze=(v:unknown):unknown=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
      const reviewed=freeze(structuredClone(manifest)) as OptimizerManifest;
      this.entries.set(manifest.id,Object.freeze({apiVersion:2,adapterVersion:'2.0.0',manifest:reviewed,
        billingModes:manifest.id==='headroom'?['api']:['subscription','api','hybrid','unknown'],
        activation:manifest.mode==='managed'?'next-launch':'guided',liveChanges:false,
        lifecycle:['detect','validate','plan','apply','verify','observe','undo'],
        configuration:['serena','headroom'].includes(manifest.id)?['timeoutSeconds']:[],
        uninstall:manifest.mode==='managed'?'owned-session-resources-only':'external-guidance'} as AdapterContract));
    }
  }
  list(){return [...this.entries.values()];}
  get(id:string){return this.entries.get(id);}
  validate(id:string,agent:string,billing:BillingMode){
    const entry=this.get(id);if(!entry)return ['Unknown reviewed optimizer.'];
    const errors:string[]=[];
    if(!entry.manifest.agents.includes(agent as never))errors.push('Agent is not supported by this adapter.');
    if(!entry.billingModes.includes(billing))errors.push('This adapter requires API billing; native subscription routing is preserved.');
    if(entry.activation==='guided')errors.push('Guided catalog entry; no executable adapter.');
    return errors;
  }
}
export const optimizerRegistry=new OptimizerRegistry();
export const CATALOG=optimizerRegistry.list().map(entry=>entry.manifest);
export const catalogTool=(id:ToolId)=>optimizerRegistry.get(id)!.manifest;
