import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { VERSION } from '../version.js';
import { ControlPlane } from './core.js';
import { ControlError, id as validId, parseManifest, parseProfile } from './schema.js';
import { readBounded } from './paths.js';
import { runManaged } from './runner.js';
import type { OptimizationPlan,Profile,ToolId } from './types.js';
import { TOOL_IDS } from './types.js';

const HELP=`Shrinkcage ${VERSION} — local AI-agent optimization control plane

shrinkcage [--no-open]                 Open http://localhost:8790
shrinkcage ui [--no-open]              Open the existing dashboard
shrinkcage --help | --version
shrinkcage doctor [--json]
shrinkcage tools [--json]
shrinkcage tool inspect|verify <tool> [--json]
shrinkcage tool setup|undo rtk --project <dir> [--scope project] [--dry-run | --approve <fingerprint>]
shrinkcage profile list [--json]
shrinkcage profile show|export <id>
shrinkcage profile create|edit <id> [--agent codex] [--tools rtk,serena,headroom] [--required rtk] [--name <label>] [--fallback explicit|block]
shrinkcage profile remove <id> [--revision <number>]
shrinkcage profile import <json-file> [--revision <number>]
shrinkcage plan codex --profile <id> --project <dir> [--json]
shrinkcage run codex --profile <id> --project <dir> [--approve <fingerprint>] [-- <agent args>]
shrinkcage sessions [--json]
shrinkcage sessions export|remove <id>
shrinkcage sessions prune [--days 90]
shrinkcage extension inspect|import <json-file>

An approved project can also be selected with --project-id <id>.
Installations are guided; setup only changes the two previewed project RTK files.
No browser execution endpoint, global agent-config writes, account changes or transcript export.
Managed runs preserve the terminal, agent policies and exit status. Codex alone is supported for managed runs.
`;
export function parseArguments(args:string[]){
  const split=args.indexOf('--'),control=split<0?args:args.slice(0,split),rest=split<0?[]:args.slice(split+1),positionals:string[]=[],flags:Record<string,string|boolean>={};
  if(args.length>140||args.reduce((n,a)=>n+a.length,0)>32768)throw new ControlError('Too many CLI arguments.');
  for(let i=0;i<control.length;i++){
    const a=control[i];if(a.includes('\0'))throw new ControlError('Invalid CLI argument.');
    if(!a.startsWith('--')){positionals.push(a);continue;}
    const equal=a.indexOf('='),key=a.slice(2,equal<0?undefined:equal);if(!/^[a-z][a-z-]{0,32}$/.test(key)||Object.hasOwn(flags,key))throw new ControlError('Unknown, duplicated or malformed CLI option.');
    if(['json','dry-run','help'].includes(key)){if(equal>=0)throw new ControlError('Boolean options do not accept a value.');flags[key]=true;}
    else{const value=equal<0?control[++i]:a.slice(equal+1);if(!value||value.startsWith('--'))throw new ControlError('A CLI option is missing its value.');flags[key]=value;}
  }
  return {positionals,flags,rest};
}
function allowed(flags:Record<string,unknown>,keys:string[]){if(Object.keys(flags).some(k=>!keys.includes(k)))throw new ControlError('Unsupported option for this command.');}
const value=(flags:Record<string,string|boolean>,key:string,fallback?:string)=>{const v=flags[key];if(v===undefined)return fallback;if(typeof v!=='string')throw new ControlError('Expected an option value.');return v;};
const json=(v:unknown)=>console.log(JSON.stringify(v,null,2));
const number=(v:string|undefined,fallback:number)=>{if(v===undefined)return fallback;if(!/^\d{1,7}$/.test(v))throw new ControlError('Expected a non-negative integer.');return Number(v);};
const project=(flags:Record<string,string|boolean>)=>({path:value(flags,'project'),id:value(flags,'project-id')});
function printPlan(plan:OptimizationPlan){
  console.log(`${plan.ready?'Ready':'Blocked'} · ${plan.profile} · ${plan.project.label}\nFingerprint: ${plan.fingerprint}\nConfigured for next launch: ${plan.tools.join(', ')||'no managed optimizers'}`);
  for(const e of plan.errors)console.error('BLOCKED: '+e);for(const w of plan.warnings)console.error('NOTE: '+w);
  for(const a of plan.actions)if(a.phase==='activate')console.log(`${a.tool} [${a.scope}]: ${a.description}`);
  console.log('\n'+plan.launchCommand);
}
async function approval(plan:OptimizationPlan,provided?:string){
  if(provided)return provided;printPlan(plan);if(!process.stdin.isTTY||!process.stdout.isTTY)throw new ControlError('Non-interactive runs require --approve with the current plan fingerprint.');
  const prompt=createInterface({input:process.stdin,output:process.stderr});try{const answer=await prompt.question('Approve this exact plan? Type its first 8 fingerprint characters: ');if(answer.trim()!==plan.fingerprint.slice(0,8))throw new ControlError('Plan was not approved.','cancelled');return plan.fingerprint;}finally{prompt.close();}
}
export async function main(args=process.argv.slice(2)):Promise<number>{
  if(args.length===0||args[0]==='--help'||args[0]==='help'){console.log(HELP);return 0;}
  if(args[0]==='--version'){console.log('Shrinkcage '+VERSION);return 0;}
  const plane=new ControlPlane();
  try{
    const {positionals:p,flags:f,rest}=parseArguments(args);const command=p[0];
    if(command!=='run'&&rest.length)throw new ControlError('Agent argument passthrough is supported only by run.');
    if(command==='doctor'||command==='tools'){
      allowed(f,['json']);if(p.length!==1)throw new ControlError('Unexpected positional arguments.');const state=await plane.state();
      const result=command==='doctor'?{version:VERSION,node:process.versions.node,platform:process.platform,agents:state.agents,tools:state.detections,diagnostics:state.diagnostics}:state.detections;
      if(f.json)json(result);else{console.log(`Shrinkcage ${VERSION} · ${process.platform} · Node ${process.versions.node}`);for(const d of state.detections)console.log(`${d.id.padEnd(10)} ${d.status.padEnd(16)} ${d.version??'version unavailable'} · installed ${d.installed?'yes':'no'} · configured unknown · connected unknown · effective unknown`);console.log('Use tool inspect <id> for authoritative setup guidance.');}return 0;
    }
    if(command==='tool'){
      const operation=p[1],tool=p[2];if(!TOOL_IDS.includes(tool as ToolId)||p.length!==3)throw new ControlError('Choose a known tool ID.');
      if(operation==='inspect'||operation==='verify'){allowed(f,['json']);await plane.discover(true);const state=await plane.state();json({manifest:state.catalog.find(t=>t.id===tool),detection:state.detections.find(t=>t.id===tool),verification:'Read-only installed-interface and fixed local health checks. Agent connection requires managed protocol receipts.'});return 0;}
      if(operation==='setup'||operation==='undo'){
        allowed(f,['project','project-id','scope','dry-run','approve','json']);if(value(f,'scope','project')!=='project')throw new ControlError('User-global setup is not automated. Use the official tool instructions after a separate review.');
        const preview=await plane.setupPreview(tool,project(f),operation);if(f['dry-run']||!f.approve){json(preview);return preview.ready?0:2;}
        if(!preview.ready)throw new ControlError(preview.errors.join(' '));json(await plane.setup(tool,project(f),value(f,'approve')!,operation));return 0;
      }
      throw new ControlError('Install, upgrade and removal of external executables are guided; no unattended installer is available.');
    }
    if(command==='profile'){
      const operation=p[1],id=p[2];allowed(f,['json','agent','tools','required','name','scope','fallback','description','revision']);if(p.length>(operation==='list'?2:3))throw new ControlError('Unexpected profile arguments.');
      if(operation==='list'){if(p.length!==2)throw new ControlError('Unexpected profile arguments.');if(f.json)json(plane.store.profiles());else for(const saved of plane.store.profiles())console.log(`${saved.profile.id.padEnd(14)} ${saved.profile.agent} · ${saved.profile.tools.map(t=>t.id).join(', ')||'baseline'} · revision ${saved.revision}`);return 0;}
      if(operation==='import'){if(!id)throw new ControlError('Choose a profile JSON file.');const contents=await readBounded(id,16384);if(!contents)throw new ControlError('Profile file not found.');let profile;try{profile=parseProfile(JSON.parse(contents.toString('utf8')));}catch{throw new ControlError('The profile file is invalid.');}json(plane.store.saveProfile(profile,number(value(f,'revision'),0)));return 0;}
      if(!validId(id))throw new ControlError('Invalid profile ID.');
      if(operation==='show'||operation==='export'){const saved=plane.profile(id);json(operation==='export'?saved.profile:saved);return 0;}
      if(operation==='remove'){const saved=plane.profile(id);plane.store.removeProfile(id,number(value(f,'revision'),saved.revision));json({removed:id});return 0;}
      if(operation==='create'||operation==='edit'){
        const current=plane.store.profiles().find(s=>s.profile.id===id);if(operation==='create'&&current&&!current.builtin)throw new ControlError('Profile already exists.');if(operation==='edit'&&!current)throw new ControlError('Profile does not exist.');
        const tools=value(f,'tools')?.split(',').filter(Boolean)??current?.profile.tools.map(t=>t.id)??[];const required=value(f,'required','')!.split(',');
        const profile:Profile={schemaVersion:1,id,name:value(f,'name',current?.profile.name??id)!,agent:value(f,'agent',current?.profile.agent??'codex') as Profile['agent'],description:value(f,'description',current?.profile.description??'')!,scope:value(f,'scope',current?.profile.scope??'process') as Profile['scope'],fallback:value(f,'fallback',current?.profile.fallback??'explicit') as Profile['fallback'],tools:tools.map((id,i)=>({id:id as ToolId,required:required.includes(id),priority:100-i*10}))};
        json(plane.store.saveProfile(profile,number(value(f,'revision'),current?.revision??0)));return 0;
      }
      throw new ControlError('Unknown profile operation.');
    }
    if(command==='plan'||command==='run'){
      allowed(f,['profile','project','project-id','json','approve']);if(p.length!==2)throw new ControlError('Choose an agent.');const profile=value(f,'profile','balanced')!;const result=await plane.plan(p[1],profile,project(f));
      if(command==='plan'){if(f.json)json(result.plan);else printPlan(result.plan);return result.plan.ready?0:2;}
      if(!result.plan.ready){printPlan(result.plan);return 2;}const approved=await approval(result.plan,value(f,'approve'));return await runManaged(plane,{agent:p[1],profile,project:project(f),approved,args:rest});
    }
    if(command==='sessions'){
      allowed(f,['json','days']);if(p.length===1){const sessions=plane.store.sessions();if(f.json)json(sessions);else for(const s of sessions)console.log(`${s.id} · ${s.status} · ${s.profile} · ${s.project.label}`);return 0;}
      if(p[1]==='prune'&&p.length===2){plane.store.prune(number(value(f,'days'),90));json({pruned:true});return 0;}
      if(p.length===3&&p[1]==='export'){const session=plane.store.sessions().find(s=>s.id===p[2]);if(!session)throw new ControlError('Session not found.');json(session);return 0;}
      if(p.length===3&&p[1]==='remove'){plane.store.removeSession(p[2]);json({removed:true});return 0;}
      throw new ControlError('Unknown managed-session operation. Stop active sessions in their owning terminal.');
    }
    if(command==='extension'){
      allowed(f,[]);if(p.length!==3||!['inspect','import'].includes(p[1]))throw new ControlError('Choose extension inspect or import with a manifest file.');const data=await readBounded(p[2],12000);if(!data)throw new ControlError('Manifest not found.');let manifest;try{manifest=parseManifest(JSON.parse(data.toString('utf8')));}catch{throw new ControlError('Invalid declarative manifest; no commands were executed.');}if(p[1]==='import')plane.store.putExtension(manifest.id,manifest);json({manifest,trust:'declarative-only',executionEnabled:false});return 0;
    }
    throw new ControlError('Unknown command. Use shrinkcage --help.');
  }catch(e){console.error(e instanceof ControlError?e.message:'Control operation failed. Inspect local permissions and diagnostics; private inputs were not logged.');return 2;}finally{plane.close();}
}
