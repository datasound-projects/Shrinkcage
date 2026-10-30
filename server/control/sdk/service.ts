import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rename, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ControlError, digest, fingerprint } from '../schema.js';
import { readBounded, sameOpenedFile } from '../paths.js';
import type { ControlPlane } from '../core.js';
import { inspectBinding, verifyBinding } from './binding.js';
import { parsePluginManifest, pluginArguments } from './manifest.js';
import { probeMcpPlugin } from './protocol.js';
import { gate, report } from './validation.js';
import type { PluginBinding, PluginManifest, PublicPlugin, RegisteredPlugin, ValidationReport } from './types.js';

export interface RegistrationInput {manifest:unknown;executable:string;script?:string;ownedCopy?:boolean}
export interface RegistrationPreview {fingerprint:string;id:string;name:string;executable:string;source:string;permissions:string[];ownedCopy:boolean;alreadyRegistered:boolean;ready:boolean;errors:string[];warnings:string[]}
export function publicPlugin(p:RegisteredPlugin):PublicPlugin{return {manifest:p.manifest,installation:{label:p.binding.label,owned:p.binding.owned,version:p.binding.toolVersion,fingerprint:p.binding.fingerprint},validation:p.validation,hasRollback:!!p.previous};}
async function approvedInputs(plane:ControlPlane,input:RegistrationInput){const manifest=parsePluginManifest(input.manifest),binding=await inspectBinding({executable:input.executable,script:input.script},plane.env),current=plane.store.plugin(manifest.id);return {manifest,binding,current};}
export async function previewRegistration(plane:ControlPlane,input:RegistrationInput):Promise<RegistrationPreview>{
  const {manifest,binding,current}=await approvedInputs(plane,input),errors:string[]=[];
  if(plane.store.extensions().some(value=>(value as {id?:unknown})?.id===manifest.id))errors.push('A guided entry already uses this ID. Remove its metadata before registering an executable plugin.');
  if(manifest.template!=='mcp-stdio')errors.push('Integration required. This mechanism has no reviewed executable template; generate a proposal instead.');
  if(!manifest.platforms.includes(process.platform)||!manifest.architectures.includes('any')&&!manifest.architectures.includes(process.arch))errors.push('This platform or architecture is unsupported by the manifest.');
  if(input.ownedCopy&&!binding.scriptFingerprint)errors.push('Owned installation supports reviewed single-file Node entry scripts only. External native installations are preserved.');
  const alreadyRegistered=!!current&&current.validation.gates.find(g=>g.id===5)?.status==='passed'&&fingerprint(current.manifest)===fingerprint(manifest)&&current.binding.scriptFingerprint===binding.scriptFingerprint&&await verifyBinding(current.binding)&&(!input.ownedCopy?current.binding.fingerprint===binding.fingerprint:current.binding.owned);
  return {id:manifest.id,name:manifest.name,executable:binding.label,source:manifest.source,permissions:manifest.permissions,ownedCopy:!!input.ownedCopy,alreadyRegistered,ready:errors.length===0,errors,
    fingerprint:fingerprint({operation:'register-plugin-v2',manifest,binding:binding.fingerprint,ownedCopy:!!input.ownedCopy,current:current?.approvalFingerprint??null}),warnings:[
      'Approval executes this installed local program in a temporary workspace to verify its MCP protocol. It does not fetch or execute GitHub code.',
      'The validation environment has private HOME and no provider credentials. This is not an OS sandbox or an independent code audit.',
      'Review the program source and declared permissions. External programs remain owned by you; only an explicit owned script copy is installed by Shrinkcage.',
      'Actual session activation, tool activity, quality and savings are separate evidence. No running CLI is changed.',
    ]};
}
async function ownedRoot(plane:ControlPlane,id:string){const root=resolve(plane.canonicalDataDir,'control','plugins');await mkdir(root,{recursive:true,mode:0o700});if((await lstat(root)).isSymbolicLink()||await realpath(root)!==root)throw new ControlError('Unsafe owned-plugin directory.');const directory=join(root,id);await mkdir(directory,{recursive:true,mode:0o700});if((await lstat(directory)).isSymbolicLink()||await realpath(directory)!==directory)throw new ControlError('Unsafe plugin installation namespace.');return directory;}
async function copyOwned(plane:ControlPlane,manifest:PluginManifest,binding:PluginBinding):Promise<{binding:PluginBinding;created:boolean}>{
  if(!binding.prefix[0]||!binding.scriptFingerprint)throw new ControlError('Owned copy requires a reviewed Node entry script.');
  const bytes=await readBounded(binding.prefix[0],16*1024*1024);if(!bytes||digest(bytes)!==binding.scriptFingerprint)throw new ControlError('Entry script changed after preview.');
  const parent=await ownedRoot(plane,manifest.id),key=fingerprint({manifest,script:binding.scriptFingerprint}),directory=join(parent,key),entry=join(directory,'entry.mjs');let created=false;
  try{await mkdir(directory,{mode:0o700});created=true;}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
  if(created){
    const marker={schemaVersion:2,id:manifest.id,entryHash:binding.scriptFingerprint,manifestHash:fingerprint(manifest)};
    for(const [name,value]of [['entry.mjs',bytes],['ownership.json',Buffer.from(JSON.stringify(marker))]] as const){const h=await open(join(directory,name),constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);try{await h.writeFile(value);await h.sync();}finally{await h.close();}}
  }else{
    if((await lstat(directory)).isSymbolicLink()||await realpath(directory)!==directory)throw new ControlError('Unsafe existing owned copy.');
    const marker=JSON.parse((await readBounded(join(directory,'ownership.json'),2048))?.toString()||'null'),content=await readBounded(entry,16*1024*1024);
    if(marker?.id!==manifest.id||marker.entryHash!==binding.scriptFingerprint||marker.manifestHash!==fingerprint(manifest)||!content||digest(content)!==binding.scriptFingerprint)throw new ControlError('Existing owned copy changed. It was preserved for review.');
  }
  const installed=await inspectBinding({executable:process.execPath,script:entry},plane.env);return {binding:{...installed,owned:true,ownedDirectory:directory},created};
}
async function removeOwnedVersion(plane:ControlPlane,id:string,directory:string){
  const parent=await ownedRoot(plane,id);if(resolve(directory)!==directory||basename(directory).length!==64||join(parent,basename(directory))!==directory)throw new ControlError('Owned installation escaped its receipt.');
  const before=await lstat(directory,{bigint:true});if(before.isSymbolicLink()||!before.isDirectory()||await realpath(directory)!==directory)throw new ControlError('Owned installation changed; cleanup was stopped.');
  const quarantine=join(parent,'.remove-'+randomUUID());await rename(directory,quarantine);
  try{
    const after=await lstat(quarantine,{bigint:true});if(after.isSymbolicLink()||!sameOpenedFile(before,after)||await realpath(quarantine)!==quarantine)throw new ControlError('Owned directory identity changed.');
    const files=await readdir(quarantine);if(files.some(f=>!['entry.mjs','ownership.json'].includes(f)))throw new ControlError('Unrecognized files were added to the owned directory. Nothing was deleted.');
    const marker=JSON.parse((await readBounded(join(quarantine,'ownership.json'),2048))?.toString()||'null'),bytes=await readBounded(join(quarantine,'entry.mjs'),16*1024*1024);
    if(marker?.id!==id||!bytes||digest(bytes)!==marker.entryHash)throw new ControlError('Owned script differs from its receipt. Nothing was deleted.');
    await rm(quarantine,{recursive:true});
  }catch(e){await rename(quarantine,directory).catch(()=>{});throw e;}
}
export async function registerPlugin(plane:ControlPlane,input:RegistrationInput,approved:string):Promise<PublicPlugin>{
  const preview=await previewRegistration(plane,input);if(!preview.ready)throw new ControlError(preview.errors.join(' '));if(preview.fingerprint!==approved)throw new ControlError('Plugin approval is stale. Review the current preview.','approval',409);
  const {manifest,binding:source,current}=await approvedInputs(plane,input);if(!await verifyBinding(source))throw new ControlError('Executable changed during registration.');
  if(current?.lifecycle==='removing'||fingerprint({operation:'register-plugin-v2',manifest,binding:source.fingerprint,ownedCopy:!!input.ownedCopy,current:current?.approvalFingerprint??null})!==approved)throw new ControlError('Source or registration changed during approval. Review a fresh preview.','approval',409);
  if(preview.alreadyRegistered)return publicPlugin(current!);
  let binding=source,created=false;
  try{
    if(input.ownedCopy){const installed=await copyOwned(plane,manifest,source);binding=installed.binding;created=installed.created;}
    const proof=await probeMcpPlugin(manifest,binding,{},plane.env);binding={...binding,toolVersion:proof.version};
    const gates=[gate(1,'passed','boundary-check',['Approved local executable and optional entry-script identity.']),gate(2,'passed','live-protocol',['Reported tool version is within the declared boundary.','Agent, OS, architecture and billing are checked again per launch.']),gate(3,'passed','boundary-check',['Explicit registration approval; fixed stdio template; no provider credentials inherited.']),gate(4,'passed','boundary-check',['Strict manifest and typed default configuration.']),gate(5,'passed','live-protocol',['Isolated initialize / initialized / tools/list completed.',...proof.limitations],[`MCP ${proof.protocolVersion}; ${proof.toolNames.length} named tools; version ${proof.version}`]),gate(6,'pending','unavailable',['Actual session loading and tool use have not been observed.']),gate(7,'unavailable','unavailable',['Task quality and resource benefit are not established by a handshake.'])];
    const validation=report(manifest.id,proof.version,gates,{manifest,binding:binding.fingerprint});
    const plugin:RegisteredPlugin={manifest,binding,registeredAt:new Date().toISOString(),approvalFingerprint:approved,validation,...(current?{previous:((({previous:ignored,...value})=>value)(current))}:{})};
    plane.store.putPlugin(plugin,current?.approvalFingerprint??null);plane.store.putValidation(validation);plane.invalidateDiscovery();return publicPlugin(plugin);
  }catch(e){
    const message=e instanceof ControlError?e.message:'Isolated plugin validation failed. Private program output was discarded.';
    const validation=report(manifest.id,null,[gate(1,'passed','boundary-check',['Local program was approved.']),gate(2,'pending','unavailable',['Compatibility needs a successful protocol test.']),gate(3,'passed','boundary-check',['Credential-free temporary environment used.']),gate(4,'passed','boundary-check',['Manifest was validated.']),gate(5,'failed','live-protocol',[message]),gate(6,'pending','unavailable',['Not activated.']),gate(7,'unavailable','unavailable',['Not measured.'])],{manifest,binding:binding.fingerprint,failure:message});
    plane.store.putValidation(validation);plane.store.putCandidate({id:'failed-'+digest(manifest.id).slice(0,20),source:'manifest',name:manifest.name,url:manifest.source,description:manifest.description,mechanism:manifest.mechanism,state:'needs_configuration',facts:['The previous registration, if any, was preserved.'],missing:[message],manifest,createdAt:new Date().toISOString(),validation});
    if(created&&binding.ownedDirectory)await removeOwnedVersion(plane,manifest.id,binding.ownedDirectory).catch(()=>{});
    throw new ControlError(message);
  }
}
async function runtimeReferences(plane:ControlPlane,id:string):Promise<boolean>{
  const root=join(plane.canonicalDataDir,'control','runtime');for(const directory of await readdir(root).catch(()=>[])){if(!/^[a-f0-9-]{36}$/.test(directory))continue;try{const owner=JSON.parse((await readBounded(join(root,directory,'owner.json'),65536))?.toString()||'null');if(owner?.tools?.includes(id))return true;}catch{return true;}}return false;
}
export function removalPreview(plane:ControlPlane,id:string){const p=plane.store.plugin(id);if(!p)throw new ControlError('Optimizer is not registered.');return {id,fingerprint:fingerprint({operation:'remove-plugin-v2',id,approval:p.approvalFingerprint,profiles:plane.store.pluginProfileReferences(id)}),affectedProfiles:plane.store.pluginProfileReferences(id),owned:p.binding.owned,externalSoftwarePreserved:true,activeReferences:plane.store.pluginActiveReferences(id)};}
export async function uninstallPlugin(plane:ControlPlane,id:string,approved:string){
  const preview=removalPreview(plane,id);if(preview.fingerprint!==approved)throw new ControlError('Removal approval is stale.','approval',409);
  if(preview.activeReferences||await runtimeReferences(plane,id))throw new ControlError('A current or recovering session references this optimizer. Finish that session before removal.');
  const p=plane.store.plugin(id)!;plane.store.setPluginRemoving(id,p.approvalFingerprint,true);
  const moved:{from:string;to:string}[]=[];let removed=false;
  try{
    if(await runtimeReferences(plane,id))throw new ControlError('A recovering session still references this optimizer.');
    if(p.binding.owned||p.previous?.binding.owned){
      const root=await ownedRoot(plane,id);
      for(const name of await readdir(root)){
        if(!/^[a-f0-9]{64}$/.test(name))throw new ControlError('An unrecognized installation entry was preserved. Inspect it before retrying.');
        const from=join(root,name),before=await lstat(from,{bigint:true});
        if(before.isSymbolicLink()||!before.isDirectory()||await realpath(from)!==from)throw new ControlError('Owned installation identity changed.');
        const to=join(root,'.remove-'+randomUUID());await rename(from,to);moved.push({from,to});
        if(!sameOpenedFile(before,await lstat(to,{bigint:true}))||await realpath(to)!==to)throw new ControlError('Owned installation identity changed.');
        const files=await readdir(to);if(files.length!==2||files.some(f=>!['entry.mjs','ownership.json'].includes(f)))throw new ControlError('Unrecognized files were preserved. No installation was removed.');
        const marker=JSON.parse((await readBounded(join(to,'ownership.json'),4096))?.toString()||'null'),bytes=await readBounded(join(to,'entry.mjs'),16*1024*1024);
        if(marker?.schemaVersion!==2||marker.id!==id||!bytes||digest(bytes)!==marker.entryHash)throw new ControlError('Owned receipt changed. Files were preserved.');
      }
    }
    plane.store.removePlugin(id,p.approvalFingerprint,preview.affectedProfiles);removed=true;let cleanupPending=false;
    for(const entry of moved)try{await rm(entry.to,{recursive:true});}catch{cleanupPending=true;}
    plane.invalidateDiscovery();return {removed:true,externalSoftwarePreserved:true,cleanupPending};
  }catch(e){if(!removed){for(const entry of moved.reverse())await rename(entry.to,entry.from).catch(()=>{});plane.store.setPluginRemoving(id,p.approvalFingerprint,false);}throw e;}
}
export function rollbackPreview(plane:ControlPlane,id:string){const p=plane.store.plugin(id);if(!p?.previous)throw new ControlError('No retained rollback registration is available.');return {id,fingerprint:fingerprint({operation:'rollback-plugin-v2',current:p.approvalFingerprint,previous:p.previous.approvalFingerprint}),version:p.previous.binding.toolVersion,owned:p.previous.binding.owned};}
export async function rollbackPlugin(plane:ControlPlane,id:string,approved:string){const preview=rollbackPreview(plane,id);if(preview.fingerprint!==approved)throw new ControlError('Rollback approval is stale.','approval',409);const p=plane.store.plugin(id)!,previous=p.previous!;if(!await verifyBinding(previous.binding))throw new ControlError('The previous external executable changed. Restore it outside Shrinkcage and revalidate; external software is never overwritten.');await probeMcpPlugin(previous.manifest,previous.binding,{},plane.env);const restored={...previous,previous:((({previous,...value})=>value)(p))};plane.store.putPlugin(restored,p.approvalFingerprint);plane.invalidateDiscovery();return publicPlugin(restored);}
export function exampleFiles(){const base=import.meta.url.endsWith('.ts')?'../../../':'../../../../';return {manifest:fileURLToPath(new URL(base+'sdk/examples/line-window/manifest.json',import.meta.url)),script:fileURLToPath(new URL(base+'sdk/examples/line-window/server.mjs',import.meta.url))};}
