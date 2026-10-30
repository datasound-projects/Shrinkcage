import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { parse } from 'smol-toml';
import { ControlPlane } from '../server/control/core.js';
import { ControlStore } from '../server/control/store.js';
import { accountSession, billingMode, estimateUsage, parseAccounting } from '../server/control/accounting.js';
import { compareSessions } from '../server/control/comparison.js';
import { OptimizerRegistry, optimizerRegistry } from '../server/control/optimizers/registry.js';
import { CATALOG } from '../server/control/catalog.js';
import { parseLaunchOptions } from '../server/control/schema.js';
import { prepareRuntime, receiptEvents } from '../server/control/runtime.js';
import { approvedTranscript, linkNativeSession, observeNativeUsage, sessionHookOverrides } from '../server/control/session-telemetry.js';
import { handleHook } from '../server/control/session-hook.js';
import { validateAgentArguments } from '../server/control/runner.js';
import { controlWrite } from '../server/control/api.js';
import { nativeMetrics } from '../server/control/telemetry.js';
import { fakeWorkspace, cli } from './control-fixtures.js';
import type { AccountingSettings, BillingMode, ManagedSession, OptimizationPlan, SessionUsage } from '../server/control/types.js';

const usage=(patch:Partial<SessionUsage>={}):SessionUsage=>({source:'native-session-record',observedAt:'2026-10-30T12:00:00Z',nativeSessionId:'fixture-native',model:'fixture-model',provider:null,inputTokens:1000,outputTokens:100,cachedTokens:200,cacheWriteTokens:100,reasoningTokens:50,totalTokens:1100,toolCalls:1,retries:null,errors:null,latencyMs:null,reportedCostUsd:null,measurement:'provider-reported',coverage:'complete-file',limitations:[],...patch});
const session=(patch:Partial<ManagedSession>={}):ManagedSession=>({schemaVersion:1,id:'a'.repeat(36),origin:'managed',project:{id:'f'.repeat(24),label:'Fixture'},agent:'codex',agentVersion:'0.165.0',profile:'baseline',profileRevision:0,planFingerprint:'f'.repeat(64),status:'exited',startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),heartbeatAt:new Date().toISOString(),exitCode:0,signal:null,plannedTools:[],appliedTools:[],evidence:[],diagnostics:[],elapsedMs:1000,toolActivity:[],metrics:[],billing:{mode:'api',nativeMode:'api',source:'native-status',checkedAt:'2026-10-30',limitations:[]},usage:usage(),...patch});
const settings:AccountingSettings={schemaVersion:1,prices:[{model:'fixture-model',input:2,output:8,cached:0.2,cacheWrite:2.5,source:'https://example.org/pricing',reviewedAt:'2026-10-30'}],monthlyApiBudgetUsd:10,subscriptionMonthlyFeeUsd:20};
async function plan(f:Awaited<ReturnType<typeof fakeWorkspace>>,agent:string,profile:string,billing:BillingMode,env=f.env){const r=await cli(['plan',agent,'--billing',billing,'--profile',profile,'--project',f.project,'--json'],env,f.project);assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout) as OptimizationPlan;}

test('versioned registry cannot promote imported guidance into execution; configuration is bounded',()=>{
  assert.equal(optimizerRegistry.list().length,8);assert.equal(optimizerRegistry.get('rtk')?.apiVersion,2);
  assert.ok(optimizerRegistry.validate('headroom','codex','subscription').length);
  assert.ok(optimizerRegistry.validate('context-mode','claude','api').length);
  assert.ok(optimizerRegistry.validate('absent','codex','api').length);
  assert.throws(()=>new OptimizerRegistry([CATALOG[0],CATALOG[0]]),/Duplicate/);
  assert.throws(()=>new OptimizerRegistry([{...CATALOG[0],id:'unreviewed'}]),/reviewed/);
  assert.deepEqual(parseLaunchOptions({tools:['serena'],toolConfig:{serena:{timeoutSeconds:30}}}).toolConfig,{serena:{timeoutSeconds:30}});
  for(const v of [{tools:['rtk','rtk']},{tools:['arbitrary']},{toolConfig:{rtk:{command:'malicious'}}},{toolConfig:{rtk:{timeoutSeconds:20}}},{toolConfig:{serena:{timeoutSeconds:121}}},{billing:'free'},{model:'../../private'},{model:'sk-proj-secret/credential'},{shell:'sh'}])assert.throws(()=>parseLaunchOptions(v));
});
test('billing and cache accounting never add reasoning or shared optimizer counters',()=>{
  for(const mode of ['subscription','api','hybrid','unknown'])assert.equal(billingMode(mode),mode);
  assert.throws(()=>billingMode('subscription-free'));
  assert.equal(estimateUsage(usage(),settings.prices[0]),0.00249);
  assert.equal(accountSession(session(),settings).apiEstimatedUsd,0.00249);
  const sub=accountSession(session({billing:{mode:'subscription',nativeMode:'subscription',source:'user-declared',checkedAt:'2026-10-30',limitations:[]}}),settings);
  assert.equal(sub.apiEstimatedUsd,null);assert.equal(sub.reportedCostUsd,null);assert.equal(sub.apiEquivalentUsd,0.00249);
  assert.equal(accountSession(session({billing:undefined}),settings).apiEstimatedUsd,null);
  for(const u of [usage({inputTokens:null}),usage({cachedTokens:1100}),usage({cacheWriteTokens:null}),usage({inputTokens:-1}),usage({outputTokens:0.5}),usage({coverage:'sampled-file'})])assert.equal(estimateUsage(u,settings.prices[0]),null);
  assert.equal(estimateUsage(usage(),{...settings.prices[0],cached:null}),null);
  assert.equal(estimateUsage(usage(),{...settings.prices[0],cacheWrite:null}),null);
  assert.equal(estimateUsage(usage({cachedTokens:0,cacheWriteTokens:0}),{...settings.prices[0],cached:null,cacheWrite:null}),0.0028);
  assert.equal(accountSession(session({usage:usage({model:'not-priced'})}),settings).apiEstimatedUsd,null);
  const withShared=session({metrics:[{metric:'rtk_saved',value:999999,unit:'tokens',scope:'shared',source:'fixture',observed_at:'2026-10-30',measurement_method:'estimate',confidence:'reported',coverage:'shared',source_version:null,is_estimate:true}]});
  assert.equal(accountSession(withShared,settings).apiEstimatedUsd,0.00249);
  assert.equal(estimateUsage(usage({modelCoverage:'mixed'}),settings.prices[0]),null);
  assert.equal(accountSession(session({model:'fixture-model',usage:usage({model:null})}),settings).apiEstimatedUsd,null);
  assert.equal(estimateUsage(usage({cacheWriteTokens:null,cacheWriteIncludedInInputRate:true}),settings.prices[0]),0.00244);
  assert.equal(accountSession(session({usage:usage({provider:'other'})}),{...settings,prices:[{...settings.prices[0],provider:'specific-provider'}]}).apiEstimatedUsd,null);
});
test('normalized telemetry separates reported, derived, measured and unavailable values',()=>{
  const s=session({usage:usage({measurement:'derived',cacheWriteTokens:null})}),metrics=nativeMetrics(s);
  assert.equal(metrics.find(m=>m.metric==='gen_ai.usage.input_tokens')?.classification,'derived');
  assert.equal(metrics.find(m=>m.metric==='gen_ai.usage.output_tokens')?.value,100);
  assert.equal(metrics.find(m=>m.metric==='cache_creation_input_tokens')?.value,null);
  assert.equal(metrics.find(m=>m.metric==='optimizer_overhead')?.classification,'unavailable');
  assert.equal(metrics.find(m=>m.metric==='managed_elapsed')?.classification,'measured');
  assert.ok(metrics.every(m=>m.scope==='process'&&m.session_id===s.id));
  assert.equal(nativeMetrics({...s,usage:{...s.usage!,stale:true}}).find(m=>m.metric==='gen_ai.usage.input_tokens')?.value,null);
});
test('price books reject secrets, aliases, missing rates and malformed values',()=>{
  assert.deepEqual(parseAccounting(settings),settings);
  for(const value of [{...settings,token:'secret'},{...settings,monthlyApiBudgetUsd:-1},{...settings,prices:[settings.prices[0],settings.prices[0]]},{...settings,prices:[{...settings.prices[0],input:null}]},{...settings,prices:[{...settings.prices[0],source:'http://localhost/private'}]},{...settings,prices:[{...settings.prices[0],reviewedAt:'not-a-date'}]}])assert.throws(()=>parseAccounting(value));
});
test('process hooks use agent-specific native rewrite contracts without changing permission policy',async()=>{
  const f=await fakeWorkspace();let runtime:Awaited<ReturnType<typeof prepareRuntime>>|undefined;
  try{
    for(const event of ['SessionStart','SessionEnd','PreToolUse']){const flags=sessionHookOverrides('codex',true),value=flags.find(s=>s.startsWith('hooks.'+event+'='))!;assert.ok(parse(value).hooks);}
    const plane=new ControlPlane({dataDir:f.data,env:f.env,home:f.home});const p=await plane.plan('codex','lean',{path:f.project});plane.close();
    assert.equal(p.plan.ready,true,p.plan.errors.join('; '));const id='b'.repeat(36),token='c'.repeat(64);runtime=await prepareRuntime(f.data,id,token,['rtk'],p.plan.binaryFingerprints);
    const env={...f.env,SHRINKCAGE_SESSION_ID:id,SHRINKCAGE_SESSION_TOKEN:token,SHRINKCAGE_AGENT:'codex',SHRINKCAGE_PROJECT_ROOT:f.project};
    const output=await handleHook('rtk',{hook_event_name:'PreToolUse',tool_name:'Bash',permission_mode:'default',tool_input:{command:'git status',secret:'PRIVATE_PAYLOAD'}},env) as {hookSpecificOutput:Record<string,unknown>};
    assert.deepEqual(output,{hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'allow',updatedInput:{command:'rtk git status',secret:'PRIVATE_PAYLOAD'}}});
    assert.equal(sessionHookOverrides('codex',true).some(s=>s.includes('PermissionRequest')),false);const claude=await handleHook('rtk',{tool_input:{command:'git status',timeout:1234}},{...env,SHRINKCAGE_AGENT:'claude'}) as {hookSpecificOutput:Record<string,unknown>};assert.equal(Object.hasOwn(claude.hookSpecificOutput,'permissionDecision'),false);assert.deepEqual(claude.hookSpecificOutput.updatedInput,{command:'rtk git status',timeout:1234});assert.equal((await receiptEvents(runtime.path)).length,2);
    assert.ok(!(await readFile(join(runtime.path,'events.jsonl'),'utf8')).includes('PRIVATE_PAYLOAD'));
    assert.equal(await handleHook('rtk',{}, {...env,SHRINKCAGE_SESSION_TOKEN:'bad'}),null);
  }finally{await runtime?.close();await f.close();}
});
test('subscription/API paths for both real managed launchers correlate native identity without project config writes',async()=>{
  const f=await fakeWorkspace();try{
    const price=join(f.root,'prices.json');await writeFile(price,JSON.stringify(settings));assert.equal((await cli(['accounting','import',price],f.env,f.project)).code,0);
    for(const agent of ['codex','claude'])for(const billing of ['subscription','api'] as const){
      const capture=join(f.root,agent+'-'+billing+'.json'),env={...f.env,FIXTURE_BILLING:billing,FIXTURE_NATIVE_USAGE:'1',FIXTURE_CAPTURE:capture};
      const p=await plan(f,agent,'lean',billing,env);assert.equal(p.isolation?.rtk,'process');
      const run=await cli(['run',agent,'--billing',billing,'--profile','lean','--project',f.project,'--approve',p.fingerprint],env,f.project);assert.equal(run.code,0,run.stderr);
      const state=new ControlStore(f.data);try{const s=state.sessions()[0];assert.equal(s.agent,agent);assert.equal(s.billing?.mode,billing);assert.equal(s.billing?.source,'user-declared');assert.equal(s.usage?.inputTokens,1000,JSON.stringify(s.diagnostics));assert.equal(s.usage?.outputTokens,100);assert.equal(s.usage?.nativeSessionId,s.id);assert.ok(s.evidence.some(e=>e.tool==='rtk'&&e.status==='usage_observed'));assert.equal(s.usage?.reportedCostUsd,null);
        const a=accountSession(s,state.accounting());assert.equal(billing==='api'?a.apiEquivalentUsd:a.apiEstimatedUsd,null);
        const exported=await cli(['sessions','show',s.id],f.env,f.project);assert.equal(exported.code,0);assert.ok(!exported.stdout.includes('PRIVATE_'));
      }finally{state.close();}
      const launch=JSON.parse(await readFile(capture,'utf8'));assert.equal(launch.cwd,f.project);assert.ok(launch.args.includes(agent==='codex'?'--no-daemon':'--strict-mcp-config'));
    }
    await assert.rejects(lstat(join(f.project,'.codex')));await assert.rejects(lstat(join(f.project,'.claude')));
  }finally{await f.close();}
});
test('native billing contradictions and subscription gateway requests fail independently',async()=>{
  const f=await fakeWorkspace();try{
    const env={...f.env,FIXTURE_BILLING:'subscription'};
    const p=await plan(f,'codex','balanced','subscription',env);assert.ok(!p.tools.includes('headroom'));assert.match(p.omitted.find(o=>o.id==='headroom')!.reason,/API-only/);
    const conflict=await cli(['plan','codex','--billing','api','--profile','lean','--project',f.project,'--json'],env,f.project);assert.equal(conflict.code,2);assert.match(JSON.parse(conflict.stdout).errors.join(' '),/conflicts with native/);
    const old=await cli(['plan','claude','--billing','subscription','--profile','lean','--project',f.project,'--json'],{...env,FIXTURE_CLAUDE_VERSION:'0.2.29'},f.project);assert.equal(old.code,2);assert.match(JSON.parse(old.stdout).errors.join(' '),/version/);
  }finally{await f.close();}
});
test('concurrent sessions in one project retain independent stacks and durable pending edits',async()=>{
  const f=await fakeWorkspace();try{
    const env={...f.env,FIXTURE_NATIVE_USAGE:'1',FIXTURE_DELAY_MS:'2000'};
    const baseline=await plan(f,'codex','baseline','api',env),lean=await plan(f,'claude','lean','api',env);
    const running=Promise.all([cli(['run','codex','--billing','api','--profile','baseline','--project',f.project,'--approve',baseline.fingerprint],env,f.project),cli(['run','claude','--billing','api','--profile','lean','--project',f.project,'--approve',lean.fingerprint],env,f.project)]);
    const store=new ControlStore(f.data);try{
      let active:ManagedSession[]=[];for(let i=0;i<150;i++){active=store.sessions().filter(s=>['running','starting'].includes(s.status));if(active.length===2)break;await new Promise(r=>setTimeout(r,40));}
      assert.equal(active.length,2);assert.equal(new Set(active.map(s=>s.id)).size,2);assert.equal(active.find(s=>s.agent==='codex')?.plannedTools.length,0);assert.deepEqual(active.find(s=>s.agent==='claude')?.plannedTools,['rtk']);
      const target=active.find(s=>s.agent==='claude')!;const pending=store.setSessionPreference(target.id,{tools:[]});assert.equal(pending.state,'requires-restart');
      assert.ok((await running).every(r=>r.code===0));assert.deepEqual(store.session(target.id)?.pending?.tools,[]);assert.deepEqual(store.session(target.id)?.plannedTools,['rtk']);
      assert.equal(store.sessions().filter(s=>s.usage).length,2);store.clearSessionPreference(target.id);assert.equal(store.session(target.id)?.pending,undefined);
    }finally{store.close();await running;}
  }finally{await f.close();}
});
test('native transcript links reject wrong projects, identities, secrets and symlinks',async()=>{
  const f=await fakeWorkspace();const id='d'.repeat(36),token='e'.repeat(64),runtime=await prepareRuntime(f.data,id,token,[]);try{
    const root=join(f.home,'.codex','sessions');await mkdir(root,{recursive:true});const path=join(root,'fixture.jsonl');
    const meta={type:'session_meta',payload:{id,cwd:f.project},timestamp:new Date().toISOString()};
    await writeFile(path,[meta,{type:'turn_context',payload:{model:'fixture-model'}},{type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:4,output_tokens:2,cached_input_tokens:1,total_tokens:6}}}},{type:'user',text:'PRIVATE_PROMPT'}].map(v=>JSON.stringify(v)).join('\n'));
    const env={...f.env,SHRINKCAGE_AGENT:'codex',SHRINKCAGE_PROJECT_ROOT:f.project,SHRINKCAGE_SESSION_ID:id,SHRINKCAGE_SESSION_TOKEN:token};
    await linkNativeSession({session_id:id,transcript_path:path,cwd:f.project},env);const observed=await observeNativeUsage(runtime.path,'codex',f.project,env);assert.equal(observed?.inputTokens,4);assert.ok(!JSON.stringify(observed).includes('PRIVATE_PROMPT'));assert.equal(await observeNativeUsage(runtime.path,'codex',f.root,env),null);
    const outside=join(f.root,'outside.jsonl');await writeFile(outside,JSON.stringify(meta));assert.equal(await approvedTranscript(outside,'codex',env),null);
    if(process.platform!=='win32'){const alias=join(root,'alias.jsonl');await symlink(outside,alias);assert.equal(await approvedTranscript(alias,'codex',env),null);}
    await writeFile(path,JSON.stringify({...meta,payload:{id:'wrong',cwd:f.project}}));assert.equal(await observeNativeUsage(runtime.path,'codex',f.project,env),null);
    await writeFile(path,[meta,{type:'turn_context',payload:{model:'first-model'}},{type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:3,output_tokens:1,cached_input_tokens:0}}}},{type:'turn_context',payload:{model:'second-model'}},{type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:8,output_tokens:2,cached_input_tokens:0}}}}].map(v=>JSON.stringify(v)).join('\n'));
    const mixed=await observeNativeUsage(runtime.path,'codex',f.project,env);assert.equal(mixed?.modelCoverage,'mixed');assert.equal(mixed?.model,null);assert.equal(mixed?.inputTokens,8);assert.equal(estimateUsage(mixed,settings.prices[0]),null);
  }finally{await runtime.close();await f.close();}
});
test('experiments expose descriptive differences and reject unrelated causal claims',()=>{
  const input={schemaVersion:1 as const,baselineSession:'a'.repeat(36),optimizedSession:'b'.repeat(36),taskLabel:'Fixture',sameTask:true,sameGitState:true,sameModel:true,sameEffort:true,sameCaching:true,quality:'passed' as const};
  const baseline=session(),optimized=session({id:'b'.repeat(36),profile:'lean',usage:usage({inputTokens:800}),elapsedMs:900,evidence:[{tool:'rtk',status:'usage_observed',source:'owned fixture',observedAt:'2026-10-30',scope:'process',confidence:'verified',agentVersion:'0.165.0',toolVersion:'1.1.0',limitations:[]}]});
  const result=compareSessions(input,baseline,optimized,settings);assert.equal(result.eligible,true);assert.equal(result.usageDifference?.inputTokens,-200);assert.equal(result.elapsedDifferenceMs,-100);assert.match(result.conclusion,/not proof/);
  assert.equal(compareSessions({...input,sameCaching:false},baseline,optimized,settings).eligible,false);
  assert.equal(compareSessions(input,baseline,{...optimized,usage:usage({model:'unrelated'})},settings).eligible,false);
  assert.equal(compareSessions({...input,quality:'failed'},baseline,optimized,settings).eligible,false);
});
test('additive v1 migration preserves legacy launchers, session bytes and bounded history paging',async()=>{
  const f=await fakeWorkspace();try{
    let store=new ControlStore(f.data);const original=session({id:randomUUID()});store.createSession(original,'owner-token');store.close();
    const path=join(f.data,'control','state.sqlite'),old=new DatabaseSync(path);old.exec('DROP TABLE session_preferences; DROP TABLE settings;');assert.equal(old.prepare('PRAGMA user_version').get()!.user_version,1);old.close();
    store=new ControlStore(f.data);try{
      const legacyReader=new DatabaseSync(path,{readOnly:true});try{assert.equal(legacyReader.prepare('PRAGMA user_version').get()!.user_version,1);assert.equal(legacyReader.prepare('SELECT value FROM sessions WHERE id=?').get(original.id)!.value,JSON.stringify(original));}finally{legacyReader.close();}
      for(let i=0;i<55;i++)store.createSession(session({id:randomUUID(),status:i===0?'running':'exited'}),'token');
      assert.equal(store.sessionCount(),56);assert.equal(store.activeCount(),1);assert.equal(store.sessions(50,20).length,6);
      assert.throws(()=>store.sessions(-1,50));assert.throws(()=>store.sessions(0,201));assert.throws(()=>store.sessions(2001,50));
    }finally{store.close();}
  }finally{await f.close();}
});
test('new browser control routes only edit validated metadata and prepare plans',async()=>{
  const f=await fakeWorkspace();const plane=new ControlPlane({dataDir:f.data,env:f.env,home:f.home});try{
    const project=await plane.project({path:f.project}),s=session({id:randomUUID(),project:project.ref});plane.store.createSession(s,'token');
    const configured=await controlWrite(plane,'/api/control/v1/sessions/configure',{id:s.id,options:{tools:['rtk']},approved:true}) as {state:string};assert.equal(configured.state,'requires-restart');assert.deepEqual(plane.store.session(s.id)?.plannedTools,[]);
    await assert.rejects(controlWrite(plane,'/api/control/v1/sessions/configure',{id:s.id,options:{tools:['rtk'],shell:'PRIVATE_COMMAND'},approved:true}));
    await assert.rejects(controlWrite(plane,'/api/control/v1/accounting',{settings,approved:false}));
    await controlWrite(plane,'/api/control/v1/accounting',{settings,approved:true});assert.deepEqual(plane.store.accounting(),settings);
    const page=await controlWrite(plane,'/api/control/v1/sessions/page',{offset:0,limit:50,approved:true}) as {items:ManagedSession[];total:number};assert.equal(page.total,1);assert.equal(page.items[0].id,s.id);
    const plan=await controlWrite(plane,'/api/control/v1/sessions/plan',{id:s.id,approved:true}) as OptimizationPlan;assert.equal(plan.ready,true);assert.deepEqual(plan.tools,['rtk']);
    await controlWrite(plane,'/api/control/v1/sessions/discard',{id:s.id,approved:true});assert.equal(plane.store.session(s.id)?.pending,undefined);
    await assert.rejects(controlWrite(plane,'/api/control/v1/run',{command:'PRIVATE_COMMAND',approved:true}));
  }finally{plane.close();await f.close();}
});
test('partial or credential-shaped native metadata cannot become a complete cost',async()=>{
  const f=await fakeWorkspace(),id=randomUUID(),token='f'.repeat(64),runtime=await prepareRuntime(f.data,id,token,[]);try{
    const root=join(f.home,'.codex','sessions');await mkdir(root,{recursive:true});const path=join(root,id+'.jsonl'),env={...f.env,SHRINKCAGE_AGENT:'codex',SHRINKCAGE_PROJECT_ROOT:f.project,SHRINKCAGE_SESSION_ID:id,SHRINKCAGE_SESSION_TOKEN:token};
    await linkNativeSession({session_id:id,transcript_path:path,cwd:f.project},env);assert.equal(await observeNativeUsage(runtime.path,'codex',f.project,env),null);
    const records=[{type:'session_meta',payload:{id,cwd:f.project}},{type:'turn_context',payload:{model:'sk-'+'proj-'+'PRIVATE_CREDENTIAL_123456'}},{type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:10,output_tokens:2,cached_input_tokens:0}}}}];
    await writeFile(path,records.map(r=>JSON.stringify(r)).join('\n')+'\n{broken');const observed=await observeNativeUsage(runtime.path,'codex',f.project,env);assert.equal(observed?.coverage,'sampled-file');assert.equal(observed?.model,null);assert.ok(!JSON.stringify(observed).includes('PRIVATE_CREDENTIAL'));assert.equal(estimateUsage(observed,settings.prices[0]),null);
    assert.equal(estimateUsage(usage({stale:true}),settings.prices[0]),null);
  }finally{await runtime.close();await f.close();}
});
test('managed arguments cannot replace approved hook, billing or session scope',async()=>{
  const f=await fakeWorkspace(),plane=new ControlPlane({dataDir:f.data,env:f.env,home:f.home});try{
    const {plan:baseline}=await plane.plan('codex','baseline',{path:f.project},{billing:'api',model:'fixture-model'});
    for(const args of [['--cwd','elsewhere'],['resume','old'],['--config','model_provider="gateway"'],['--config','hooks.PreToolUse=[]'],['--config','model="different"']])assert.throws(()=>validateAgentArguments(args,baseline));
    validateAgentArguments(['--sandbox','read-only','--','normal prompt'],baseline);
    const {plan:claude}=await plane.plan('claude','lean',{path:f.project},{billing:'api'});
    for(const args of [['--session-id','other'],['--settings','{}'],['--setting-sources','user'],['--mcp-config','{}'],['--continue'],['--background'],['--cwd=elsewhere']])assert.throws(()=>validateAgentArguments(args,claude));
    validateAgentArguments(['-p','fixture prompt'],claude);
  }finally{plane.close();await f.close();}
});
