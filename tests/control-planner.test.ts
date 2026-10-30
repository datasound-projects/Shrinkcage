import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../server/control/catalog.js';
import { composePlan, resolveComposition, versionCompatible } from '../server/control/planner.js';
import { DEFAULT_PROFILES } from '../server/control/profiles.js';
import { object, parseManifest, parseProfile, parseBenchmark, stable } from '../server/control/schema.js';
import type { ConfigFacts, Detection, OptimizerManifest, SavedProfile } from '../server/control/types.js';

const config=():ConfigFacts=>({digests:{'user/config.toml':'absent'},errors:[],rtkHooks:1,headroomHooks:0,memoryHooks:0,serenaEntries:0,reservedMcp:false,ownedRtk:true,baselineConfounders:[]});
const detections=():Detection[]=>CATALOG.map(m=>({id:m.id as Detection['id'],installed:true,version:m.minVersion,compatible:m.mode==='managed',configured:null,serviceHealthy:m.id==='headroom'?true:null,agentConnected:null,effective:null,usageObserved:null,status:'installed',checkedAt:'2026-01-01T00:00:00Z',binaryFingerprint:m.id,evidence:[],diagnostics:[]}));
const agent={id:'codex' as const,installed:true,version:'0.165.0',compatible:true,binaryFingerprint:'codex'};
const project={id:'a'.repeat(24),label:'Fixture'};
const balanced=()=>structuredClone(DEFAULT_PROFILES.find(p=>p.profile.id==='balanced')!);
const plan=(profile=balanced(),facts=config(),tools=detections(),platform=process.platform)=>composePlan({profile,project,agent,detections:tools,config:facts,platform});
const manifest=(id:string,dependencies:string[]=[],extra:Partial<OptimizerManifest>={}):OptimizerManifest=>({...CATALOG[0],id,dependencies,conflicts:[],...extra});

test('T02 strict profile schemas reject executable payloads, duplicates and unavailable counters',()=>{
  const valid=balanced().profile;assert.deepEqual(parseProfile(valid),valid);
  for(const value of [null,[],{...valid,command:'echo secret'},{...valid,schemaVersion:99},{...valid,id:'../escape'},{...valid,agent:'unknown'},{...valid,scope:'user'},{...valid,fallback:'silent'},{...valid,tools:[valid.tools[0],valid.tools[0]]},{...valid,tools:[{id:'custom',required:true,priority:0}]},{...valid,tools:[{id:'rtk',required:'true',priority:0}]},{...valid,tools:[{id:'rtk',required:true,priority:101}]},{...valid,name:'private/path'},{...valid,name:'<script>'},{...valid,description:'x'.repeat(241)},{...valid,id:'baseline'}])assert.throws(()=>parseProfile(value));
  assert.throws(()=>object(JSON.parse('{"__proto__":{}}'),['__proto__']));
  assert.equal(parseProfile({...valid,description:''}).description,'');
  assert.equal(stable({b:1,a:[null,true]}),stable({a:[null,true],b:1}));
});
test('T02 untrusted manifests are non-executable and cannot claim reserved IDs or capabilities',()=>{
  const source={...CATALOG[5],id:'example',mode:'guided',minVersion:null,maxMajor:null,restartRequired:false};
  assert.equal(parseManifest(source).mode,'guided');
  for(const value of [{...source,command:['sh','-c','x']},{...source,mode:'managed'},{...source,id:'rtk'},{...source,source:'http://127.0.0.1:1'},{...source,dependencies:['rtk']},{...source,agents:['custom']},{...source,platforms:['unknown']},{...source,layers:'bad'},{...source,layers:Array(13).fill('layer')},{...source,layers:['x'.repeat(161)]},{...source,permissions:Array(1000).fill('x'.repeat(200))},{...source,source:'https://example.org/'.repeat(100)}])assert.throws(()=>parseManifest(value));
});
test('T04 version boundaries and prerelease ambiguity fail closed',()=>{
  for(const [version,min,max,result] of [['1.1.0','1.1.0',1,true],['1.1.1','1.1.0',1,true],['1.2.0','1.1.0',1,true],['1.0.9','1.1.0',1,false],['2.0.0','1.1.0',1,false],['0.43.0','0.42.0',0,false],['0.42.1','0.42.0',0,true],['1.0','1.1.0',1,false],['1.1.0-beta','1.1.0',1,false],[null,'1.1.0',1,false],['1.1.0',null,1,false],['1.1.0','bad',null,false],['2.0.0','1.1.0',null,true]] as const)assert.equal(versionCompatible(version,min,max),result);
});
test('T04 dependency DAG is deterministic under permutations, priorities and mandatory propagation',()=>{
  const catalog=[manifest('a',['b']),manifest('b',['c']),manifest('c')];
  const selected=[{id:'a',priority:20,required:true},{id:'c',priority:90,required:false}];
  const expected=resolveComposition(selected,catalog);assert.deepEqual(expected.order,['c','b','a']);assert.equal(expected.required.c,true);
  for(let i=0;i<120;i++)assert.deepEqual(resolveComposition(i%2?[...selected].reverse():selected,i%3?[...catalog].reverse():catalog),expected);
  assert.equal(resolveComposition([{id:'a',priority:1,required:false},{id:'b',priority:2,required:false}],catalog).required.c,false);
  assert.deepEqual(resolveComposition([{id:'x',priority:0,required:true}],catalog).order,[]);
  assert.ok(resolveComposition([{id:'a',priority:0,required:true}],[manifest('a',['x'])]).errors.length);
});
test('T04 cycles, symmetric conflicts and exclusive proxy routes are detected before launch',()=>{
  assert.match(resolveComposition([{id:'a',priority:1,required:true}],[manifest('a',['b']),manifest('b',['a'])]).errors.join(' '),/cycle/);
  for(const catalog of [[manifest('a',[],{conflicts:['b']}),manifest('b')],[manifest('a'),manifest('b',[],{conflicts:['a']})],[manifest('a',[],{exclusive:'route'}),manifest('b',[],{exclusive:'route'})]])assert.match(resolveComposition([{id:'a',priority:1,required:false},{id:'b',priority:1,required:false}],catalog).errors.join(' '),/Conflicting/);
  const profile=balanced();profile.profile.tools.push({id:'litellm',required:false,priority:0});assert.equal(plan(profile).ready,false);
});
test('T04 complete plans cover activation, evidence, scoped ownership and fingerprint approval',()=>{
  const p=plan();assert.equal(p.ready,true);assert.deepEqual(p.tools,['rtk','serena','headroom']);assert.equal(p.actions.length,12);assert.match(p.launchCommand,/--approve [a-f0-9]{64}$/);assert.ok(p.warnings.some(s=>s.includes('embedded mode')));
  const later=detections().map(d=>({...d,checkedAt:'2099-01-01',evidence:[{tool:d.id,status:'installed' as const,scope:'shared' as const,observedAt:'2099-01-01',source:'test',confidence:'reported' as const,agentVersion:null,toolVersion:d.version,limitations:[]}]}));
  assert.equal(p.fingerprint,plan(balanced(),config(),later).fingerprint);
  assert.notEqual(p.fingerprint,plan({...balanced(),revision:2}).fingerprint);
  const changed=config();changed.digests['user/config.toml']='modified';assert.notEqual(p.fingerprint,plan(balanced(),changed).fingerprint);
});
test('T04 unavailable optional tools have explicit omissions; required or blocked fallback fails',()=>{
  const variants=[{id:'rtk',patch:{installed:false}},{id:'serena',patch:{compatible:false}},{id:'headroom',patch:{serviceHealthy:false}}] as const;
  for(const v of variants){const tools=detections().map(d=>d.id===v.id?{...d,...v.patch}:d);const p=plan(balanced(),config(),tools);assert.equal(p.ready,true);assert.equal(p.omitted[0].id,v.id);const required=balanced();required.profile.tools.forEach(t=>{if(t.id===v.id)t.required=true;});assert.equal(plan(required,config(),tools).ready,false);const blocked=balanced();blocked.profile.fallback='block';assert.equal(plan(blocked,config(),tools).ready,false);}
  const facts=config();facts.rtkHooks=0;assert.match(plan(balanced(),facts).omitted[0].reason,/not configured/);
  assert.equal(plan(DEFAULT_PROFILES.find(p=>p.profile.id==='memory')!).omitted.some(t=>t.id==='codemem'),true);
});
test('T04 agent, OS and dependency restrictions do not get misreported as active',()=>{
  const profile=balanced();profile.profile.agent='claude';const p=composePlan({profile,project,agent:{...agent,id:'claude'},config:config(),detections:detections(),platform:'win32'});assert.equal(p.ready,false);assert.equal(p.tools.length,0);
  assert.equal(composePlan({profile,project,agent,config:config(),detections:[],platform:'linux'}).ready,false);
  assert.equal(composePlan({profile:balanced(),project,agent:{...agent,installed:false,compatible:false},config:config(),detections:detections(),platform:'linux'}).ready,false);
  const constrained=CATALOG.map(m=>m.id==='rtk'?{...m,platforms:[]}:m);assert.ok(composePlan({profile:balanced(),project,agent,config:config(),detections:detections(),platform:'linux',catalog:constrained}).omitted.some(t=>t.id==='rtk'));
  const deps=CATALOG.map(m=>m.id==='serena'?{...m,dependencies:['rtk']}:m);const facts=config();facts.rtkHooks=0;assert.ok(composePlan({profile:balanced(),project,agent,config:facts,detections:detections(),platform:'linux',catalog:deps}).omitted.some(t=>t.reason.includes('dependency')));
});
test('T04 duplicate hooks, memory capture, MCP collisions and malformed config are surfaced',()=>{
  for(const patch of [{rtkHooks:2},{reservedMcp:true},{errors:['Malformed config']}])assert.equal(plan(balanced(),{...config(),...patch}).ready,false);
  const existing=plan(balanced(),{...config(),serenaEntries:1,replaceSerenaEntry:true,headroomEntries:1,replaceHeadroomEntry:true,headroomHooks:1});assert.equal(existing.ready,true);assert.deepEqual(existing.shadowedMcp,['serena','headroom']);assert.ok(existing.warnings.some(w=>w.includes('disabled only for this new process')));
  const unknown=plan(balanced(),{...config(),serenaEntries:2,headroomEntries:1});assert.ok(unknown.omitted.some(t=>t.id==='serena'));assert.ok(unknown.omitted.some(t=>t.id==='headroom'));
  assert.ok(plan(balanced(),{...config(),hooksDisabled:true}).omitted.some(t=>t.id==='rtk'));
  const facts=config();facts.memoryHooks=1;facts.baselineConfounders=['External hooks'];assert.ok(plan(balanced(),facts).warnings.some(w=>w.includes('capture content')));
  const baseline=plan(DEFAULT_PROFILES[0]);assert.deepEqual(baseline.tools,[]);assert.ok(baseline.warnings.some(w=>w.includes('Baseline means')));
});
test('T20 comparison metadata cannot supply fabricated savings or causal claims',()=>{
  const base={schemaVersion:1,baselineSession:'a'.repeat(36),optimizedSession:'b'.repeat(36),taskLabel:'Task fixture',sameTask:true,sameGitState:true,sameModel:false,sameEffort:false,quality:'not-reviewed'};
  assert.equal(parseBenchmark(base).taskLabel,'Task fixture');for(const bad of [{...base,saved:100},{...base,quality:'perfect'},{...base,sameTask:'yes'},{...base,optimizedSession:base.baselineSession},{...base,baselineSession:'../x'}])assert.throws(()=>parseBenchmark(bad));
});
