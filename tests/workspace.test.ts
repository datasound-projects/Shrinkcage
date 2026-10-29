import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseSession } from '../server/session-parser.js';
import { createWorkspaceRepository, discoverFiles, readSessionFile, validateSessionRoot } from '../server/workspace.js';
import { agentProcess, appDataDir } from '../server/platform.js';
import { makeServer } from '../server/http.js';
import type { Dashboard } from '../server/types.js';
const ctx={fileKey:'fixture',modifiedAt:'2026-10-29T10:01:00Z',sampled:false};
const meta={type:'session_meta',payload:{id:'sample-session-01',cwd:'/workspace/demo',model_provider:'openai',cli_version:'0.165.0',base_instructions:'PRIVATE_PROMPT'}};
test('Codex keeps latest cumulative totals, metadata and tool names without private payloads',()=>{
  const s=parseSession('codex',[meta,{type:'turn_context',payload:{model:'model-test'}},{type:'event_msg',timestamp:ctx.modifiedAt,payload:{type:'token_count',info:{total_token_usage:{input_tokens:100,output_tokens:10,total_tokens:110,cached_input_tokens:80}}}},{type:'event_msg',timestamp:ctx.modifiedAt,payload:{type:'token_count',info:{total_token_usage:{input_tokens:150,output_tokens:20,total_tokens:170}}}},{type:'response_item',payload:{type:'function_call',name:'find_symbol',call_id:'call-1',arguments:'PRIVATE_ARGUMENT'}},{type:'response_item',payload:{type:'function_call',name:'find_symbol',call_id:'call-1',arguments:'PRIVATE_ARGUMENT'}}],ctx)!;
  assert.equal(s.tokens.total,170);assert.equal(s.tokens.cached,null);assert.equal(s.provider,'openai');assert.equal(s.model,'model-test');assert.equal(s.project.label,'demo');assert.equal(s.tools[0].count,1);assert.ok(!JSON.stringify(s).includes('PRIVATE_'));assert.ok(!JSON.stringify(s).includes('/workspace/'));
});
test('Claude streaming assistant messages are deduplicated before summing usage',()=>{
  const message=(input:number,output:number)=>({type:'assistant',sessionId:'claude-session-01',cwd:'C:\\Projects\\demo',message:{id:'message-01',model:'claude-test',usage:{input_tokens:input,output_tokens:output,cache_read_input_tokens:0},content:[{type:'text',text:'PRIVATE_PROMPT'},{type:'tool_use',id:'call-1',name:'Read',input:{path:'PRIVATE_PATH'}}]}});
  const s=parseSession('claude',[message(4,0),message(4,10)],ctx)!;assert.equal(s.tokens.input,4);assert.equal(s.tokens.output,10);assert.equal(s.tokens.cached,0);assert.equal(s.tokens.total,null);assert.equal(s.observedToolCalls,1);assert.equal(s.provider,null);assert.equal(s.project.label,'demo');assert.ok(!JSON.stringify(s).includes('PRIVATE_'));
});
test('Gemini legacy JSON and current JSONL preserve reported usage without text',()=>{
  const metadata={sessionId:'gemini-session-01',projectHash:'project-hash',startTime:'2026-10-29T10:00:00Z',lastUpdated:ctx.modifiedAt};
  const m={id:'m1',type:'gemini',model:'gemini-test',timestamp:ctx.modifiedAt,tokens:{input:40,output:5,cached:20,total:45,thoughts:2},toolCalls:[{id:'tool1',name:'read_file',args:{secret:'PRIVATE_ARG'},result:'PRIVATE_RESULT'}],content:'PRIVATE_PROMPT'};
  const legacy=parseSession('gemini',[{...metadata,messages:[m]}],ctx)!;const jsonl=parseSession('gemini',[metadata,m],ctx)!;
  assert.deepEqual(legacy.tokens,jsonl.tokens);assert.equal(jsonl.tokens.total,45);assert.equal(jsonl.model,'gemini-test');assert.equal(jsonl.provider,null);assert.equal(jsonl.tools[0].name,'read_file');assert.ok(!JSON.stringify(jsonl).includes('PRIVATE_'));
});
test('Gemini rewind and removeIds exclude superseded records; unknown sampled rewrites withhold totals',()=>{
  const metadata={sessionId:'gemini-session-02',projectHash:'project-hash'};const m=(id:string)=>({id,type:'gemini',tokens:{input:10,output:2,total:12}});
  const a=parseSession('gemini',[metadata,m('a'),m('b'),{$rewindTo:'b'}],ctx)!;assert.equal(a.tokens.total,12);
  const b=parseSession('gemini',[metadata,m('a'),m('b'),{$patch:{removeIds:['a']}}],ctx)!;assert.equal(b.tokens.total,12);
  const c=parseSession('gemini',[metadata,m('a'),{$rewindTo:'absent'}],{...ctx,sampled:true})!;assert.equal(c.tokens.total,null);
});
test('unknown sessions and invalid counters are unavailable rather than fabricated',()=>{
  assert.equal(parseSession('codex',[{content:'PRIVATE'}],ctx),null);const s=parseSession('codex',[meta,{type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:'100'}}}}],{...ctx,sampled:true})!;assert.equal(s.tokens.input,null);assert.equal(s.coverage,'sampled');assert.equal(s.observedToolCalls,null);
});
test('platform paths and process observations distinguish missing from unavailable',()=>{
  assert.ok(appDataDir('linux','/demo',{}).endsWith('.config/shrinkcage'));assert.ok(appDataDir('darwin','/demo',{}).endsWith('Application Support/Shrinkcage'));assert.equal(appDataDir('win32','demo',{SHRINKCAGE_DATA_DIR:'override'}),'override');assert.equal(appDataDir('win32','demo',{SHRINKAGE_DATA_DIR:'legacy'}),'legacy');assert.equal(agentProcess('codex',['/usr/bin/codex']),'observed');assert.equal(agentProcess('claude',['node']),'not-observed');assert.equal(agentProcess('gemini',null),'unavailable');
});
test('bounded discovery, session paging, root approval and private index operate on fixture files',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'shrinkcage-test-'));const home=join(dir,'home');const root=join(home,'.codex','sessions');await mkdir(root,{recursive:true});await mkdir(join(home,'.claude','projects'),{recursive:true});
  await writeFile(join(root,'rollout-fixture.jsonl'),[meta,{type:'turn_context',payload:{model:'fixture-model'}}].map(x=>JSON.stringify(x)).join('\n'));
  await writeFile(join(root,'auth.json'),'PRIVATE_CREDENTIAL');
  try{
    assert.equal((await discoverFiles('codex',[root])).files.length,1);
    const repo=createWorkspaceRepository({home,dataDir:join(dir,'app'),env:{PATH:''}});const w=await repo.get();assert.equal(w.totalSessions,1);assert.equal(w.connectors[0].installed,false);assert.equal(w.connectors[0].integration,'local-history');assert.equal(w.connectors[1].integration,'no-session-data');
    const p=await repo.sessions(new URLSearchParams({agent:'codex',search:'demo',limit:'1'}));assert.equal(p.items.length,1);assert.equal(Object.hasOwn(p.items[0],'tools'),false);assert.ok(await repo.session(p.items[0].id));assert.ok(!JSON.stringify(p).includes('PRIVATE_'));
    await writeFile(join(root,'rollout-copy.jsonl'),JSON.stringify(meta));
    let refreshed=await repo.get(true);assert.equal(refreshed.connectors[0].sessions,1);assert.equal(refreshed.connectors[0].filesDiscovered,2);
    await writeFile(join(root,'rollout-broken.jsonl'),'{invalid JSON');refreshed=await repo.get(true);assert.equal(refreshed.connectors[0].filesParsed,2);assert.ok(refreshed.connectors[0].errors.length>0);assert.ok((await repo.get(true)).connectors[0].errors.length>0);
    await assert.rejects(repo.sessions(new URLSearchParams('limit=100000')));await assert.rejects(repo.sessions(new URLSearchParams('path=/etc')));
    await assert.rejects(validateSessionRoot(home,home));await assert.rejects(validateSessionRoot('/',home));await assert.rejects(validateSessionRoot('https://example.com',home));
    await assert.rejects(repo.configure({agent:'codex',enabled:true,root,approved:false}));await repo.configure({agent:'codex',enabled:false,root,approved:true});assert.equal((await repo.get()).connectors[0].integration,'disabled');
    if(process.platform!=='win32'){await symlink(join(root,'rollout-fixture.jsonl'),join(root,'rollout-link.jsonl'));assert.equal((await discoverFiles('codex',[root])).files.length,3);}
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('large JSONL sampling preserves metadata and latest cumulative tokens with explicit partial coverage',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'shrinkcage-sample-'));const path=join(dir,'rollout-large.jsonl');const text=[JSON.stringify(meta),JSON.stringify({type:'ignored',text:'x'.repeat(2300000)}),JSON.stringify({type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{total_tokens:700}}}})].join('\n');await writeFile(path,text);
  try{const sample=await readSessionFile({path,root:dir,size:Buffer.byteLength(text),mtime:Date.now(),archived:false});assert.equal(sample.sampled,true);const s=parseSession('codex',sample.records,{...ctx,sampled:true})!;assert.equal(s.tokens.total,700);assert.equal(s.coverage,'sampled');}finally{await rm(dir,{recursive:true,force:true});}
});
test('connector writes require exact origin, bounded JSON and an unforgeable process capability',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'shrinkcage-http-'));const root=join(dir,'sessions');await mkdir(root);const repo=createWorkspaceRepository({home:join(dir,'home'),dataDir:join(dir,'app'),env:{PATH:''}});
  const server=makeServer(async()=>({}) as Dashboard,dir,repo);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error();const base=`http://127.0.0.1:${address.port}`;
  const payload=JSON.stringify({agent:'codex',root,enabled:true,approved:true});const headers={'Content-Type':'application/json',Origin:base,'X-Shrinkcage-Token':repo.csrfToken};
  try{
    assert.equal((await fetch(base+'/api/connectors/config',{method:'POST',headers:{'Content-Type':'application/json'},body:payload})).status,403);
    assert.equal((await fetch(base+'/api/connectors/config',{method:'POST',headers:{...headers,Origin:'https://untrusted.example'},body:payload})).status,403);
    assert.equal((await fetch(base+'/api/connectors/config',{method:'POST',headers:{...headers,'X-Shrinkcage-Token':'é'.repeat(48)},body:payload})).status,403);
    assert.equal((await fetch(base+'/api/connectors/config',{method:'POST',headers,body:'x'.repeat(9000)})).status,413);
    assert.equal((await fetch(base+'/api/connectors/config',{method:'POST',headers,body:payload})).status,200);
    assert.equal((await fetch(base+'/api/sessions?limit=10000')).status,400);assert.equal((await fetch(base+'/api/sessions/'+ 'a'.repeat(24))).status,404);
  }finally{await new Promise<void>(r=>{server.close(()=>r());server.closeAllConnections();});await rm(dir,{recursive:true,force:true});}
});
