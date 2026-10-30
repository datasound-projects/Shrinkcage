import {spawnSync,spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {fakeWorkspace} from '../tests/control-fixtures.ts';
const pkg=JSON.parse(await readFile('package.json','utf8'));const dir=await mkdtemp(join(tmpdir(),'shrinkcage-package-'));
let child,fixture;
try{
  assert.ok(process.env.npm_execpath,'Run npm run smoke');
  const install=spawnSync(process.execPath,[process.env.npm_execpath,'install','--prefix',dir,'--ignore-scripts','--no-audit','--no-fund','--omit=dev',join(process.cwd(),'release',`${pkg.name}-${pkg.version}.tgz`)],{encoding:'utf8',shell:false});
  assert.equal(install.status,0,install.stderr);
  const base=join(dir,'node_modules',pkg.name);assert.ok((await readFile(join(base,'dist-server/server/control/sdk/contract.d.ts'),'utf8')).includes('staticConformance'));assert.equal(JSON.parse(await readFile(join(base,'sdk/optimizer.schema.json'),'utf8')).title,'Shrinkcage optimizer SDK v2');const version=spawnSync(process.execPath,[join(base,'bin/shrinkcage.mjs'),'--version'],{encoding:'utf8'});assert.equal(version.status,0,version.stderr);assert.ok(version.stdout.includes('Shrinkcage '+pkg.version),version.stdout);
  fixture=await fakeWorkspace();const env={...fixture.env,FIXTURE_USE_HOOK:'1'};const executable=join(base,'bin/shrinkcage.mjs');
  const command=(args)=>new Promise((resolve,reject)=>{const c=spawn(process.execPath,[executable,...args],{env,cwd:fixture.project,stdio:['ignore','pipe','pipe'],shell:false});let stdout='',stderr='';c.stdout.on('data',b=>stdout+=b);c.stderr.on('data',b=>stderr+=b);c.once('error',reject);c.once('close',code=>resolve({code,stdout,stderr}));});
  const help=await command(['--help']);assert.equal(help.code,0);assert.match(help.stdout,/doctor/);assert.match(help.stdout,/run codex|run <agent>/);
  const doctor=await command(['doctor','--json']);assert.equal(doctor.code,0,doctor.stderr);assert.equal(JSON.parse(doctor.stdout).agents[0].compatible,true);
  const tools=await command(['tools','--json']);assert.equal(tools.code,0);assert.ok(['rtk','serena','headroom','context-mode','leanctx'].every(id=>JSON.parse(tools.stdout).some(t=>t.id===id)));
  const created=await command(['profile','create','package-check','--tools','rtk,serena,headroom','--required','rtk,serena,headroom']);assert.equal(created.code,0,created.stderr);
  const preview=await command(['tool','setup','rtk','--project',fixture.project,'--dry-run']);assert.equal(preview.code,0,preview.stderr);
  const configured=await command(['tool','setup','rtk','--project',fixture.project,'--approve',JSON.parse(preview.stdout).fingerprint]);assert.equal(configured.code,0,configured.stderr);
  const planned=await command(['plan','codex','--profile','package-check','--project',fixture.project,'--json']);assert.equal(planned.code,0,planned.stderr);const plan=JSON.parse(planned.stdout);assert.equal(plan.tools.length,3);
  const launched=await command(['run','codex','--profile','package-check','--project',fixture.project,'--approve',plan.fingerprint]);assert.equal(launched.code,0,launched.stderr);assert.match(launched.stdout,/FIXTURE_TERMINAL_OUTPUT/);
  const records=await command(['sessions','--json']);assert.equal(records.code,0,records.stderr);const sessions=JSON.parse(records.stdout);assert.equal(sessions.length,1);assert.equal(sessions[0].evidence.filter(e=>e.status==='usage_observed').length,3);assert.ok(!JSON.stringify(sessions).includes('PRIVATE_'));
  const example=await command(['optimizer','add-example']);assert.equal(example.code,0,example.stderr);const added=await command(['optimizer','add-example','--approve',JSON.parse(example.stdout).fingerprint]);assert.equal(added.code,0,added.stderr);
  const pluginArgs=['codex','--profile','custom','--project',fixture.project,'--tools','line-window','--billing','api','--tool-config-b64',Buffer.from(JSON.stringify({'line-window':{lineLimit:25}})).toString('base64url')];
  const pluginPlan=await command(['plan',...pluginArgs,'--json']);assert.equal(pluginPlan.code,0,pluginPlan.stderr);assert.ok(JSON.parse(pluginPlan.stdout).launchCommand.includes('--tool-config-b64'));
  const pluginRun=await command(['run',...pluginArgs,'--approve',JSON.parse(pluginPlan.stdout).fingerprint]);assert.equal(pluginRun.code,0,pluginRun.stderr);
  const healthCheck=await command(['optimizer','check','line-window']);assert.equal(healthCheck.code,0,healthCheck.stderr);
  const removal=await command(['optimizer','remove','line-window']);assert.equal(removal.code,0,removal.stderr);assert.equal((await command(['optimizer','remove','line-window','--approve',JSON.parse(removal.stdout).fingerprint])).code,0);
  const accounting=await command(['accounting','show']);assert.equal(accounting.code,0,accounting.stderr);assert.equal(JSON.parse(accounting.stdout).schemaVersion,1);
  const claudePlan=await command(['plan','claude','--profile','lean','--billing','api','--project',fixture.project,'--json']);assert.equal(claudePlan.code,0,claudePlan.stderr);const claude=await command(['run','claude','--profile','lean','--billing','api','--project',fixture.project,'--approve',JSON.parse(claudePlan.stdout).fingerprint]);assert.equal(claude.code,0,claude.stderr);
  const data=fixture.data;await writeFile(join(data,'settings.json'),JSON.stringify(Object.fromEntries(['codex','claude','gemini'].map(a=>[a,{enabled:false,root:null}]))));
  const probe=await fetch('http://127.0.0.1:8790/api/health',{signal:AbortSignal.timeout(400)}).catch(()=>null);if(probe)throw new Error('Stop the owned local server before running the isolated package smoke test on port 8790.');
  child=spawn(process.execPath,[join(base,'dist-server/server/index.js')],{env,stdio:'pipe'});let output='';child.stderr.on('data',x=>output+=x);
  let ready=false;for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,150));const r=await fetch('http://127.0.0.1:8790/api/health',{signal:AbortSignal.timeout(500)}).catch(()=>null);if(r?.ok){const health=await r.json();assert.equal(health.app,'shrinkcage');ready=true;break;}}
  assert.ok(ready,output);assert.equal((await fetch('http://127.0.0.1:8790/')).status,200);const w=await(await fetch('http://127.0.0.1:8790/api/workspace')).json();assert.equal(w.totalSessions,0);assert.ok(w.connectors.every(c=>c.integration==='disabled'));
  const state=await(await fetch('http://127.0.0.1:8790/api/control/v1/state')).json();assert.equal(state.version,pkg.version);assert.equal(state.sessions.length,3);assert.ok(state.profiles.some(p=>p.profile.id==='package-check'));assert.ok(state.sessions.some(s=>s.toolActivity.some(a=>a.name==='compact_output')));
  for(const args of [['--no-open'],['ui','--no-open']]){const reused=await command(args);assert.equal(reused.code,0,reused.stderr);assert.match(reused.stdout,/already running/);}
  assert.equal((await fetch(`http://127.0.0.1:${env.SHRINKCAGE_HEADROOM_PORT}/health`)).status,200);
  console.log('PASS: actual .tgz clean install, legacy CLI/UI reuse, doctor/tools/profiles/plan/setup/run/sessions, managed Codex/Claude and SDK registration/check/session/removal, accounting, all three built-in fake integrations, compiled frontend/API, disabled observed connectors and external service survival.');
}finally{if(child){const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,5000))]);if(child.exitCode===null){child.kill('SIGKILL');await done;}}await fixture?.close();await rm(dir,{recursive:true,force:true});}
