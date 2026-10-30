import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir,lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { ControlPlane } from '../server/control/core.js';
import { OwnedResources } from '../server/control/ownership.js';
import { ControlStore } from '../server/control/store.js';
import { executable,headroomPort,runBounded,detectTool } from '../server/control/probe.js';
import { prepareRuntime,receiptEvents,writeReceipt,runtimeEntry } from '../server/control/runtime.js';
import { validateAgentArguments } from '../server/control/runner.js';
import { fakeWorkspace,cli,ENTRY,TSX } from './control-fixtures.js';
import type { ManagedSession,OptimizationPlan } from '../server/control/types.js';

async function plan(f:Awaited<ReturnType<typeof fakeWorkspace>>,profile='baseline',project=f.project){const r=await cli(['plan','codex','--profile',profile,'--project',project,'--json'],f.env,project);assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout) as OptimizationPlan;}
async function setup(f:Awaited<ReturnType<typeof fakeWorkspace>>,project=f.project){const p=await cli(['tool','setup','rtk','--project',project,'--dry-run'],f.env,project);assert.equal(p.code,0,p.stderr);const result=await cli(['tool','setup','rtk','--project',project,'--approve',JSON.parse(p.stdout).fingerprint],f.env,project);assert.equal(result.code,0,result.stderr);}

test('T03 doctor, tools and inspect expose truthful installed/guided states without agent authentication',async()=>{
  const f=await fakeWorkspace();try{
    const doctor=await cli(['doctor','--json'],f.env,f.project);assert.equal(doctor.code,0,doctor.stderr);const d=JSON.parse(doctor.stdout);assert.equal(d.agents[0].compatible,true);assert.equal(d.tools.filter((t:{compatible:boolean})=>t.compatible).length,3);assert.ok(d.tools.every((t:{agentConnected:unknown;effective:unknown})=>t.agentConnected===null&&t.effective===null));
    const tools=await cli(['tools','--json'],f.env,f.project);assert.equal(JSON.parse(tools.stdout).length,6);const inspect=await cli(['tool','inspect','headroom'],f.env,f.project);assert.equal(JSON.parse(inspect.stdout).detection.serviceHealthy,true);
    const bad=await cli(['tool','install','codemem'],f.env,f.project);assert.equal(bad.code,2);assert.match(bad.stderr,/guided/);
    const missing=await detectTool('rtk',{...f.env,PATH:''});assert.equal(missing.status,'missing');const wrong=await detectTool('rtk',{...f.env,FIXTURE_RTK_BAD_VERSION:'1'});assert.equal(wrong.compatible,false);
    const unknown=await cli(['tools','--command','PRIVATE_COMMAND'],f.env,f.project);assert.equal(unknown.code,2);assert.ok(!unknown.stderr.includes('PRIVATE_COMMAND'));
  }finally{await f.close();}
});
test('T05 CLI profile create/edit/export/import uses strict schemas and revision checks',async()=>{
  const f=await fakeWorkspace();try{
    const create=await cli(['profile','create','custom','--tools','rtk,serena','--required','rtk'],f.env,f.project);assert.equal(create.code,0,create.stderr);const profile=JSON.parse(create.stdout);assert.equal(profile.profile.tools[0].required,true);
    assert.equal((await cli(['profile','edit','custom','--revision','0'],f.env,f.project)).code,2);
    const exported=await cli(['profile','export','custom'],f.env,f.project);const value=JSON.parse(exported.stdout);value.id='imported';const file=join(f.root,'profile.json');await writeFile(file,JSON.stringify(value));assert.equal((await cli(['profile','import',file],f.env,f.project)).code,0);
    const list=await cli(['profile','list','--json'],f.env,f.project);assert.ok(JSON.parse(list.stdout).some((s:{profile:{id:string}})=>s.profile.id==='imported'));
    assert.equal((await cli(['profile','remove','imported'],f.env,f.project)).code,0);assert.equal((await cli(['profile','remove','baseline'],f.env,f.project)).code,2);
    await writeFile(file,JSON.stringify({...value,command:'PRIVATE_PAYLOAD'}));const invalid=await cli(['profile','import',file],f.env,f.project);assert.equal(invalid.code,2);assert.ok(!invalid.stderr.includes('PRIVATE_PAYLOAD'));
  }finally{await f.close();}
});
test('T04 planning never installs missing project hooks and required tools fail preflight',async()=>{
  const f=await fakeWorkspace();try{
    const p=await plan(f,'lean');assert.deepEqual(p.tools,[]);assert.ok(p.omitted.some(t=>t.id==='rtk'));await assert.rejects(lstat(join(f.project,'.codex/hooks.json')));
    assert.equal((await cli(['profile','create','strict','--tools','rtk','--required','rtk'],f.env,f.project)).code,0);
    const blocked=await cli(['plan','codex','--profile','strict','--project',f.project,'--json'],f.env,f.project);assert.equal(blocked.code,2);assert.equal(JSON.parse(blocked.stdout).ready,false);
    const absent=await cli(['run','codex','--profile','baseline','--project',f.project,'--approve','0'.repeat(64)],f.env,f.project);assert.equal(absent.code,2);assert.equal(JSON.parse((await cli(['sessions','--json'],f.env,f.project)).stdout).length,0);
    const declined=await cli(['run','codex','--profile','baseline','--project',f.project],f.env,f.project);assert.equal(declined.code,2);assert.match(declined.stderr,/Non-interactive/);
  }finally{await f.close();}
});
test('T08 native terminal streams, cwd, Unicode arguments and nonzero exits survive without a shell',async()=>{
  assert.match(runtimeEntry('supervisor').args[1],/^file:\/\//,'ESM preload uses a URL, including on Windows drive-letter paths');
  const f=await fakeWorkspace();try{
    await setup(f);const p=await plan(f,'lean');assert.deepEqual(p.tools,['rtk']);const capture=join(f.root,'capture.json');const argument='PRIVATE_PROMPT_DO_NOT_STORE ; $(touch owned-by-shell) "π"';
    const run=await cli(['run','codex','--profile','lean','--project',f.project,'--approve',p.fingerprint,'--','--exit','7',argument],{...f.env,FIXTURE_CAPTURE:capture,FIXTURE_USE_HOOK:'1'},f.project);
    assert.equal(run.code,7,run.stderr);assert.match(run.stdout,/FIXTURE_TERMINAL_OUTPUT/);const captured=JSON.parse(await readFile(capture,'utf8'));assert.equal(captured.cwd,f.project);assert.equal(captured.args.at(-1),argument);assert.ok(captured.args.includes('--no-daemon'));await assert.rejects(lstat(join(f.project,'owned-by-shell')));
    const s=JSON.parse((await cli(['sessions','--json'],f.env,f.project)).stdout)[0] as ManagedSession;assert.equal(s.status,'failed');assert.equal(s.exitCode,7);assert.equal(s.toolActivity[0].name,'native_hook_rewrite');assert.ok(!JSON.stringify(s).includes('PRIVATE_PROMPT'));assert.ok(!JSON.stringify(s).includes(f.root));
    const baseline=await plan(f);const echo=await cli(['run','codex','--profile','baseline','--project',f.project,'--approve',baseline.fingerprint,'--','--echo-stdin'],f.env,f.project,'terminal input π\n');assert.equal(echo.code,0,echo.stderr);assert.match(echo.stdout,/terminal input π/);
  }finally{await f.close();}
});
test('T10-T12 combined RTK, Serena and Headroom activation records genuine managed protocol evidence',async()=>{
  const f=await fakeWorkspace();try{
    await setup(f);const p=await plan(f,'balanced');assert.equal(p.tools.length,3);assert.equal(p.headroomPort,Number(f.env.SHRINKCAGE_HEADROOM_PORT));
    const run=await cli(['run','codex','--profile','balanced','--project',f.project,'--approve',p.fingerprint],{...f.env,FIXTURE_USE_HOOK:'1'},f.project);assert.equal(run.code,0,run.stderr);
    const session=JSON.parse((await cli(['sessions','--json'],f.env,f.project)).stdout)[0] as ManagedSession;assert.equal(session.status,'exited');assert.equal(session.evidence.filter(e=>e.status==='usage_observed').length,3);assert.equal(session.toolActivity.length,3);assert.ok(session.metrics.filter(m=>m.scope==='process').every(m=>m.session_id===session.id));assert.ok(session.metrics.filter(m=>m.scope==='shared').every(m=>m.session_id===undefined));
    const serialized=JSON.stringify(session);for(const privateValue of ['PRIVATE_PROMPT','PRIVATE_RESULT',f.root,'SHRINKCAGE_SESSION_TOKEN'])assert.ok(!serialized.includes(privateValue));
    assert.equal((await fetch(`http://127.0.0.1:${f.env.SHRINKCAGE_HEADROOM_PORT}/health`)).status,200);await assert.rejects(lstat(join(f.data,'control/runtime',session.id)));
  }finally{await f.close();}
});
test('T12 failed wrappers and MCP startup never get reported as connected or effective',async()=>{
  const f=await fakeWorkspace();try{
    await cli(['profile','create','proxy-only','--tools','headroom','--required','headroom'],f.env,f.project);const p=await plan(f,'proxy-only');
    const run=await cli(['run','codex','--profile','proxy-only','--project',f.project,'--approve',p.fingerprint],{...f.env,FIXTURE_WRAPPER_FAIL:'1'},f.project);assert.equal(run.code,9,run.stderr);
    const s=JSON.parse((await cli(['sessions','--json'],f.env,f.project)).stdout)[0] as ManagedSession;assert.equal(s.status,'failed');assert.ok(s.evidence.every(e=>!['agent_connected','effective','usage_observed'].includes(e.status)));
    await cli(['profile','create','semantic-only','--tools','serena','--required','serena'],f.env,f.project);const p2=await plan(f,'semantic-only');const bad=await cli(['run','codex','--profile','semantic-only','--project',f.project,'--approve',p2.fingerprint],{...f.env,FIXTURE_SERENA_CRASH:'1'},f.project);assert.notEqual(bad.code,0);
  }finally{await f.close();}
});
test('T07 two simultaneous managed sessions have isolated runtime directories and no global config edits',async()=>{
  const f=await fakeWorkspace();try{
    const project2=join(f.root,'second-project');await mkdir(project2);await setup(f,project2);const before=await readFile(join(project2,'.codex/hooks.json'),'utf8');const a=await plan(f),b=await plan(f,'lean',project2);
    const [ra,rb]=await Promise.all([cli(['run','codex','--profile','baseline','--project',f.project,'--approve',a.fingerprint],f.env,f.project),cli(['run','codex','--profile','lean','--project',project2,'--approve',b.fingerprint],{...f.env,FIXTURE_USE_HOOK:'1'},project2)]);assert.equal(ra.code,0,ra.stderr);assert.equal(rb.code,0,rb.stderr);
    const sessions=JSON.parse((await cli(['sessions','--json'],f.env,f.project)).stdout) as ManagedSession[];assert.equal(new Set(sessions.map(s=>s.id)).size,2);assert.equal(new Set(sessions.map(s=>s.project.id)).size,2);assert.ok(sessions.every(s=>s.status==='exited'));assert.equal(await readFile(join(project2,'.codex/hooks.json'),'utf8'),before);await assert.rejects(lstat(join(f.env.CODEX_HOME!,'config.toml')));
  }finally{await f.close();}
});
test('T09 ownership tokens, refcounts, closed handles and unowned services prevent unrelated termination',()=>{
  const pool=new OwnedResources();let kills=0;const child=Object.assign(new EventEmitter(),{exitCode:null,signalCode:null,kill:()=>{kills++;return true;}}) as never;
  const external=pool.attach('external','a');pool.attach('external','b');pool.release('external','a',external);assert.equal(pool.references('external'),1);pool.release('external','b',external);assert.equal(kills,0);
  const token=pool.attach('owned','a',child);pool.attach('owned','b',child);assert.throws(()=>pool.release('owned','a','wrong'));assert.throws(()=>pool.release('owned','unknown',token));pool.release('owned','a',token);assert.equal(kills,0);pool.release('owned','b',token);assert.equal(kills,1);pool.release('owned','b',token);assert.equal(kills,1);
  const done=Object.assign(new EventEmitter(),{exitCode:0,signalCode:null,kill:()=>{kills++;}}) as never;const t=pool.attach('finished','a',done);pool.release('finished','a',t);assert.equal(kills,1);
});
test('T14 executable/endpoint boundaries and bounded probes reject unsafe or unreviewed inputs',async()=>{
  const f=await fakeWorkspace();try{
    await assert.rejects(executable('arbitrary' as never,f.env));assert.throws(()=>headroomPort({...f.env,SHRINKCAGE_HEADROOM_PORT:'http://secret'}));assert.throws(()=>headroomPort({...f.env,SHRINKCAGE_HEADROOM_PORT:'8790'}));
    const missing={command:join(f.root,'missing'),prefix:[],fingerprint:'x'};await assert.rejects(runBounded(missing,[],{env:f.env}),/could not start/);
    const node={command:process.execPath,prefix:[],fingerprint:'node'};await assert.rejects(runBounded(node,['-e','setInterval(()=>{},1000)'],{timeout:50}),/timed out/);await assert.rejects(runBounded(node,['-e','process.stdout.write("x".repeat(100000))']),/limit/);
    const controller=new AbortController();controller.abort();await assert.rejects(runBounded(node,['--version'],{signal:controller.signal}),/cancelled/);
    const p=await plan(f);for(const args of [['--cd','elsewhere'],['--remote=ws://localhost'],['--worktree']])assert.throws(()=>validateAgentArguments(args,p));p.tools=['rtk'];for(const args of [['-Celsewhere'],['--config',' hooks={}'],['--disable','hooks'],['--remote','ws://localhost'],['--profile','other'],Array(101).fill('x')])assert.throws(()=>validateAgentArguments(args,p));validateAgentArguments(['--','--config=plain prompt'],p);
  }finally{await f.close();}
});
test('T14 receipts require exact owner proof and never preserve arbitrary payload fields',async()=>{
  const f=await fakeWorkspace();const id='a'.repeat(8)+'-'+ 'b'.repeat(4)+'-'+ 'c'.repeat(4)+'-'+ 'd'.repeat(4)+'-'+ 'e'.repeat(12),token='0'.repeat(64);const runtime=await prepareRuntime(f.data,id,token,['serena']);
  try{
    const env={...f.env,SHRINKCAGE_SESSION_ID:id,SHRINKCAGE_SESSION_TOKEN:token};const event={tool:'serena' as const,phase:'usage_observed' as const,name:'find_symbol',at:new Date().toISOString()};await writeReceipt(event,{...env,SHRINKCAGE_SESSION_TOKEN:'bad'});assert.equal((await receiptEvents(runtime.path)).length,0);await writeReceipt(event,env);assert.equal((await receiptEvents(runtime.path)).length,1);
    await writeFile(join(runtime.path,'events.jsonl'),'bad\n'+JSON.stringify({...event,arguments:'PRIVATE_PROMPT'})+'\n');assert.ok(!JSON.stringify(await receiptEvents(runtime.path)).includes('PRIVATE_'));
  }finally{await runtime.close();await f.close();}
});

test('T08-T09 terminal interruption and parent crash clean only the owned runtime',async()=>{
  const f=await fakeWorkspace();try{
    for(const mode of ['interrupt','terminate','crash']){const crash=mode==='crash';
      const p=await plan(f);const marker=join(f.root,mode+'-started');
      const child=spawn(process.execPath,['--import',TSX,ENTRY,'run','codex','--profile','baseline','--project',f.project,'--approve',p.fingerprint,'--','--wait'],{cwd:f.project,env:{...f.env,FIXTURE_STARTED:marker},stdio:['ignore','pipe','pipe'],shell:false});
      child.stdout.resume();child.stderr.resume();const exit=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code));});
      let pid=0;for(let i=0;i<200;i++){try{pid=Number(await readFile(marker,'utf8'));if(pid)break;}catch{}await new Promise(r=>setTimeout(r,30));}
      assert.ok(pid,'owned fake agent should start');child.kill(crash?'SIGKILL':mode==='terminate'||process.platform==='win32'?'SIGTERM':'SIGINT');const code=await exit;if(!crash&&process.platform!=='win32')assert.equal(code,mode==='terminate'?143:130);
      let alive=true;for(let i=0;i<200;i++){try{process.kill(pid,0);}catch{alive=false;break;}await new Promise(r=>setTimeout(r,30));}assert.equal(alive,false,'guardian must stop its owned child');
      const plane=new ControlPlane({dataDir:f.data,env:f.env});try{let session=plane.store.sessions()[0];for(let i=0;i<500&&['preflight','running','starting','stopping','degraded'].includes(session.status);i++){await new Promise(r=>setTimeout(r,30));session=plane.store.sessions()[0];}assert.ok(['exited','abandoned'].includes(session.status),JSON.stringify({mode,status:session.status,exitCode:session.exitCode,diagnostics:session.diagnostics}));await assert.rejects(lstat(join(f.data,'control/runtime',session.id)));}finally{plane.close();}
      assert.equal((await fetch(`http://127.0.0.1:${f.env.SHRINKCAGE_HEADROOM_PORT}/health`)).status,200,'external service must survive');
    }
  }finally{await f.close();}
});

test('T09 owner crash after agent exit still finalizes metadata and removes its owned runtime',async()=>{
  // Repetition catches IPC/loader teardown races that a single happy run misses.
  for(let attempt=0;attempt<6;attempt++){const f=await fakeWorkspace();try{
    const script=join(f.root,'owner-finalization.mjs'),marker=join(f.root,'finalizing');
    const core=new URL('../server/control/core.ts',import.meta.url).href,runner=new URL('../server/control/runner.ts',import.meta.url).href;
    await writeFile(script,`import {ControlPlane} from ${JSON.stringify(core)};import {runManaged} from ${JSON.stringify(runner)};import {writeFile} from 'node:fs/promises';const plane=new ControlPlane({dataDir:process.env.SHRINKCAGE_DATA_DIR});const {plan}=await plane.plan('codex','baseline',{path:process.cwd()});let snapshots=0;await runManaged(plane,{agent:'codex',profile:'baseline',project:{path:process.cwd()},approved:plan.fingerprint,args:[]},{snapshot:async()=>{if(snapshots++){await writeFile(process.env.FIXTURE_FINALIZING,'ready');await new Promise(r=>setTimeout(r,30000));}return[];}});plane.close();`);
    const child=spawn(process.execPath,['--import',TSX,script],{cwd:f.project,env:{...f.env,FIXTURE_FINALIZING:marker},stdio:['ignore','pipe','pipe'],shell:false});child.stdout.resume();let stderr='';child.stderr.on('data',chunk=>{if(stderr.length<8192)stderr+=chunk.toString();});const exited=new Promise(r=>child.once('close',r));
    let ready=false;for(let i=0;i<300;i++){try{ready=(await readFile(marker,'utf8'))==='ready';if(ready)break;}catch{}await new Promise(r=>setTimeout(r,30));}assert.ok(ready,'agent must exit before the simulated owner crash');child.kill('SIGKILL');await exited;
    const plane=new ControlPlane({dataDir:f.data,env:f.env});try{let session=plane.store.sessions()[0];for(let i=0;i<500&&session.status!=='abandoned';i++){await new Promise(r=>setTimeout(r,30));session=plane.store.sessions()[0];}const diagnostic=await readFile(join(f.data,'control/runtime',session.id,'guardian.json'),'utf8').catch(()=>'runtime removed');assert.equal(session.status,'abandoned',JSON.stringify({attempt,status:session.status,diagnostic,stderr}));await assert.rejects(lstat(join(f.data,'control/runtime',session.id)));}finally{plane.close();}
    assert.equal((await fetch(`http://127.0.0.1:${f.env.SHRINKCAGE_HEADROOM_PORT}/health`)).status,200);
  }finally{await f.close();}
  }
});
