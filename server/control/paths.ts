import { constants } from 'node:fs';
import { lstat, open, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { ControlError, digest } from './schema.js';
import type { ProjectRef } from './types.js';

export async function readBounded(path:string,max=262144):Promise<Buffer|null>{
  let handle;try{
    const before=await lstat(path);if(before.isSymbolicLink()||!before.isFile()||before.size>max)throw new ControlError('Unsafe, non-regular or oversized configuration file.');
    handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const info=await handle.stat();
    if(info.ino!==before.ino||info.dev!==before.dev||info.size>max)throw new ControlError('Configuration changed during inspection.');
    const value=Buffer.alloc(max+1);const {bytesRead}=await handle.read(value,0,max+1,0);if(bytesRead>max)throw new ControlError('Configuration file exceeds the size limit.');return value.subarray(0,bytesRead);
  }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}finally{await handle?.close();}
}
export async function projectDirectory(value:string,home=homedir()):Promise<{path:string;ref:ProjectRef}>{
  if(typeof value!=='string'||value.length>4096||value.includes('\0')||/^[\\/]{2}|^[a-z]+:\/\//i.test(value))throw new ControlError('Choose an existing local project directory.');
  const candidate=resolve(value);const info=await lstat(candidate).catch(()=>null);
  if(!info?.isDirectory()||info.isSymbolicLink())throw new ControlError('Choose an existing project directory, not a symlink.');
  const path=await realpath(candidate),actualHome=await realpath(home).catch(()=>resolve(home));
  if(path===parse(path).root||path===actualHome||/[\\/](?:\.ssh|\.aws|\.gnupg|node_modules)(?:[\\/]|$)/i.test(path))throw new ControlError('The home, filesystem root and credential directories cannot be projects.');
  return {path,ref:{id:digest(path).slice(0,24),label:basename(path).replace(/[\x00-\x1f<>]/g,'').slice(0,64)||'Project'}};
}
export const PROJECT_FILES=['.codex/hooks.json','.codex/shrinkcage-rtk.mjs'] as const;
export type ProjectFile=typeof PROJECT_FILES[number];
export async function guardedFile(root:string,file:ProjectFile):Promise<string>{
  if(!PROJECT_FILES.includes(file)||!isAbsolute(root)||file.includes('..'))throw new ControlError('Unsupported configuration resource.');
  const actual=await realpath(root);if(actual!==root)throw new ControlError('Project location changed.');
  const target=join(root,file);if(relative(root,target).startsWith('..')||!target.startsWith(root+sep))throw new ControlError('Configuration escaped the approved project.');
  let parent=root;for(const part of file.split('/').slice(0,-1)){
    parent=join(parent,part);const info=await lstat(parent).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(info&&(!info.isDirectory()||info.isSymbolicLink()))throw new ControlError('Configuration directory is a symlink or is not a directory.');
  }
  const info=await lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(info&&(!info.isFile()||info.isSymbolicLink()))throw new ControlError('Configuration target is a symlink or is not a file.');
  return target;
}
export async function directoryIdentity(path:string){const s=await stat(path);return `${s.dev}:${s.ino}`;}
