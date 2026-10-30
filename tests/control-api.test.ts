import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtemp,mkdir,rm,writeFile,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { makeServer } from '../server/http.js';
import { ControlPlane } from '../server/control/core.js';
import { DEFAULT_PROFILES } from '../server/control/profiles.js';
import { fakeWorkspace } from './control-fixtures.js';
import type { Dashboard } from '../server/types.js';
import type { ManagedSession } from '../server/control/types.js';

async function apiFixture(){const f=await fakeWorkspace();const plane=new ControlPlane({dataDir:f.data,env:f.env,home:f.home});const registered=await plane.project({path:f.project});const server=makeServer(async()=>({updatedAt:'fixture'}) as Dashboard,f.root,undefined,plane);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw Error();const base=`http://127.0.0.1:${address.port}`;const response=await fetch(base+'/api/control/v1/state');const state=await response.json();const headers={'Content-Type':'application/json',Origin:base,'X-Shrinkcage-Token':state.csrfToken};return {...f,plane,base,registered,headers,close:async()=>{await new Promise<void>(r=>{server.close(()=>r());server.closeAllConnections();});plane.close();await f.close();}};}
const publicSession=(id:string,profile:string):ManagedSession=>({schemaVersion:1,id,origin:'managed',project:{id:'a'.repeat(24),label:'Fixture'},agent:'codex',agentVersion:'0.165.0',profile,profileRevision:0,planFingerprint:'a'.repeat(64),status:'exited',startedAt:new Date(Date.now()-10000).toISOString(),endedAt:new Date().toISOString(),heartbeatAt:new Date().toISOString(),exitCode:0,signal:null,plannedTools:[],appliedTools:[],evidence:[],diagnostics:[],elapsedMs:10000,toolActivity:[],metrics:[]});

test('T14 control writes enforce exact Origin, CSRF, approval, schemas, content type and bounded bodies',async()=>{
  const f=await apiFixture();try{
    const path=f.base+'/api/control/v1/profiles/save',payload=JSON.stringify({profile:{...DEFAULT_PROFILES[1].profile,id:'api-profile'},revision:0,approved:true});
    for(const headers of [{'Content-Type':'application/json'}, {...f.headers,Origin:'https://external.example'},{...f.headers,'X-Shrinkcage-Token':'f'.repeat(48)}])assert.equal((await fetch(path,{method:'POST',headers,body:payload})).status,403);
    assert.equal((await fetch(path,{method:'POST',headers:{...f.headers,'Content-Type':'text/plain'},body:payload})).status,400);
    assert.equal((await fetch(path,{method:'POST',headers:f.headers,body:'x'.repeat(17000)})).status,413);
    assert.equal((await fetch(path,{method:'POST',headers:f.headers,body:'{bad'})).status,400);
    assert.equal((await fetch(path,{method:'POST',headers:f.headers,body:payload.replace('"approved":true','"approved":false')})).status,403);
    assert.equal((await fetch(path,{method:'POST',headers:f.headers,body:JSON.stringify({profile:DEFAULT_PROFILES[1].profile,revision:0,approved:true,command:'PRIVATE_COMMAND'})})).status,400);
    assert.equal((await fetch(path,{method:'POST',headers:f.headers,body:payload})).status,200);
    assert.equal((await fetch(path,{method:'POST',headers:f.headers,body:payload})).status,409);
    assert.equal((await fetch(path,{method:'DELETE',headers:f.headers})).status,405);
    assert.equal((await fetch(f.base+'/api/control/v1/state?path=private')).status,400);
    const health=await fetch(f.base+'/api/health');assert.equal(health.status,200);assert.equal((await health.json()).app,'shrinkcage');assert.equal((await fetch(f.base+'/api/metrics')).status,200);
  }finally{await f.close();}
});
test('T14 no execution, installer, arbitrary path or arbitrary URL boundary can be reached through HTTP',async()=>{
  const f=await apiFixture();try{
    for(const path of ['/exec','/run','/stop','/install','/setup/apply']){const r=await fetch(f.base+'/api/control/v1'+path,{method:'POST',headers:f.headers,body:JSON.stringify({approved:true,command:'PRIVATE_COMMAND',url:'http://127.0.0.1:1',path:'/private'})});assert.equal(r.status,404);assert.ok(!(await r.text()).includes('PRIVATE_COMMAND'));}
    const plan=await fetch(f.base+'/api/control/v1/plans',{method:'POST',headers:f.headers,body:JSON.stringify({agent:'codex',profile:'baseline',projectId:f.registered.ref.id,approved:true})});assert.equal(plan.status,200);const value=await plan.json();assert.equal(value.ready,true);assert.ok(!JSON.stringify(value).includes(f.root));
    const arbitrary=await fetch(f.base+'/api/control/v1/plans',{method:'POST',headers:f.headers,body:JSON.stringify({agent:'codex',profile:'baseline',projectId:f.registered.ref.id,path:f.root,approved:true})});assert.equal(arbitrary.status,400);
    const unapproved=await fetch(f.base+'/api/control/v1/plans',{method:'POST',headers:f.headers,body:JSON.stringify({agent:'codex',profile:'baseline',projectId:'f'.repeat(24),approved:true})});assert.equal(unapproved.status,400);
    const extension=await fetch(f.base+'/api/control/v1/extensions',{method:'POST',headers:f.headers,body:JSON.stringify({approved:true,manifest:{schemaVersion:1,id:'evil',command:'PRIVATE_COMMAND'}})});assert.equal(extension.status,400);
    assert.equal(f.plane.store.sessions().length,0);
  }finally{await f.close();}
});
test('T20 baseline comparisons retain confounders and never invent savings or causal claims',async()=>{
  const f=await apiFixture();try{
    const a=publicSession(randomUUID(),'baseline'),b=publicSession(randomUUID(),'lean');b.elapsedMs=8000;f.plane.store.createSession(a,'owner-a');f.plane.store.createSession(b,'owner-b');
    const comparison={schemaVersion:1,baselineSession:a.id,optimizedSession:b.id,taskLabel:'Task comparison',sameTask:true,sameGitState:false,sameModel:false,sameEffort:false,quality:'not-reviewed'};
    const r=await fetch(f.base+'/api/control/v1/benchmarks',{method:'POST',headers:f.headers,body:JSON.stringify({comparison,approved:true})});assert.equal(r.status,200);const result=await r.json();assert.equal(result.elapsedDifferenceMs,-2000);assert.ok(result.confounders.length>=5);assert.match(result.conclusion,/no causal cost/);assert.ok(!Object.hasOwn(result,'savedTokens'));
    const bad=await fetch(f.base+'/api/control/v1/benchmarks',{method:'POST',headers:f.headers,body:JSON.stringify({comparison:{...comparison,savedTokens:1234},approved:true})});assert.equal(bad.status,400);
    const active=publicSession(randomUUID(),'baseline');active.status='running';active.heartbeatAt=new Date().toISOString();f.plane.store.createSession(active,'owner-active');const deletion=await fetch(f.base+'/api/control/v1/sessions/remove',{method:'POST',headers:f.headers,body:JSON.stringify({id:active.id,approved:true})});assert.equal(deletion.status,400);
    assert.throws(()=>f.plane.store.updateSession(active,'wrong-owner'),/ownership/);
    active.heartbeatAt=new Date(Date.now()-40000).toISOString();f.plane.store.updateSession(active,'owner-active');assert.equal(f.plane.store.sessions().find(s=>s.id===active.id)?.status,'abandoned');
  }finally{await f.close();}
});
