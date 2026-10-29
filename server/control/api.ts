import { ControlPlane } from './core.js';
import { ControlError,id,object,parseManifest } from './schema.js';
const PREFIX='/api/control/v1';
export async function controlRead(plane:ControlPlane,path:string,token:string):Promise<unknown>{
  const state=await plane.state(token);switch(path.slice(PREFIX.length)){
    case '/state':return state;
    case '/tools':return {catalog:state.catalog,detections:state.detections};
    case '/profiles':return state.profiles;
    case '/projects':return state.projects;
    case '/sessions':return state.sessions;
    case '/benchmarks':return state.benchmarks;
    case '/diagnostics':return {diagnostics:state.diagnostics,receipts:state.receipts};
    default:throw new ControlError('Control route not found.','missing',404);
  }
}
function approved(value:unknown,keys:string[]){const data=object(value,[...keys,'approved']);if(data.approved!==true)throw new ControlError('Explicit action approval is required.','approval',403);return data;}
export async function controlWrite(plane:ControlPlane,path:string,value:unknown):Promise<unknown>{
  switch(path.slice(PREFIX.length)){
    case '/discover':{approved(value,[]);await plane.discover(true);return {refreshed:true};}
    case '/profiles/save':{const d=approved(value,['profile','revision']);return plane.store.saveProfile(d.profile,Number.isSafeInteger(d.revision)?Number(d.revision):-1);}
    case '/profiles/remove':{const d=approved(value,['id','revision']);if(!id(d.id)||!Number.isSafeInteger(d.revision))throw new ControlError('Invalid profile removal.');plane.store.removeProfile(d.id as string,Number(d.revision));return {removed:true};}
    case '/plans':{const d=approved(value,['agent','profile','projectId']);if(!id(d.profile)||typeof d.projectId!=='string'||!/^[a-f0-9]{24}$/.test(d.projectId)||typeof d.agent!=='string')throw new ControlError('Choose a known profile and an approved project.');return (await plane.plan(d.agent,d.profile as string,{id:d.projectId})).plan;}
    case '/setup-preview':{const d=approved(value,['tool','projectId','operation']);if(d.tool!=='rtk'||typeof d.projectId!=='string'||!/^[a-f0-9]{24}$/.test(d.projectId)||!['setup','undo'].includes(String(d.operation)))throw new ControlError('Invalid setup preview.');return plane.setupPreview(d.tool,{id:d.projectId},d.operation as string);}
    case '/sessions/remove':{const d=approved(value,['id']);if(typeof d.id!=='string'||!/^[a-f0-9-]{36}$/.test(d.id))throw new ControlError('Invalid managed session ID.');plane.store.removeSession(d.id);return {removed:true};}
    case '/benchmarks':{const d=approved(value,['comparison']);return plane.comparison(d.comparison);}
    case '/extensions':{const d=approved(value,['manifest']);const manifest=parseManifest(d.manifest);plane.store.putExtension(manifest.id,manifest);return {manifest,executionEnabled:false};}
    default:throw new ControlError('No execution, installer or process-control endpoint is available.','missing',404);
  }
}
