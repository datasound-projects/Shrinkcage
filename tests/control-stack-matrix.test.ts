import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {CATALOG} from '../server/control/catalog.js';
import {composePlan} from '../server/control/planner.js';
import {ControlStore} from '../server/control/store.js';
import {accountSession} from '../server/control/accounting.js';
import {fakeWorkspace,cli} from './control-fixtures.js';
import type {BillingMode,ConfigFacts,Detection,SavedProfile,ToolId} from '../server/control/types.js';
const tools:ToolId[]=['rtk','serena','headroom'];
const subset=(mask:number)=>tools.filter((_,bit)=>mask&(1<<bit));
const config:ConfigFacts={digests:{},errors:[],rtkHooks:0,headroomHooks:0,memoryHooks:0,serenaEntries:0,reservedMcp:false,ownedRtk:false,baselineConfounders:[]};
test('192 platform, agent, billing and optimizer combinations enforce supported process isolation',()=>{let checked=0;for(const platform of ['darwin','linux','win32'])for(const agent of ['codex','claude'] as const)for(const mode of ['subscription','api','unknown','hybrid'] as BillingMode[])for(let mask=0;mask<8;mask++){
  const selected=subset(mask),profile:SavedProfile={profile:{schemaVersion:1,id:'matrix',name:'Matrix',description:'Fixture',agent,scope:'process',fallback:'block',tools:selected.map((id,i)=>({id,required:true,priority:100-i}))},revision:1,builtin:false};
  const detections:Detection[]=CATALOG.map(t=>({id:t.id,installed:true,version:t.minVersion,compatible:t.mode==='managed',configured:null,serviceHealthy:t.id==='headroom'?true:null,agentConnected:null,effective:null,usageObserved:null,status:'installed',checkedAt:'2026-10-31',binaryFingerprint:t.id,evidence:[],diagnostics:[]}));
  const before=JSON.stringify({profile,config,detections}),plan=composePlan({profile,project:{id:'f'.repeat(24),label:'Fixture'},agent:{id:agent,installed:true,version:agent==='codex'?'0.165.0':'2.1.118',compatible:true,binaryFingerprint:agent},detections,config,platform,billing:{mode,nativeMode:mode,source:'user-declared',checkedAt:'2026-10-31',limitations:[]}});
  const allowed=!selected.includes('headroom')||agent==='codex'&&mode==='api';assert.equal(plan.ready,allowed,`${platform}/${agent}/${mode}/${selected}`);if(allowed){assert.deepEqual(new Set(plan.tools),new Set(selected));assert.ok(plan.actions.every(a=>a.scope==='process'));}else assert.ok(plan.errors.length);assert.equal(JSON.stringify({profile,config,detections}),before);checked++;
}assert.equal(checked,192);});

test('all twenty supported Codex/Claude API/subscription stacks launch, report usage and clean up independently',{timeout:300000},async()=>{const f=await fakeWorkspace();try{let launched=0;for(const agent of ['codex','claude'] as const)for(const billing of ['api','subscription'] as const)for(let mask=0;mask<8;mask++){
  const selected=subset(mask);if(selected.includes('headroom')&&(agent!=='codex'||billing!=='api'))continue;
  const capture=join(f.root,'matrix-capture.json'),env={...f.env,FIXTURE_BILLING:billing,FIXTURE_NATIVE_USAGE:'1',FIXTURE_CAPTURE:capture},args=[agent,'--profile','custom','--billing',billing,'--project',f.project,'--tools',selected.join(',')||'none'];
  const preview=await cli(['plan',...args,'--json'],env,f.project);assert.equal(preview.code,0,preview.stderr);const plan=JSON.parse(preview.stdout);assert.deepEqual(new Set(plan.tools),new Set(selected));const run=await cli(['run',...args,'--approve',plan.fingerprint],env,f.project);assert.equal(run.code,0,`${agent}/${billing}/${selected}: ${run.stderr}`);
  const store=new ControlStore(f.data);try{const session=store.sessions()[0];assert.equal(session.status,'exited');assert.equal(session.agent,agent);assert.equal(session.billing?.mode,billing);assert.deepEqual(new Set(session.appliedTools),new Set(selected));assert.equal(session.evidence.length,selected.length);assert.ok(session.evidence.every(e=>e.status==='usage_observed'));assert.equal(session.usage?.coverage,'complete-file');assert.equal(session.usage?.inputTokens,1000);assert.equal(session.usage?.outputTokens,100);assert.equal(session.usage?.cachedTokens,200);assert.ok(!JSON.stringify(session).includes('PRIVATE_'));const priced=accountSession(session,{schemaVersion:1,monthlyApiBudgetUsd:null,subscriptionMonthlyFeeUsd:null,prices:[{model:'fixture-model',input:2,output:8,cached:.2,cacheWrite:2.5,source:'https://example.org/pricing',reviewedAt:'2026-10-31'}]});const expected=agent==='codex'?.00244:.00249;assert.ok(Math.abs((billing==='api'?priced.apiEstimatedUsd:priced.apiEquivalentUsd)!-expected)<1e-12);assert.equal(billing==='api'?priced.apiEquivalentUsd:priced.apiEstimatedUsd,null);launched++;assert.equal(store.sessionCount(),launched);}finally{store.close();}
  const invocation=JSON.parse(await readFile(capture,'utf8'));assert.equal(invocation.cwd,f.project);assert.ok(!invocation.args.some((a:string)=>a==='--dangerously-skip-permissions'||a==='--dangerously-bypass-approvals-and-sandbox'||a==='--dangerously-bypass-hook-trust'));await assert.rejects(lstat(join(f.project,'.codex')));await assert.rejects(lstat(join(f.project,'.claude')));
}assert.equal(launched,20);}finally{await f.close();}});
