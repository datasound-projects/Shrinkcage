import { RegistryService,type RegistryOptions } from '../registry/service.js';
import { TerminalLauncher,type TerminalOptions } from './terminal.js';
import { detectPlugin } from './sdk/detection.js';
import { publicPlugin } from './sdk/service.js';
import { builtinValidation, pluginCatalog, validatePluginContext, gate, report } from './sdk/validation.js';
import { compareSessions } from './comparison.js';
import { dirname, isAbsolute } from 'node:path';
import { appDataDir, findBinary } from '../platform.js';
import { VERSION } from '../version.js';
import { accountSession, inspectBilling, recommendations } from './accounting.js';
import { CATALOG } from './catalog.js';
import { ControlStore } from './store.js';
import { ControlError, fingerprint, parseBenchmark, parseManifest, parseLaunchOptions } from './schema.js';
import { projectDirectory } from './paths.js';
import { detectAgent, detectTool } from './probe.js';
import { inspectConfiguration, inspectClaudeConfiguration } from './config.js';
import { composePlan } from './planner.js';
import { applySetup, previewSetup, previewUndo, undoSetup } from './transactions.js';
import type { BuiltinToolId, LaunchOptions, AgentDetection, Benchmark, ControlState, Detection, OptimizationPlan, ProjectRef, SavedProfile, ToolId } from './types.js';

export interface CoreOptions { dataDir?:string; env?:NodeJS.ProcessEnv; home?:string; registry?:RegistryOptions; terminal?:TerminalOptions }
export class ControlPlane {
  private terminalService?:TerminalLauncher;
  get terminals(){return this.terminalService??=new TerminalLauncher(this,this.options.terminal);}
  private registryService?:RegistryService;
  get registry(){return this.registryService??=new RegistryService(this,this.options.registry);}
  private database?:ControlStore;private cache?:{at:number;agents:AgentDetection[];detections:Detection[]};private flight?:Promise<void>;
  readonly env:NodeJS.ProcessEnv;readonly dataDir:string;
  constructor(readonly options:CoreOptions={}){this.env=options.env??process.env;this.dataDir=options.dataDir??appDataDir(process.platform,options.home,this.env);}
  get store(){return this.database??=new ControlStore(this.dataDir);}
  get canonicalDataDir(){return dirname(this.store.dir);}
  close(){this.registryService?.close();this.database?.close();this.database=undefined;}
  invalidateDiscovery(){this.cache=undefined;}
  guidedEntries(){const valid:import('./types.js').OptimizerManifest[]=[],rejected:string[]=[];const reserved=new Set([...CATALOG.map(m=>m.id),...this.store.plugins().map(p=>p.manifest.id)]);for(const value of this.store.extensions()){try{const m=parseManifest(value);if(reserved.has(m.id))throw Error();valid.push(m);}catch{const key=(value as {id?:unknown})?.id;rejected.push(typeof key==='string'&&/^[a-z][a-z0-9-]{0,47}$/.test(key)?key:'invalid-entry');}}return {valid,rejected};}
  catalog(){return [...CATALOG,...this.store.plugins().map(p=>pluginCatalog(p.manifest)),...this.guidedEntries().valid];}
  async discover(force=false){
    if(this.flight){await this.flight;return;}
    if(!force&&this.cache&&Date.now()-this.cache.at<60000)return;
    this.flight=(async()=>{
      const jobs:(()=>Promise<AgentDetection|Detection>)[]=[()=>detectAgent(this.env),()=>detectAgent(this.env,'claude'),...CATALOG.map(t=>()=>detectTool(t.id as BuiltinToolId,this.env))];
      const results:(AgentDetection|Detection)[]=new Array(jobs.length);let next=0;
      // Two discovery jobs (at most four version/help children) avoid CPU/process bursts.
      await Promise.all([0,1].map(async()=>{while(next<jobs.length){const index=next++;results[index]=await jobs[index]();}}));
      const [agent,claude,...tools]=results;const gemini=await findBinary('gemini',process.platform,this.env);
      this.cache={at:Date.now(),agents:[agent as AgentDetection,claude as AgentDetection,{id:'gemini',installed:!!gemini,version:null,compatible:false,binaryFingerprint:null}],detections:[...tools as Detection[],...await Promise.all(this.store.plugins().map(detectPlugin))]};
    })();
    try{await this.flight;}finally{this.flight=undefined;}
  }
  async state(token=''):Promise<ControlState>{
    await this.discover();const store=this.store;const guided=this.guidedEntries();const accounting=store.accounting();const sessions=store.sessions().map(s=>({...s,accounting:accountSession(s,accounting)}));
    return {schemaVersion:1,version:VERSION,platform:process.platform,updatedAt:new Date().toISOString(),catalog:this.catalog(),detections:this.cache!.detections,agents:this.cache!.agents,profiles:store.profiles(),projects:store.projects(),sessions:sessions.slice(0,50),benchmarks:store.comparisons(),receipts:store.receipts().map(({id,tool,projectId,status,createdAt,version})=>({id,tool,projectId,status,createdAt,version})),diagnostics:[...guided.rejected.map(id=>'Guided entry '+id+' conflicts with a registered/reserved identity or no longer validates. Metadata is preserved; use extension remove ID to remove only that entry.'),'Reviewed browser launches open a native terminal using a one-time plan approval. Arbitrary commands and process termination are not exposed.','A managed launch process is distinct from a confirmed optimizer connection.','Installations are guided: no package manager, remote script or agent-global setup runs automatically.','The dashboard shows the latest 50 managed records. CLI metadata queries are bounded to the latest 200.'],csrfToken:token,accounting,plugins:store.plugins().map(publicPlugin),candidates:store.candidates(),onboarding:store.onboarding(),validations:await this.validationReports('codex','unknown'),validationHistory:store.validationHistory(),managedCount:store.sessionCount(),activeManagedCount:store.activeCount(),recommendations:recommendations(sessions,accounting)};
  }
  async validationReports(agent:'codex'|'claude',billing:import('./types.js').BillingMode){
    await this.discover();const agentInfo=this.cache!.agents.find(a=>a.id===agent);const sessions=this.store.sessions(),active=sessions.filter(s=>['running','degraded','starting'].includes(s.status));
    const reports=CATALOG.map(m=>builtinValidation(m,this.cache!.detections.find(d=>d.id===m.id),{agent,billing,agentCompatible:agentInfo?.compatible===true,agentVersion:agentInfo?.version,evidence:active.find(s=>s.agent===agent&&s.plannedTools.includes(m.id))?.evidence.find(e=>e.tool===m.id&&e.toolVersion===this.cache!.detections.find(d=>d.id===m.id)?.version)}));
    for(const plugin of this.store.plugins()){const d=this.cache!.detections.find(d=>d.id===plugin.manifest.id);reports.push(validatePluginContext(plugin,{agent,billing,bindingCurrent:d?.binaryFingerprint===plugin.binding.fingerprint,configurationValid:plugin.manifest.dependencies.every(id=>this.cache!.detections.some(d=>d.id===id&&d.compatible)),agentCompatible:agentInfo?.compatible===true,agentVersion:agentInfo?.version,evidence:active.find(s=>s.agent===agent&&s.plannedTools.includes(plugin.manifest.id))?.evidence.find(e=>e.tool===plugin.manifest.id&&e.toolVersion===plugin.binding.toolVersion)}));}
    return reports.map(r=>this.store.retainValidation(r));
  }
  async project(input:{path?:string;id?:string}):Promise<{path:string;ref:ProjectRef}>{
    if(!!input.path===!!input.id)throw new ControlError('Choose exactly one project path or approved project ID.');
    let path=input.path;if(input.id){if(!/^[a-f0-9]{24}$/.test(input.id))throw new ControlError('Invalid project ID.');path=this.store.projectPath(input.id)??undefined;if(!path)throw new ControlError('Project is not approved. Register it with shrinkcage plan --project first.');}
    const result=await projectDirectory(path!,this.options.home);if(input.id&&result.ref.id!==input.id)throw new ControlError('The approved project moved or changed identity.');
    this.store.registerProject(result.ref,result.path);return result;
  }
  profile(id:string):SavedProfile {const value=this.store.profiles().find(p=>p.profile.id===id);if(!value)throw new ControlError('Unknown profile.');return value;}
  async plan(agent:string,profileId:string,projectInput:{path?:string;id?:string},rawOptions:LaunchOptions={},draft?:SavedProfile):Promise<{plan:OptimizationPlan;projectPath:string}>{
    if(!['codex','claude','gemini'].includes(agent))throw new ControlError('Unknown agent.');
    const options=parseLaunchOptions(rawOptions,this.store.schemaContext());const project=await this.project(projectInput);await this.discover(true);const config=await (agent==='claude'?inspectClaudeConfiguration:inspectConfiguration)(project.path,this.env,this.options.home);
    const root=agent==='claude'?this.env.CLAUDE_CONFIG_DIR:this.env.CODEX_HOME;if(root&&!isAbsolute(root))config.errors.push('Use an absolute CLI configuration directory; relative config roots cannot preserve session auth and permissions reliably.');
    const owned=this.store.receipts().find(r=>r.projectId===project.ref.id&&r.status!=='undone');
    if(owned?.status==='preparing'||owned?.status==='conflict')config.errors.push('An interrupted or conflicted owned setup needs explicit recovery.');
    if(config.ownedRtk&&(!owned||owned.status!=='applied'||owned.files.some(f=>config.digests['project/'+f.path.split('/').at(-1)]!==f.afterHash)))config.errors.push('The reserved project RTK shim is unowned or changed since setup.');
    const detected=this.cache!.agents.find(a=>a.id===agent)!;
    const billing=await inspectBilling(detected,this.env,options.billing);
    const saved=structuredClone(draft??this.profile(profileId));if(saved.builtin)saved.profile.agent=agent as typeof saved.profile.agent;
    if(options.tools){if(profileId==='baseline'&&options.tools.length)throw new ControlError('Baseline cannot enable managed tools.');saved.profile.tools=options.tools.map((id,i)=>({id,required:true,priority:Math.max(0,100-i*10),config:saved.profile.tools.find(t=>t.id===id)?.config}));}
    const toolConfig=Object.fromEntries(saved.profile.tools.map(t=>[t.id,{...t.config,...options.toolConfig?.[t.id]}]));
    if(agent==='claude'&&Object.values(toolConfig).some(c=>c.timeoutSeconds!==undefined))config.errors.push('Per-server timeout overrides are currently supported only for Codex; Claude uses its native timeout policy.');
    if(Object.keys(options.toolConfig??{}).some(id=>!saved.profile.tools.some(t=>t.id===id)))throw new ControlError('Configuration was supplied for an unselected tool.');
    const plan=composePlan({profile:saved,project:project.ref,agent:detected,detections:this.cache!.detections,config,catalog:this.catalog(),platform:process.platform,billing,model:options.model,toolConfig});
    try{const registry=await this.registry.catalog();for(const tool of plan.tools){const entry=registry.catalog.entries.find(e=>e.integration.adapterId===tool);if(entry&&entry.trust.state!=='approved')plan.errors.push('Registry '+entry.trust.state+': '+entry.name+' is blocked for new managed launches. Existing sessions remain unchanged.');if(entry&&registry.integrityError)plan.errors.push('Registry cache integrity recovery is required for '+entry.name+'.');}plan.warnings.push(...registry.warnings);const previous=plan.fingerprint;plan.fingerprint=fingerprint({plan:previous,registry:registry.sha256,integrityError:registry.integrityError});plan.launchCommand=plan.launchCommand.replace(previous,plan.fingerprint);}catch{plan.warnings.push('Registry snapshot unavailable; native adapter, source and session safety checks still apply.');}plan.ready=plan.errors.length===0;
    if(options.billing)plan.launchCommand+=' --billing '+options.billing;
    if(options.model)plan.launchCommand+=' --model '+options.model;
    if(options.tools)plan.launchCommand+=' --tools '+(options.tools.join(',')||'none');
    if(options.toolConfig)plan.launchCommand+=' --tool-config-b64 '+Buffer.from(JSON.stringify(options.toolConfig)).toString('base64url');
    if(agent==='codex'||agent==='claude'){
      const selected=new Set([...plan.tools,...plan.omitted.map(o=>o.id)]),contextReports=await this.validationReports(agent,billing.mode);
      plan.validation=contextReports.filter(r=>selected.has(r.id)).map(r=>this.store.retainValidation(report(r.id,r.version,r.gates.map(g=>g.id===4?gate(4,plan.ready&&plan.tools.includes(r.id)?'passed':'failed','boundary-check',plan.ready&&plan.tools.includes(r.id)?['This exact project plan passed schema, inherited configuration, compatibility, dependency and conflict checks.']:['This optimizer is blocked or omitted in the selected project plan.',...plan.errors,...plan.omitted.filter(o=>o.id===r.id).map(o=>o.reason)],[`Plan ${plan.fingerprint}; profile ${plan.profile} revision ${plan.profileRevision}`]):g.id===6?gate(6,'pending','unavailable',['Awaiting activation and successful activity from this new session, not another running session.']):g.id===7?gate(7,'unavailable','unavailable',['No controlled task-quality result exists for a not-yet-launched session.']):g),{kind:'project-plan',plan:plan.fingerprint,tool:r.id,validation:r.contextFingerprint})));
    }
    return {plan,projectPath:project.path};
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
    const input=parseBenchmark(value);const baseline=this.store.session(input.baselineSession),optimized=this.store.session(input.optimizedSession);
    if(!baseline||!optimized||!['exited','failed','abandoned'].includes(baseline.status)||!['exited','failed','abandoned'].includes(optimized.status))throw new ControlError('Choose two completed managed sessions.');
    return this.store.addComparison(compareSessions(input,baseline,optimized,this.store.accounting()));
  }
}
