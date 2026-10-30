import { ControlError } from '../schema.js';
import type { ControlPlane } from '../core.js';
import { verifyBinding } from './binding.js';
import { probeMcpPlugin } from './protocol.js';
import { gate, report } from './validation.js';
/** Only an unchanged, explicitly approved binding can be probed. Never accepts a command or path. */
async function runCheck(plane:ControlPlane,id:string){
  const plugin=plane.store.plugin(id);if(!plugin||plugin.lifecycle==='removing')throw new ControlError('Optimizer is unavailable.');
  if(!await verifyBinding(plugin.binding))throw new ControlError('Installation changed. Preview and approve an update in the terminal before execution.');
  let validation;
  try{const proof=await probeMcpPlugin(plugin.manifest,plugin.binding,{},plane.env);if(proof.version!==plugin.binding.toolVersion)throw new ControlError('Reported version changed. Review and approve an update before activation.');validation=report(id,proof.version,plugin.validation.gates.map(g=>g.id===5?gate(5,'passed','live-protocol',['Fresh isolated MCP initialize and tools/list completed.'],[`Version ${proof.version}; ${proof.toolNames.length} named tools`]):g),{manifest:plugin.manifest,binding:plugin.binding.fingerprint,proof});}
  catch(e){validation=report(id,plugin.binding.toolVersion,plugin.validation.gates.map(g=>g.id===5?gate(5,'failed','live-protocol',[e instanceof ControlError?e.message:'Protocol check failed. Private output discarded.']):g),{binding:plugin.binding.fingerprint,failed:true});}
  plane.store.putPlugin({...plugin,validation},plugin.approvalFingerprint);plane.store.putValidation(validation);plane.invalidateDiscovery();return validation;
}

const checks=new WeakMap<ControlPlane,Map<string,Promise<import('./types.js').ValidationReport>>>();
export function checkPlugin(plane:ControlPlane,id:string){
  let active=checks.get(plane);if(!active){active=new Map();checks.set(plane,active);}
  const existing=active.get(id);if(existing)return existing;
  if(active.size>=4)throw new ControlError('Other isolated checks are running. Try this tool again shortly.');
  const promise=runCheck(plane,id).finally(()=>active!.delete(id));active.set(id,promise);return promise;
}
