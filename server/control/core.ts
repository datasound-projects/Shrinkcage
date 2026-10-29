import { dirname } from 'node:path';
import { appDataDir, findBinary } from '../platform.js';
import { VERSION } from '../version.js';
import { CATALOG } from './catalog.js';
import { ControlStore } from './store.js';
import { ControlError, parseBenchmark, parseManifest } from './schema.js';
import { projectDirectory } from './paths.js';
import { detectAgent, detectTool } from './probe.js';
import { inspectConfiguration } from './config.js';
import { composePlan } from './planner.js';
import { applySetup, previewSetup, previewUndo, undoSetup } from './transactions.js';
import type { AgentDetection, Benchmark, ControlState, Detection, OptimizationPlan, ProjectRef, SavedProfile, ToolId } from './types.js';

export interface CoreOptions { dataDir?:string; env?:NodeJS.ProcessEnv; home?:string }
export class ControlPlane {
  private database?:ControlStore;private cache?:{at:number;agents:AgentDetection[];detections:Detection[]};private flight?:Promise<void>;
  readonly env:NodeJS.ProcessEnv;readonly dataDir:string;
  constructor(readonly options:CoreOptions={}){this.env=options.env??process.env;this.dataDir=options.dataDir??appDataDir(process.platform,options.home,this.env);}
  get store(){return this.database??=new ControlStore(this.dataDir);}
  get canonicalDataDir(){return dirname(this.store.dir);}
  close(){this.database?.close();this.database=undefined;}
  async discover(force=false){
    if(this.flight){await this.flight;return;}
    if(!force&&this.cache&&Date.now()-this.cache.at<60000)return;
    this.flight=(async()=>{const [agent,tools,extraAgents]=await Promise.all([detectAgent(this.env),Promise.all(CATALOG.map(m=>detectTool(m.id as ToolId,this.env))),Promise.all(['claude','gemini'].map(async id=>({id:id as 'claude'|'gemini',installed:await findBinary(id,process.platform,this.env),version:null,compatible:false,binaryFingerprint:null})))]);this.cache={at:Date.now(),agents:[agent,...extraAgents],detections:tools};})();
    try{await this.flight;}finally{this.flight=undefined;}
  }
  async state(token=''):Promise<ControlState>{
    await this.discover();const store=this.store;const extensions=store.extensions().map(parseManifest);
    return {schemaVersion:1,version:VERSION,platform:process.platform,updatedAt:new Date().toISOString(),catalog:[...CATALOG,...extensions],detections:this.cache!.detections,agents:this.cache!.agents,profiles:store.profiles(),projects:store.projects(),sessions:store.sessions().slice(0,50),benchmarks:store.comparisons(),receipts:store.receipts().map(({id,tool,projectId,status,createdAt,version})=>({id,tool,projectId,status,createdAt,version})),diagnostics:['Managed execution is available only from the terminal. Browser actions compose plans and change Shrinkcage metadata.','A managed launch process is distinct from a confirmed optimizer connection.','Installations are guided: no package manager, remote script or agent-global setup runs automatically.','The dashboard shows the latest 50 managed records. CLI metadata queries are bounded to the latest 200.'],csrfToken:token};
  }
  async project(input:{path?:string;id?:string}):Promise<{path:string;ref:ProjectRef}>{
    if(!!input.path===!!input.id)throw new ControlError('Choose exactly one project path or approved project ID.');
    let path=input.path;if(input.id){if(!/^[a-f0-9]{24}$/.test(input.id))throw new ControlError('Invalid project ID.');path=this.store.projectPath(input.id)??undefined;if(!path)throw new ControlError('Project is not approved. Register it with shrinkcage plan --project first.');}
    const result=await projectDirectory(path!,this.options.home);if(input.id&&result.ref.id!==input.id)throw new ControlError('The approved project moved or changed identity.');
    this.store.registerProject(result.ref,result.path);return result;
  }
  profile(id:string):SavedProfile {const value=this.store.profiles().find(p=>p.profile.id===id);if(!value)throw new ControlError('Unknown profile.');return value;}
  async plan(agent:string,profileId:string,projectInput:{path?:string;id?:string}):Promise<{plan:OptimizationPlan;projectPath:string}>{
    if(!['codex','claude','gemini'].includes(agent))throw new ControlError('Unknown agent.');
    const project=await this.project(projectInput);await this.discover(true);const config=await inspectConfiguration(project.path,this.env,this.options.home);
    const owned=this.store.receipts().find(r=>r.projectId===project.ref.id&&r.status!=='undone');
    if(owned?.status==='preparing'||owned?.status==='conflict')config.errors.push('An interrupted or conflicted owned setup needs explicit recovery.');
    if(config.ownedRtk&&(!owned||owned.status!=='applied'||owned.files.some(f=>config.digests['project/'+f.path.split('/').at(-1)]!==f.afterHash)))config.errors.push('The reserved project RTK shim is unowned or changed since setup.');
    const detected=this.cache!.agents.find(a=>a.id===agent)!;
    return {plan:composePlan({profile:this.profile(profileId),project:project.ref,agent:detected,detections:this.cache!.detections,config,platform:process.platform}),projectPath:project.path};
  }
  async setupPreview(tool:string,projectInput:{path?:string;id?:string},operation='setup'){
    if(tool!=='rtk')throw new ControlError('This tool has guided or process-scoped setup only. Inspect its official documentation.');
    const project=await this.project(projectInput);if(operation==='undo')return previewUndo(project.path,project.ref,this.store);
    await this.discover(true);const detected=this.cache!.detections.find(d=>d.id==='rtk')!;const result=await previewSetup(project.path,project.ref,this.store);const config=await inspectConfiguration(project.path,this.env,this.options.home);
    if(!detected.compatible)result.preview.errors.push('A compatible native RTK installation is required before setup.');
    if(config.hooksDisabled)result.preview.errors.push('Existing Codex policy disables hooks. Review that policy separately; setup will not override it.');
    if(config.rtkHooks>0&&!config.ownedRtk)result.preview.errors.push('An external RTK hook is already configured. Do not register a second hook.');
    result.preview.errors.push(...config.errors);result.preview.ready=result.preview.errors.length===0;return result.preview;
  }
  async setup(tool:string,projectInput:{path?:string;id?:string},approved:string,operation='setup'){
    const preview=await this.setupPreview(tool,projectInput,operation);if(!preview.ready)throw new ControlError(preview.errors.join(' '));if(preview.fingerprint!==approved)throw new ControlError('Setup approval is stale.','approval',409);
    const project=await this.project(projectInput);if(operation==='undo'){await undoSetup(project.path,project.ref,this.store,approved);return {status:'undone'};}
    const d=this.cache!.detections.find(d=>d.id==='rtk')!;return applySetup(project.path,project.ref,this.store,approved,d.version);
  }
  comparison(value:unknown):Benchmark{
    const input=parseBenchmark(value),sessions=this.store.sessions();const baseline=sessions.find(s=>s.id===input.baselineSession),optimized=sessions.find(s=>s.id===input.optimizedSession);
    if(!baseline||!optimized||!['exited','failed','abandoned'].includes(baseline.status)||!['exited','failed','abandoned'].includes(optimized.status))throw new ControlError('Choose two completed managed sessions.');
    const confounders:string[]=[];for(const key of ['sameTask','sameGitState','sameModel','sameEffort'] as const)if(!input[key])confounders.push(key+' is not confirmed.');
    if(input.quality!=='passed')confounders.push('Task quality has not passed review.');
    if(baseline.profile!=='baseline')confounders.push('The selected baseline did not use the baseline profile.');
    if(baseline.agentVersion!==optimized.agentVersion)confounders.push('Agent versions differ.');
    if(baseline.status!=='exited'||optimized.status!=='exited'||baseline.exitCode!==0||optimized.exitCode!==0)confounders.push('One or both launch processes did not exit successfully.');
    if(!optimized.evidence.some(e=>e.status==='usage_observed'))confounders.push('No optimizer usage receipt was observed in the optimized session.');
    confounders.push('Existing external hooks/routing, provider caching and uncontrolled workloads can affect results. Model and task equivalence are user-supplied.');
    confounders.push('Elapsed time includes the owned launcher, metric snapshots and teardown, not only agent inference.');
    return this.store.addComparison({...input,createdAt:new Date().toISOString(),confounders,elapsedDifferenceMs:baseline.elapsedMs===null||optimized.elapsedMs===null?null:optimized.elapsedMs-baseline.elapsedMs,conclusion:'Elapsed-time comparison only. Shared token savings are not added or attributed, and no causal cost claim is made.'});
  }
}
