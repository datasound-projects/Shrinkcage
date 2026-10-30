import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ControlError } from './schema.js';
export class OwnedResources {
  private resources=new Map<string,{token:string;child:ChildProcess|null;references:Set<string>;closed:boolean}>();
  attach(id:string,session:string,child:ChildProcess|null=null){
    const existing=this.resources.get(id);if(existing){if(child&&existing.child!==child)throw new ControlError('Resource ownership conflict.');existing.references.add(session);return existing.token;}
    const resource={token:randomUUID(),child,references:new Set([session]),closed:false};this.resources.set(id,resource);child?.once('exit',()=>{resource.closed=true;});return resource.token;
  }
  release(id:string,session:string,token:string){
    const resource=this.resources.get(id);if(!resource)return;if(resource.token!==token||!resource.references.has(session))throw new ControlError('Resource ownership could not be verified.','ownership',403);
    resource.references.delete(session);if(resource.references.size)return;
    if(resource.child&&!resource.closed&&resource.child.exitCode===null&&resource.child.signalCode===null)resource.child.kill('SIGTERM');this.resources.delete(id);
  }
  references(id:string){return this.resources.get(id)?.references.size??0;}
}
