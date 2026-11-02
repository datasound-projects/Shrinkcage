import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ControlPlane} from '../server/control/core.js';
import {CATALOG} from '../server/control/catalog.js';
import {detectTool} from '../server/control/probe.js';
import {toolCompatibility} from '../server/control/compatibility.js';
import {builtinValidation} from '../server/control/sdk/validation.js';
import {recommendStack} from '../server/control/sdk/recommendations.js';
import {headroomEnvironment,mergeClaudeOverrides,runManaged} from '../server/control/runner.js';
import {ControlStore} from '../server/control/store.js';
import {fakeWorkspace,cli} from './control-fixtures.js';

test('Headroom subscription/API capability checks agree across both agents, recommendations and proxy failures',async()=>{
  const f=await fakeWorkspace();try{
    const detection=await detectTool('headroom',f.env),manifest=CATALOG.find(t=>t.id==='headroom')!;
    assert.equal(detection.compressionEnabled,true);assert.deepEqual(detection.agentSupport,{codex:true,claude:true});
    for(const agent of ['codex','claude'] as const)for(const billing of ['subscription','api','unknown','hybrid'] as const){
      assert.equal(toolCompatibility(manifest,detection,{agent,billing}),null);
      assert.equal(builtinValidation(manifest,detection,{agent,billing}).canActivate,true);
      const offline=builtinValidation(manifest,{...detection,serviceHealthy:false},{agent,billing});assert.equal(offline.canActivate,false);assert.equal(offline.gates.find(g=>g.id===2)?.status,'passed');assert.equal(offline.gates.find(g=>g.id===4)?.status,'failed');
      assert.ok(recommendStack([manifest],[detection],{agent,billing,intent:'balanced'}).tools.includes('headroom'));
      assert.match(toolCompatibility(manifest,{...detection,serviceHealthy:false},{agent,billing})!,/offline/);
      assert.match(toolCompatibility(manifest,{...detection,compressionEnabled:false},{agent,billing})!,/compression disabled/);
    }
    const partial=await detectTool('headroom',{...f.env,FIXTURE_HEADROOM_NO_WRAPPER:'1'});
    assert.equal(partial.compatible,true);assert.deepEqual(partial.agentSupport,{codex:false,claude:true});
    assert.ok(toolCompatibility(manifest,partial,{agent:'codex',billing:'subscription'}));
    assert.equal(toolCompatibility(manifest,partial,{agent:'claude',billing:'subscription'}),null);
    for(const patch of [{FIXTURE_HEADROOM_NO_MCP:'1'},{FIXTURE_HEADROOM_VERSION:'0.43.0'},{FIXTURE_HEADROOM_VERSION:'malformed'}])assert.equal((await detectTool('headroom',{...f.env,...patch})).compatible,false);
  }finally{await f.close();}
});

test('Claude routing, telemetry and RTK hooks merge into one process setting without losing approvals or MCP scope',()=>{
  const hooks={PreToolUse:[{hooks:[{command:'trusted-native-hook'}]}],SessionStart:[{hooks:[{command:'trusted-identity-hook'}]}]};
  const args=mergeClaudeOverrides(['--settings',JSON.stringify({hooks}),'--mcp-config',JSON.stringify({mcpServers:{one:{command:'trusted-relay'}}}),'--settings',JSON.stringify({env:{ANTHROPIC_BASE_URL:'http://127.0.0.1:18787'}}),'--settings',JSON.stringify({hooks:{PreToolUse:[{hooks:[{command:'second-native-hook'}]}]}})]);
  assert.equal(args.filter(a=>a==='--settings').length,1);assert.equal(args.filter(a=>a==='--mcp-config').length,1);assert.ok(args.includes('--strict-mcp-config'));
  const settings=JSON.parse(args[args.indexOf('--settings')+1]);assert.equal(settings.hooks.PreToolUse.length,2);assert.deepEqual(settings.hooks.SessionStart,hooks.SessionStart);assert.equal(settings.env.ANTHROPIC_BASE_URL,'http://127.0.0.1:18787');
  assert.deepEqual(JSON.parse(args[args.indexOf('--mcp-config')+1]).mcpServers,{one:{command:'trusted-relay'}});
  assert.throws(()=>mergeClaudeOverrides(['--settings','{"permissions":{"bypass":true}}']),/Unexpected/);
});

test('a session cannot hot-update shared Headroom settings through inherited environment variables',()=>{
  const env={HEADROOM_OUTPUT_SHAPER:'1',HEADROOM_VERBOSITY_LEVEL:'4',HEADROOM_WEB_SEARCH_HISTORY:'1',OPENAI_API_KEY:'synthetic-credential',CODEX_HOME:'/synthetic/codex'};
  const isolated=headroomEnvironment(env);assert.equal(isolated.HEADROOM_OUTPUT_SHAPER,undefined);assert.equal(isolated.HEADROOM_VERBOSITY_LEVEL,undefined);assert.equal(isolated.HEADROOM_WEB_SEARCH_HISTORY,undefined);assert.equal(isolated.OPENAI_API_KEY,env.OPENAI_API_KEY);assert.equal(isolated.CODEX_HOME,env.CODEX_HOME);assert.equal(env.HEADROOM_OUTPUT_SHAPER,'1');
});

test('Claude cloud/gateway conflicts block only Headroom and preserve existing files; the same native proxy route is supported',async()=>{
  const f=await fakeWorkspace();try{
    await mkdir(join(f.project,'.claude'));const path=join(f.project,'.claude','settings.json');
    for(const env of [{CLAUDE_CODE_USE_VERTEX:'1'},{CLAUDE_CODE_USE_BEDROCK:'true'},{CLAUDE_CODE_USE_FOUNDRY:'1'},{ANTHROPIC_BASE_URL:'https://gateway.invalid/v1'}]){
      const original=JSON.stringify({env,permissions:{defaultMode:'default'}});await writeFile(path,original);
      const plane=new ControlPlane({env:f.env,dataDir:f.data,home:f.home});try{
        const blocked=await plane.plan('claude','custom',{path:f.project},{billing:'api',tools:['headroom']});assert.equal(blocked.plan.ready,false);assert.ok(blocked.plan.errors.some(s=>/route|gateway/.test(s)));
        const other=await plane.plan('claude','custom',{path:f.project},{billing:'api',tools:['rtk','serena']});assert.equal(other.plan.ready,true);assert.equal(await readFile(path,'utf8'),original);
      }finally{plane.close();}
    }
    const original=JSON.stringify({env:{ANTHROPIC_BASE_URL:'http://127.0.0.1:'+f.env.SHRINKCAGE_HEADROOM_PORT}});await writeFile(path,original);
    const plane=new ControlPlane({env:f.env,dataDir:f.data,home:f.home});try{const {plan}=await plane.plan('claude','custom',{path:f.project},{billing:'api',tools:['headroom']});assert.equal(plan.ready,true,plan.errors.join(' '));assert.equal(await readFile(path,'utf8'),original);}finally{plane.close();}
  }finally{await f.close();}
});

test('disabled compression and a proxy failure are revalidated before a session can start',async()=>{
  const f=await fakeWorkspace(),plane=new ControlPlane({env:f.env,dataDir:f.data,home:f.home});try{
    const options={billing:'api' as const,tools:['headroom']},input={agent:'codex',profile:'custom',project:{path:f.project},options,args:[]};
    const {plan}=await plane.plan('codex','custom',{path:f.project},options);assert.equal(plan.ready,true);
    f.headroomState.optimize=false;await assert.rejects(runManaged(plane,{...input,approved:plan.fingerprint},{quiet:true}),/compression disabled/);assert.equal(plane.store.sessionCount(),0);
    f.headroomState.optimize=true;f.headroomState.healthy=false;await assert.rejects(runManaged(plane,{...input,approved:plan.fingerprint},{quiet:true}),/offline/);assert.equal(plane.store.sessionCount(),0);
  }finally{plane.close();await f.close();}
});

test('concurrent same-project Headroom and baseline sessions keep separate routes, billing and tool receipts',{timeout:120000},async()=>{
  const f=await fakeWorkspace();try{
    const setups=[{agent:'codex',billing:'subscription',tools:['headroom','rtk','serena']},{agent:'claude',billing:'api',tools:['headroom','rtk','serena']},{agent:'codex',billing:'subscription',tools:[]}] as const;
    const prepared=[];
    for(const [i,s]of setups.entries()){
      const env={...f.env,FIXTURE_BILLING:s.billing,FIXTURE_NATIVE_USAGE:'1',FIXTURE_DELAY_MS:'1000',FIXTURE_VERIFY_ROUTE:s.tools.length?'required':'absent',FIXTURE_CAPTURE:join(f.root,'capture-'+i+'.json')};
      const args=[s.agent,'--profile','custom','--project',f.project,'--billing',s.billing,'--tools',s.tools.join(',')||'none'];const p=await cli(['plan',...args,'--json'],env,f.project);assert.equal(p.code,0,p.stderr);prepared.push({env,args,fingerprint:JSON.parse(p.stdout).fingerprint});
    }
    const runs=await Promise.all(prepared.map(s=>cli(['run',...s.args,'--approve',s.fingerprint],s.env,f.project)));for(const r of runs)assert.equal(r.code,0,r.stderr);
    const store=new ControlStore(f.data);try{const sessions=store.sessions();assert.equal(sessions.length,3);assert.equal(new Set(sessions.map(s=>s.id)).size,3);
      for(const session of sessions){const expected=session.plannedTools.includes('headroom');assert.equal(f.requests.filter(r=>r.session===session.id).length,expected?1:0);assert.ok(session.evidence.every(e=>e.status==='usage_observed'));assert.equal(session.status,'exited');assert.equal(session.billing?.mode,session.agent==='claude'?'api':'subscription');assert.equal(session.metrics.some(m=>m.scope==='process'&&/saved/.test(m.metric)),false);}
    }finally{store.close();}
  }finally{await f.close();}
});
