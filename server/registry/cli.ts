import {ControlError} from '../control/schema.js';
import type {ControlPlane} from '../control/core.js';
export async function registryCli(plane:ControlPlane,p:string[],flags:Record<string,string|boolean>){const operation=p[1]??'list';if(Object.keys(flags).some(k=>!['json','source','query','approve'].includes(k)))throw new ControlError('Unsupported registry option.');const output=(v:unknown)=>console.log(JSON.stringify(v,null,2));
  if(operation==='list'){const v=await plane.registry.view();output(flags.json?v:{snapshot:v.snapshot,tools:v.entries.map(e=>({id:e.id,name:e.name,category:e.category,trust:e.trust.state,local:v.local.find(l=>l.entryId===e.id)?.state,version:e.upstream.version}))});return 0;}
  if(operation==='show'){const v=await plane.registry.view(),e=v.entries.find(e=>e.id===p[2]);if(!e)throw new ControlError('Registry entry not found.');output({entry:e,local:v.local.find(l=>l.entryId===e.id)});return 0;}
  if(operation==='discover'){const source=String(flags.source??'github'),query=String(flags.query??'context');if(!['github','releases','packages','community'].includes(source)||!['context','output','mcp','memory','analytics','topics'].includes(query))throw new ControlError('Choose a documented metadata source and query.');await plane.registry.startDiscovery({source:source as 'github',query:query as 'context'});output(await plane.registry.waitForDiscovery());return 0;}
  if(operation==='update'){const {bytes,integrity,...preview}=await plane.registry.updatePreview();if(typeof flags.approve!=='string'){output(preview);return 0;}output(await plane.registry.update(flags.approve));return 0;}
  throw new ControlError('Use registry list, show ID, discover or update. Repository maintainers use the separate review scripts.');
}
