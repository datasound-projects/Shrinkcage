import { checkPlugin } from './health.js';
import { inspectGithub, inspectLocal, inspectManifestCandidate } from './discovery.js';
import { integrationProposal } from './proposal.js';
import { readBounded } from '../paths.js';
import { ControlError } from '../schema.js';
import type { ControlPlane } from '../core.js';
import { sensitiveLocation, verifyBinding } from './binding.js';
import { parsePluginManifest } from './manifest.js';
import { probeMcpPlugin } from './protocol.js';
import { publicPlugin, previewRegistration, registerPlugin, removalPreview, rollbackPreview, uninstallPlugin, rollbackPlugin, exampleFiles, type RegistrationInput } from './service.js';
import { gate, report } from './validation.js';

async function manifestFile(path:string){if(sensitiveLocation(path)||!path.endsWith('.json')||sensitiveLocation(await realpath(path)))throw new ControlError('Choose a plugin manifest JSON file outside credential directories.');const bytes=await readBounded(path,16384);if(!bytes)throw new ControlError('Plugin manifest not found.');try{return parsePluginManifest(JSON.parse(bytes.toString()));}catch(e){throw e instanceof ControlError?e:new ControlError('Plugin manifest is malformed.');}}
export async function pluginCli(plane:ControlPlane,p:string[],flags:Record<string,string|boolean>):Promise<number>{
  const allowed=['github','local','manifest','executable','script','owned-copy','approve','dry-run','json','id'];if(Object.keys(flags).some(k=>!allowed.includes(k)))throw new ControlError('Unsupported optimizer option.');
  const value=(key:string)=>{const v=flags[key];if(v===undefined)return undefined;if(typeof v!=='string')throw new ControlError('Expected an optimizer option value.');return v;};
  const output=(v:unknown)=>console.log(JSON.stringify(v,null,2)),operation=p[1],id=p[2];
  if(['register','update','add-example'].includes(operation)){
    if(p.length!==2)throw new ControlError('Registration/update identity comes from the reviewed manifest. Use --manifest FILE --executable PATH.');
    let input:RegistrationInput;
    if(operation==='add-example'){const files=exampleFiles(),manifest=await manifestFile(files.manifest);if(value('id'))manifest.id=value('id')!;input={manifest,executable:process.execPath,script:files.script,ownedCopy:true};}
    else{if(!value('manifest')||!value('executable'))throw new ControlError('Use --manifest FILE.json --executable PATH and optional --script FILE.mjs.');input={manifest:await manifestFile(value('manifest')!),executable:value('executable')!,script:value('script'),ownedCopy:flags['owned-copy']===true};if(operation==='update'&&!plane.store.plugin((input.manifest as {id:string}).id))throw new ControlError('Register this optimizer before updating it.');}
    const preview=await previewRegistration(plane,input);if(flags['dry-run']||!value('approve')){output(preview);console.error('Review the source, permissions and isolated-test scope. Repeat this exact command with --approve '+preview.fingerprint);return preview.ready?0:2;}
    output(await registerPlugin(plane,input,value('approve')!));return 0;
  }
  if(operation==='inspect-candidate'){
    const candidate=value('github')?await inspectGithub(value('github')):value('local')?await inspectLocal(value('local')):value('manifest')?inspectManifestCandidate(await manifestFile(value('manifest')!)):null;
    if(!candidate)throw new ControlError('Use --github URL, --local PATH, or --manifest FILE.json.');plane.store.putCandidate(candidate);const {localPath,...safe}=candidate as typeof candidate&{localPath?:string};output(safe);return 0;
  }
  if(operation==='proposal'){if(!id||!/^[a-z][a-z0-9-]{0,47}$/.test(id))throw new ControlError('Choose a candidate ID.');const candidate=plane.store.candidate(id);if(!candidate)throw new ControlError('Candidate not found.');output(integrationProposal(candidate));return 0;}
  if(!id||!/^[a-z][a-z0-9-]{0,47}$/.test(id))throw new ControlError('Choose a registered optimizer ID.');
  if(operation==='inspect'){const plugin=plane.store.plugin(id);if(!plugin)throw new ControlError('Optimizer is not registered.');output(publicPlugin(plugin));return 0;}
  if(operation==='check'||operation==='validate'){const validation=await checkPlugin(plane,id);output(validation);return validation.canActivate?0:2;}
  if(operation==='remove'||operation==='uninstall'){const preview=removalPreview(plane,id);if(!value('approve')||flags['dry-run']){output(preview);console.error('This removes owned integration metadata/copies and its profile references. External software survives. Repeat with --approve '+preview.fingerprint);return preview.activeReferences?2:0;}output(await uninstallPlugin(plane,id,value('approve')!));return 0;}
  if(operation==='rollback'){const preview=rollbackPreview(plane,id);if(!value('approve')||flags['dry-run']){output(preview);return 0;}output(await rollbackPlugin(plane,id,value('approve')!));return 0;}
  throw new ControlError('Use optimizer register, add-example, inspect, check, update, rollback or remove.');
}
import { realpath } from 'node:fs/promises';
