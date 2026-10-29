import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, readFile, rename, rm, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ControlError, digest, fingerprint, stable } from './schema.js';
import { directoryIdentity, guardedFile, readBounded, type ProjectFile } from './paths.js';
import type { ControlStore } from './store.js';
import type { ProjectRef, SetupPreview, SetupReceipt } from './types.js';

const hash=(value:Buffer|null)=>value===null?'absent':digest(value);
const hookSource=fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'../../bin/rtk-hook.mjs':'../../../bin/rtk-hook.mjs',import.meta.url));
const quote=(s:string)=>process.platform==='win32'?`"${s.replace(/"/g,'')}"`:`'${s.replace(/'/g,"'\\''")}'`;
export const nativeHookCommand=(root:string)=>quote(process.execPath)+' '+quote(join(root,'.codex','shrinkcage-rtk.mjs'));
type Change={path:ProjectFile;before:Buffer|null;after:Buffer;beforeHash:string;afterHash:string};
function hookEntries(value:unknown):Record<string,unknown>[] {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ControlError('The project hook configuration must be a JSON object.');
  const data=value as {hooks?:{PreToolUse?:unknown}};
  if(data.hooks!==undefined&&(!data.hooks||typeof data.hooks!=='object'||Array.isArray(data.hooks)))throw new ControlError('Invalid project hooks table.');
  const entries=data.hooks?.PreToolUse;if(entries!==undefined&&!Array.isArray(entries))throw new ControlError('Invalid PreToolUse hook list.');
  if(Array.isArray(entries)&&entries.some(g=>!g||typeof g!=='object'||Array.isArray(g)||!Array.isArray(g.hooks)||g.hooks.some((h:unknown)=>!h||typeof h!=='object'||Array.isArray(h))))throw new ControlError('Invalid hook group or hook definition.');
  return (entries??[]) as Record<string,unknown>[];
}
function hasRtk(value:unknown){return hookEntries(value).some(group=>Array.isArray(group?.hooks)&&group.hooks.some((h:unknown)=>!!h&&typeof h==='object'&&typeof (h as {command?:unknown}).command==='string'&&/\brtk\b|shrinkcage-rtk\.mjs/.test((h as {command:string}).command)));}

export async function rtkChanges(root:string,owned:SetupReceipt|undefined):Promise<Change[]>{
  const hooksPath=await guardedFile(root,'.codex/hooks.json'),shimPath=await guardedFile(root,'.codex/shrinkcage-rtk.mjs');
  const before=await readBounded(hooksPath),shim=await readBounded(shimPath);let data:Record<string,unknown>;
  try{data=before?JSON.parse(before.toString('utf8')):{};hookEntries(data);}catch(e){if(e instanceof ControlError)throw e;throw new ControlError('Project hooks JSON is malformed. No files were changed.');}
  if(owned?.status==='preparing')throw new ControlError('An interrupted setup needs recovery before another setup.');
  if(owned?.status==='applied'){
    if(owned.files.some(f=>f.afterHash!==(f.path.endsWith('.mjs')?hash(shim):hash(before))))throw new ControlError('Owned hook files changed. Preview undo/recovery instead of overwriting them.');
    return [];
  }
  if(shim!==null||hasRtk(data))throw new ControlError('RTK or the reserved hook file is already present and unowned. Reuse or inspect it; no takeover is allowed.');
  const existing=(data.hooks??{}) as Record<string,unknown>;const groups=hookEntries(data);
  const next={...data,hooks:{...existing,PreToolUse:[...groups,{matcher:'Bash',hooks:[{type:'command',command:nativeHookCommand(root),timeout:8,statusMessage:'Shrinkcage RTK'}]}]}};
  const after=Buffer.from(JSON.stringify(next,null,2)+'\n'),source=await readFile(hookSource);
  if(after.length>262144)throw new ControlError('The merged hook configuration exceeds the safe size limit.');
  return [{path:'.codex/shrinkcage-rtk.mjs',before:shim,after:source,beforeHash:hash(shim),afterHash:digest(source)},{path:'.codex/hooks.json',before,after,beforeHash:hash(before),afterHash:digest(after)}];
}
export async function previewSetup(root:string,project:ProjectRef,store:ControlStore):Promise<{preview:SetupPreview;changes:Change[]}>{
  const owned=store.receipts().find(r=>r.projectId===project.id&&r.tool==='rtk'&&r.status!=='undone');let changes:Change[]=[],errors:string[]=[];
  try{changes=await rtkChanges(root,owned);}catch(e){errors=[e instanceof ControlError?e.message:'Project hook inspection failed.'];}
  const files=changes.map(c=>({path:c.path,beforeHash:c.beforeHash,afterHash:c.afterHash,change:(c.before===null?'create':c.beforeHash===c.afterHash?'unchanged':'update') as 'create'|'update'|'unchanged'}));
  const facts={tool:'rtk',operation:'setup',project,files,errors};
  return {preview:{tool:'rtk',operation:'setup',fingerprint:fingerprint(facts),project,scope:'project',files,errors,ready:errors.length===0,warnings:['Persistent project hook registration. Review/trust the hook in Codex /hooks before use.','Only .codex/hooks.json and the reviewed native RTK shim are changed. Existing rules, MCP entries and global configuration are preserved.','The shim delegates to rtk hook codex and records names/counts only for owned managed sessions.']},changes};
}

async function projectLock(root:string,projectId:string,store:ControlStore):Promise<()=>Promise<void>>{
  await guardedFile(root,'.codex/hooks.json');const dir=join(root,'.codex');await mkdir(dir,{recursive:true,mode:0o700});await guardedFile(root,'.codex/hooks.json');
  const path=join(dir,'.shrinkcage-control.lock'),token=randomUUID();let handle;
  for(let i=0;i<250;i++){
    await guardedFile(root,'.codex/hooks.json');let reserved=false;const proof=store.lockProof(projectId);
    if(proof){let dead=false;try{process.kill(proof.pid,0);}catch(e){dead=(e as NodeJS.ErrnoException).code==='ESRCH';}
      if(dead&&store.reclaimLock(projectId,proof.token,token)){reserved=true;try{const existing=await readBounded(path,128);if(existing!==null&&existing.toString('utf8')!==proof.token)throw new ControlError('An unowned lock replaced an interrupted operation. Manual review is required.');if(existing!==null)await unlink(path);}catch(e){store.releaseLock(projectId,token);throw e;}}
    }
    if(!reserved&&!store.reserveLock(projectId,token)){await new Promise(r=>setTimeout(r,20));continue;}
    try{handle=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);await handle.writeFile(token);await handle.sync();break;}
    catch(e){store.releaseLock(projectId,token);throw new ControlError((e as NodeJS.ErrnoException).code==='EEXIST'?'An unowned project lock exists; no file takeover is allowed.':'Could not acquire the project configuration lock.');}
  }
  if(!handle)throw new ControlError('Project configuration is locked. Inspect an interrupted operation before removing its lock.','conflict',409);
  const identity=await handle.stat();return async()=>{await handle!.close();try{const current=await lstat(path);if(current.ino===identity.ino&&current.dev===identity.dev&&(await readFile(path,'utf8'))===token)await unlink(path);}catch{/* never remove a replaced or unowned lock */}store.releaseLock(projectId,token);};
}

export async function atomicProjectWrite(root:string,path:ProjectFile,expected:string,next:Buffer|null,beforeCommit?:()=>Promise<void>,journal?:{id:string;created:(info:{name:string;dev:number;ino:number;hash:string})=>void}):Promise<void>{
  if(next!==null&&next.length>262144)throw new ControlError('Configuration exceeds the safe size limit.');
  const target=await guardedFile(root,path),parent=dirname(target);const parentId=await directoryIdentity(parent);const previous=await readBounded(target);
  if(hash(previous)!==expected)throw new ControlError('Configuration changed since approval.','conflict',409);
  const temporary=join(parent,'.'+basename(target)+'.shrinkcage-'+(journal?.id??randomUUID())+'.tmp');let handle;let identity:{dev:number;ino:number}|undefined;
  try{
    if(next!==null){handle=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600);const info=await handle.stat();identity={dev:info.dev,ino:info.ino};await handle.writeFile(next);if(previous!==null)await handle.chmod((await lstat(target)).mode&0o777);await handle.sync();journal?.created({name:basename(temporary),...identity,hash:digest(next)});await handle.close();handle=undefined;}
    await beforeCommit?.();await guardedFile(root,path);
    if(await directoryIdentity(parent)!==parentId||hash(await readBounded(target))!==expected)throw new ControlError('Configuration or its parent changed before commit.','conflict',409);
    if(next===null){if(previous!==null)await unlink(target);}else await rename(temporary,target);
  }finally{await handle?.close();if(identity)try{const current=await lstat(temporary);if(current.dev===identity.dev&&current.ino===identity.ino&&!current.isSymbolicLink())await unlink(temporary);}catch{/* Only an actually created, unchanged temporary inode can be removed. */}}
}

async function durableBackup(path:string,contents:Buffer){const h=await open(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);try{await h.writeFile(contents);await h.sync();}finally{await h.close();}}
export async function applySetup(root:string,project:ProjectRef,store:ControlStore,approved:string,version:string|null,inject?:{beforeWrite?:(index:number)=>Promise<void>}):Promise<SetupReceipt|null>{
  const initial=await previewSetup(root,project,store);if(!initial.preview.ready)throw new ControlError(initial.preview.errors.join(' '));if(initial.preview.fingerprint!==approved)throw new ControlError('Approval fingerprint is stale or does not match this setup.','approval',409);
  const release=await projectLock(root,project.id,store);
  try{
    const {preview,changes}=await previewSetup(root,project,store);
    if(!preview.ready)throw new ControlError(preview.errors.join(' '));
    if(approved!==preview.fingerprint)throw new ControlError('Approval fingerprint is stale or does not match this setup.','approval',409);
    if(!changes.length)return store.receipts().find(r=>r.projectId===project.id&&r.status==='applied')??null;
    const receipt:SetupReceipt={id:randomUUID(),tool:'rtk',projectId:project.id,status:'preparing',createdAt:new Date().toISOString(),version,files:[]};
    const backupDir=join(store.dir,'backups',receipt.id);await mkdir(backupDir,{recursive:true,mode:0o700});await chmod(backupDir,0o700);
    try{for(let i=0;i<changes.length;i++){const c=changes[i];const backup=c.before===null?null:String(i);if(c.before!==null)await durableBackup(join(backupDir,String(i)),c.before);await durableBackup(join(backupDir,String(i)+'.after'),c.after);receipt.files.push({path:c.path,beforeHash:c.beforeHash,afterHash:c.afterHash,backup,existed:c.before!==null});}store.putReceipt(receipt);}catch{await rm(backupDir,{recursive:true,force:true});throw new ControlError('Could not prepare a durable owned setup journal. No project files were changed.');}
    try{for(let i=0;i<changes.length;i++){const c=changes[i];await atomicProjectWrite(root,c.path,c.beforeHash,c.after,()=>inject?.beforeWrite?.(i)??Promise.resolve(),{id:receipt.id,created:info=>{receipt.files[i].temporary=info;store.putReceipt(receipt);}});}receipt.status='applied';store.putReceipt(receipt);store.audit('rtk.setup',receipt.id);return receipt;}
    catch{try{await rollbackReceipt(root,store,receipt);}catch{receipt.status='conflict';store.putReceipt(receipt);}throw new ControlError('Setup did not complete. Owned changes were rolled back where safe; inspect receipt status for conflicts.');}
  }finally{await release();}
}

export function mergeHookRollback(current:Buffer,expectedAfter:Buffer,original:Buffer|null):Buffer {
  let value:Record<string,unknown>,after:unknown,before:unknown;
  try{value=JSON.parse(current.toString('utf8'));after=JSON.parse(expectedAfter.toString('utf8'));before=original?JSON.parse(original.toString('utf8')):{};}catch{throw new ControlError('Hook JSON changed or is malformed; rollback requires manual review.');}
  const hooksOf=(v:unknown)=>hookEntries(v).flatMap(g=>Array.isArray(g.hooks)?g.hooks as Record<string,unknown>[]:[]);
  const oldHashes=new Set(hooksOf(before).map(h=>stable(h)));const owned=hooksOf(after).filter(h=>!oldHashes.has(stable(h)));
  if(owned.length!==1)throw new ControlError('Cannot establish exact hook ownership for rollback.');
  const ownedHash=stable(owned[0]);const candidates=hooksOf(value).filter(h=>stable(h)===ownedHash);
  if(candidates.length!==1)throw new ControlError('Owned hook was edited, removed or duplicated. Rollback will not overwrite user changes.');
  const groups=hookEntries(value).map(g=>({...g,hooks:Array.isArray(g.hooks)?g.hooks.filter(h=>stable(h)!==ownedHash):g.hooks})).filter(g=>!Array.isArray(g.hooks)||g.hooks.length>0);
  return Buffer.from(JSON.stringify({...value,hooks:{...value.hooks as object,PreToolUse:groups}},null,2)+'\n');
}
async function rollbackReceipt(root:string,store:ControlStore,receipt:SetupReceipt){
  for(let i=receipt.files.length-1;i>=0;i--){const file=receipt.files[i];const path=file.path as ProjectFile;const target=await guardedFile(root,path);const current=await readBounded(target),currentHash=hash(current);
    if(file.temporary){const temporary=join(dirname(target),file.temporary.name);if(!file.temporary.name.startsWith('.'+basename(target)+'.shrinkcage-')||file.temporary.name.includes('/')||file.temporary.name.includes('\\'))throw new ControlError('Invalid owned temporary resource.');const s=await lstat(temporary).catch(()=>null);if(s){if(s.isSymbolicLink()||s.dev!==file.temporary.dev||s.ino!==file.temporary.ino||digest((await readBounded(temporary))!)!==file.temporary.hash)throw new ControlError('An owned temporary resource changed; recovery stopped.');await unlink(temporary);}}
    if(currentHash===file.beforeHash)continue;
    const backupDir=join(store.dir,'backups',receipt.id);const original=file.backup===null?null:await readBounded(join(backupDir,file.backup));
    if(file.existed&&(!original||digest(original)!==file.beforeHash))throw new ControlError('Backup missing or altered. Recovery stopped.');
    let restore=original;
    if(currentHash!==file.afterHash){if(path!=='.codex/hooks.json'||current===null)throw new ControlError('Owned resource changed; recovery stopped.');const after=await readBounded(join(backupDir,String(i)+'.after'));if(!after||digest(after)!==file.afterHash)throw new ControlError('Backup verification failed.');restore=mergeHookRollback(current,after,original);}
    await atomicProjectWrite(root,path,currentHash,restore,undefined,{id:receipt.id+'-undo',created:info=>{file.temporary=info;store.putReceipt(receipt);}});
  }
  receipt.status='undone';store.putReceipt(receipt);store.audit('rtk.undo',receipt.id);
}
export async function previewUndo(root:string,project:ProjectRef,store:ControlStore):Promise<SetupPreview>{
  const receipt=store.receipts().find(r=>r.projectId===project.id&&r.tool==='rtk'&&r.status!=='undone');if(!receipt)throw new ControlError('No owned RTK setup exists for this project.');
  const files=[];for(const f of receipt.files){const current=await readBounded(await guardedFile(root,f.path as ProjectFile));files.push({path:f.path,beforeHash:hash(current),afterHash:f.beforeHash,change:'update' as const});}
  return {tool:'rtk',operation:'undo',fingerprint:fingerprint({operation:'undo',receipt:receipt.id,project,files}),project,scope:'project',files,warnings:['Only recorded owned changes are undone. Unrelated edits are preserved; edited owned hooks cause a visible conflict.'],errors:[],ready:true};
}
export async function undoSetup(root:string,project:ProjectRef,store:ControlStore,approved:string){
  const initial=await previewUndo(root,project,store);if(initial.fingerprint!==approved)throw new ControlError('Undo approval is stale.','approval',409);
  const release=await projectLock(root,project.id,store);try{const preview=await previewUndo(root,project,store);if(preview.fingerprint!==approved)throw new ControlError('Undo approval is stale.','approval',409);const receipt=store.receipts().find(r=>r.projectId===project.id&&r.status!=='undone')!;try{await rollbackReceipt(root,store,receipt);}catch(e){receipt.status='conflict';store.putReceipt(receipt);throw e;}}finally{await release();}
}
