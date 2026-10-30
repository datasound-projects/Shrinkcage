import { inspectBilling } from './accounting.js';
import { inspectGithub, inspectLocal, inspectManifestCandidate, inspectExistingMcp } from './sdk/discovery.js';
import { recommendStack } from './sdk/recommendations.js';
import { integrationProposal } from './sdk/proposal.js';
import { checkPlugin } from './sdk/health.js';
import { sensitiveLocation } from './sdk/binding.js';
import { isAbsolute } from 'node:path';
import { ControlPlane } from './core.js';
import { ControlError,id,object,parseManifest } from './schema.js';
import { optimizerRegistry } from './optimizers/registry.js';
import { parseLaunchOptions } from './schema.js';
import { accountSession } from './accounting.js';
const PREFIX='/api/control/v1';
export async function controlRead(plane:ControlPlane,path:string,token:string):Promise<unknown>{
  const state=await plane.state(token);switch(path.slice(PREFIX.length)){
    case '/state':return state;
    case '/tools':return {catalog:state.catalog,detections:state.detections,registry:optimizerRegistry.list()};
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
    case '/onboarding/discover':{approved(value,[]);await plane.discover(true);const s=await plane.state();return {agents:await Promise.all(s.agents.filter(a=>['codex','claude'].includes(a.id)).map(async a=>({...a,billing:await inspectBilling(a,plane.env)}))),detections:s.detections};}
    case '/onboarding/complete':{approved(value,[]);plane.store.completeOnboarding();return {completed:true};}
    case '/projects/register':{const d=approved(value,['path']);if(typeof d.path!=='string'||!isAbsolute(d.path)||sensitiveLocation(d.path))throw new ControlError('Choose an absolute project directory outside private agent and credential folders.');return (await plane.project({path:d.path})).ref;}
    case '/stacks/recommend':{const d=approved(value,['agent','billing','intent']);if(!['codex','claude'].includes(String(d.agent))||!['subscription','api','hybrid','unknown'].includes(String(d.billing))||!['minimal','balanced','maximum','terminal','navigation','long-context','experimental'].includes(String(d.intent)))throw new ControlError('Choose a supported stack context.');const s=await plane.state();return recommendStack(s.catalog,s.detections,{agent:d.agent as 'codex'|'claude',billing:d.billing as import('./types.js').BillingMode,intent:d.intent as 'balanced'});}
    case '/validation':{const d=approved(value,['agent','billing']);if(!['codex','claude'].includes(String(d.agent))||!['subscription','api','hybrid','unknown'].includes(String(d.billing)))throw new ControlError('Choose a supported validation context.');return plane.validationReports(d.agent as 'codex'|'claude',d.billing as import('./types.js').BillingMode);}
    case '/plugins/check':{const d=approved(value,['id']);if(!id(d.id))throw new ControlError('Invalid optimizer ID.');return checkPlugin(plane,d.id as string);}
    case '/candidates/inspect':{const d=approved(value,['source','value']);let candidate;if(d.source==='github')candidate=await inspectGithub(d.value);else if(d.source==='local-executable')candidate=await inspectLocal(d.value);else if(d.source==='manifest')candidate=inspectManifestCandidate(d.value);else throw new ControlError('Choose GitHub, a local executable, or a manifest.');plane.store.putCandidate(candidate);const {localPath,...safe}=candidate as typeof candidate&{localPath?:string};return safe;}
    case '/candidates/existing-mcp':{const d=approved(value,['agent','projectId']);if(typeof d.projectId!=='string')throw new ControlError('Choose an approved project.');return inspectExistingMcp(plane,String(d.agent),d.projectId);}
    case '/candidates/proposal':{const d=approved(value,['id']);if(typeof d.id!=='string')throw new ControlError('Choose a candidate.');const candidate=plane.store.candidate(d.id);if(!candidate)throw new ControlError('Candidate not found.');return integrationProposal(candidate);}
    case '/candidates/remove':{const d=approved(value,['id']);if(typeof d.id!=='string')throw new ControlError('Choose a candidate.');plane.store.removeCandidate(d.id);return {removed:true,externalSoftwarePreserved:true};}
    case '/discover':{approved(value,[]);await plane.discover(true);return {refreshed:true};}
    case '/profiles/save':{const d=approved(value,['profile','revision']);return plane.store.saveProfile(d.profile,Number.isSafeInteger(d.revision)?Number(d.revision):-1);}
    case '/profiles/remove':{const d=approved(value,['id','revision']);if(!id(d.id)||!Number.isSafeInteger(d.revision))throw new ControlError('Invalid profile removal.');plane.store.removeProfile(d.id as string,Number(d.revision));return {removed:true};}
    case '/plans':{const d=approved(value,['agent','profile','projectId','options']);if(!id(d.profile)||typeof d.projectId!=='string'||!/^[a-f0-9]{24}$/.test(d.projectId)||typeof d.agent!=='string')throw new ControlError('Choose a known profile and an approved project.');return (await plane.plan(d.agent,d.profile as string,{id:d.projectId},parseLaunchOptions(d.options??{},plane.store.schemaContext()))).plan;}
    case '/sessions/configure':{const d=approved(value,['id','options']);if(typeof d.id!=='string'||!/^[a-f0-9-]{36}$/.test(d.id))throw new ControlError('Invalid session ID.');return plane.store.setSessionPreference(d.id,d.options);}
    case '/sessions/page':{const d=approved(value,['offset','limit']);if(!Number.isSafeInteger(d.offset)||!Number.isSafeInteger(d.limit))throw new ControlError('Expected bounded session pagination.');const settings=plane.store.accounting(),items=plane.store.sessions(Number(d.offset),Number(d.limit)).map(s=>({...s,accounting:accountSession(s,settings)}));return {items,total:plane.store.sessionCount(),nextOffset:Number(d.offset)+items.length};}
    case '/sessions/discard':{const d=approved(value,['id']);if(typeof d.id!=='string'||!/^[a-f0-9-]{36}$/.test(d.id))throw new ControlError('Invalid session ID.');plane.store.clearSessionPreference(d.id);return {discarded:true};}
    case '/sessions/plan':{const d=approved(value,['id']);if(typeof d.id!=='string'||!/^[a-f0-9-]{36}$/.test(d.id))throw new ControlError('Invalid session ID.');const session=plane.store.session(d.id);if(!session?.pending)throw new ControlError('No pending next-launch stack.');return (await plane.plan(session.agent,session.pending.tools.length&&session.profile==='baseline'?'custom':session.profile,{id:session.project.id},{tools:session.pending.tools,toolConfig:session.pending.toolConfig,...(session.billing?.source==='user-declared'?{billing:session.billing.mode}:{}),...(session.model?{model:session.model}:{})})).plan;}
    case '/accounting':{const d=approved(value,['settings']);return plane.store.saveAccounting(d.settings);}
    case '/setup-preview':{const d=approved(value,['tool','projectId','operation']);if(d.tool!=='rtk'||typeof d.projectId!=='string'||!/^[a-f0-9]{24}$/.test(d.projectId)||!['setup','undo'].includes(String(d.operation)))throw new ControlError('Invalid setup preview.');return plane.setupPreview(d.tool,{id:d.projectId},d.operation as string);}
    case '/sessions/remove':{const d=approved(value,['id']);if(typeof d.id!=='string'||!/^[a-f0-9-]{36}$/.test(d.id))throw new ControlError('Invalid managed session ID.');plane.store.removeSession(d.id);return {removed:true};}
    case '/benchmarks':{const d=approved(value,['comparison']);return plane.comparison(d.comparison);}
    case '/extensions':{const d=approved(value,['manifest']);const manifest=parseManifest(d.manifest);plane.store.putExtension(manifest.id,manifest);return {manifest,executionEnabled:false};}
    case '/extensions/remove':{const d=approved(value,['id']);if(!id(d.id))throw new ControlError('Invalid extension ID.');plane.store.removeExtension(d.id as string);return {removed:true,externalInstallationPreserved:true};}
    default:throw new ControlError('No execution, installer or process-control endpoint is available.','missing',404);
  }
}
