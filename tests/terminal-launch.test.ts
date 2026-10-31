import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod,mkdir,readFile,symlink,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fakeWorkspace } from './control-fixtures.js';
import { ControlPlane } from '../server/control/core.js';
import { controlRead,controlWrite } from '../server/control/api.js';
import { runTerminalTicket,TerminalLauncher } from '../server/control/terminal.js';
import { shellQuote,powershellQuote,inspectTerminals } from '../server/control/terminal-host.js';
import { makeServer } from '../server/http.js';
import type { Dashboard } from '../server/types.js';
import type { OptimizationPlan } from '../server/control/types.js';
import type { PublicTerminalLaunch,TerminalChoice } from '../server/control/terminal-types.js';

const prefix='/api/control/v1';
const choices:TerminalChoice[]=[{id:'terminal',name:'Fixture desktop',available:true,reason:'Test-only operating-system boundary'},{id:'herdr',name:'Herdr',available:false,reason:'No reviewed Herdr in the fixture'}];
async function harness(){const f=await fakeWorkspace(),opened:string[]=[];const plane=new ControlPlane({dataDir:f.data,home:f.home,env:{...f.env,FIXTURE_NATIVE_USAGE:'1',PRIVATE_TEST_KEY:'MUST_NOT_PERSIST'},terminal:{discover:async()=>choices,openScript:async file=>{opened.push(file);}}});const project=await plane.project({path:f.project});
  const preview=async(agent='codex',billing='api',tools:string[]=['rtk','serena'])=>await controlWrite(plane,prefix+'/plans',{agent,profile:tools.length?'custom':'baseline',projectId:project.ref.id,options:{billing,tools},approved:true}) as OptimizationPlan;
  const start=async(plan:OptimizationPlan,requestId:string=randomUUID())=>await controlWrite(plane,prefix+'/terminal-launches',{fingerprint:plan.fingerprint,target:'terminal',requestId,approved:true}) as PublicTerminalLaunch;
  return {...f,plane,opened,preview,start,project,close:async()=>{plane.close();await f.close();}};
}

test('one reviewed launch opens once, claims once, and activates the chosen isolated optimizer stack',async()=>{const h=await harness();try{
  const plan=await h.preview();assert.equal(plan.ready,true,plan.errors.join(' '));const id=randomUUID();const [a,b]=await Promise.all([h.start(plan,id),h.start(plan,id)]);assert.equal(a.id,b.id);assert.equal(h.opened.length,1);assert.equal(h.plane.store.sessionCount(),0,'opening a terminal is not agent execution');
  const script=await readFile(h.opened[0],'utf8');assert.ok(script.includes('sessions')&&script.includes('start-ticket')&&script.includes(id));assert.ok(!script.includes('MUST_NOT_PERSIST'));const before=JSON.stringify(await controlRead(h.plane,prefix+'/terminal-launches','token'));assert.ok(!before.includes(h.home));assert.ok(!before.includes('PATH'));
  await assert.rejects(runTerminalTicket(h.plane,id,{interactive:false}),/interactive terminal/);assert.equal(h.plane.store.terminalLaunch(id)?.state,'waiting');
  assert.equal(await runTerminalTicket(h.plane,id,{interactive:true}),0);await assert.rejects(runTerminalTicket(h.plane,id,{interactive:true}),/already used/);
  const record=h.plane.store.terminalLaunch(id)!;assert.equal(record.state,'exited');assert.ok(record.sessionId);const session=h.plane.store.session(record.sessionId!)!;assert.deepEqual(session.plannedTools,['rtk','serena']);assert.deepEqual(session.appliedTools,['rtk','serena']);assert.equal(session.exitCode,0);assert.equal(session.usage?.inputTokens,1000);assert.equal(session.billing?.mode,'api');assert.ok(session.evidence.every(e=>e.status!=='failed'));assert.ok(!JSON.stringify(session).includes('PRIVATE_ARGUMENT_DO_NOT_STORE'));
}finally{await h.close();}});

test('all four native billing paths retain independent launch approvals and stacks',async()=>{const h=await harness();try{
  for(const [agent,billing,tools] of [['codex','subscription',[]],['codex','api',['rtk','serena','headroom']],['claude','subscription',['serena']],['claude','api',['rtk','serena']]] as const){h.plane.env.FIXTURE_BILLING=billing;const plan=await h.preview(agent,billing,[...tools]);assert.equal(plan.ready,true,plan.errors.join(' '));const launch=await h.start(plan);assert.equal(await runTerminalTicket(h.plane,launch.id,{interactive:true}),0);const s=h.plane.store.session(h.plane.store.terminalLaunch(launch.id)!.sessionId!)!;assert.equal(s.agent,agent);assert.equal(s.billing?.mode,billing);assert.deepEqual(s.plannedTools,[...tools]);}
  assert.equal(h.plane.store.sessionCount(),4);assert.equal(new Set(h.plane.store.sessions().map(s=>s.id)).size,4);
}finally{await h.close();}});

test('the real HTTP launch route requires exact Origin, page capability and explicit bounded approval',async()=>{const h=await harness();const server=makeServer(async()=>({updatedAt:'fixture'}) as Dashboard,h.root,undefined,h.plane);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));try{
  const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`,state=await(await fetch(base+prefix+'/state')).json() as {csrfToken:string};const plan=await h.preview();const body=JSON.stringify({fingerprint:plan.fingerprint,target:'terminal',requestId:randomUUID(),approved:true});
  const headers={'Content-Type':'application/json',Origin:base,'X-Shrinkcage-Token':state.csrfToken};
  for(const value of [{'Content-Type':'application/json'},{...headers,Origin:'https://evil.example'},{...headers,'X-Shrinkcage-Token':'wrong'}])assert.equal((await fetch(base+prefix+'/terminal-launches',{method:'POST',headers:value,body})).status,403);
  assert.equal(h.opened.length,0);assert.equal((await fetch(base+prefix+'/terminal-launches',{method:'POST',headers,body})).status,200);assert.equal(h.opened.length,1);
  assert.equal((await fetch(base+prefix+'/run',{method:'POST',headers,body})).status,404);
}finally{await new Promise<void>(r=>{server.close(()=>r());server.closeAllConnections();});await h.close();}});

test('desktop admission failure is redacted, isolated and recoverable without starting an agent',async()=>{const h=await harness();try{const plan=await h.preview();const launcher=new TerminalLauncher(h.plane,{discover:async()=>choices,openScript:async()=>{throw Error('PRIVATE_DESKTOP_DETAILS');}});const failed=await launcher.start({fingerprint:plan.fingerprint,target:'terminal',requestId:randomUUID()});assert.equal(failed.state,'failed');assert.ok(!JSON.stringify(failed).includes('PRIVATE_DESKTOP_DETAILS'));assert.equal(h.plane.store.sessionCount(),0);const recovered=await h.start(plan);assert.equal(recovered.state,'waiting');assert.equal(h.opened.length,1);}finally{await h.close();}});

test('Herdr discovery rejects unreviewed versions and prereleases despite matching config capabilities',{skip:process.platform==='win32'},async()=>{const f=await fakeWorkspace();try{const file=join(f.bin,'herdr');await writeFile(file,"#!/usr/bin/env node\nconst a=process.argv.slice(2);console.log(a[0]==='--version'?'herdr '+process.env.FIXTURE_HERDR_VERSION:a[0]==='--default-config'?'default_shell = \\\"\\\"; shell_mode = \\\"auto\\\"':'--session');");await chmod(file,0o700);for(const version of ['0.9.5','0.9.5-beta','0.10.0']){const choice=(await inspectTerminals({...f.env,FIXTURE_HERDR_VERSION:version})).find(c=>c.id==='herdr')!;assert.equal(choice.version,version);if(version==='0.9.5')assert.ok(!choice.reason.includes('does not expose'));else{assert.equal(choice.available,false);assert.match(choice.reason,/reviewed/);}}}finally{await f.close();}});

test('unreviewed commands, targets, missing approval, stale previews and reused IDs fail before opening',async()=>{const h=await harness();try{
  const plan=await h.preview();const request={fingerprint:plan.fingerprint,target:'terminal',requestId:randomUUID(),approved:true};
  await assert.rejects(controlWrite(h.plane,prefix+'/terminal-launches',{...request,command:'touch /tmp/unsafe'}),/Unknown|Unexpected|Unsupported/i);
  await assert.rejects(controlWrite(h.plane,prefix+'/terminal-launches',{...request,target:'https://example.com'}),/terminal/);
  await assert.rejects(controlWrite(h.plane,prefix+'/terminal-launches',{...request,approved:false}),/approval/);
  await assert.rejects(controlWrite(h.plane,prefix+'/terminal-launches',{...request,target:'herdr'}),/No reviewed Herdr/);
  await assert.rejects(controlWrite(h.plane,prefix+'/terminal-launches',{...request,requestId:'../../anything'}),/reviewed plan/);
  const preview=h.plane.store.terminalPreview(plan.fingerprint)!;h.plane.store.saveTerminalPreview({...preview,expiresAt:0});await assert.rejects(h.start(plan),/expired/);assert.equal(h.opened.length,0);
  const fresh=await h.preview();const launch=await h.start(fresh);const other=await h.preview('codex','subscription',[]);await assert.rejects(h.start(other,launch.id),/another configuration/);assert.equal(h.opened.length,1);
}finally{await h.close();}});

test('configuration changes after terminal opening are rejected by the existing runner with no agent launch',async()=>{const h=await harness();try{
  const plan=await h.preview(),launch=await h.start(plan);h.plane.env.FIXTURE_CODEX_VERSION='0.166.0';await assert.rejects(runTerminalTicket(h.plane,launch.id,{interactive:true}),/stale/);assert.equal(h.plane.store.terminalLaunch(launch.id)?.state,'failed');assert.equal(h.plane.store.sessionCount(),0);
}finally{await h.close();}});

test('terminal failures, expired tickets, symlink launch roots and shell quoting fail safely',async()=>{const h=await harness();try{
  const plan=await h.preview();const root=join(h.plane.store.dir,'launchers');const outside=join(h.root,'outside-launchers');await mkdir(outside);await symlink(outside,root,process.platform==='win32'?'junction':'dir');const failed=await h.start(plan);assert.equal(failed.state,'failed');assert.match(failed.error??'',/symlink/);assert.equal(h.opened.length,0);
  const text="a'b;$(echo unsafe)";const roundtrip=process.platform==='win32'?spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command','Write-Output '+powershellQuote(text)],{encoding:'utf8',shell:false}):spawnSync('/bin/sh',['-c','printf %s '+shellQuote(text)],{encoding:'utf8',shell:false});assert.equal(roundtrip.status,0,roundtrip.stderr);assert.equal(roundtrip.stdout.trimEnd(),text);
  const id=randomUUID(),preview=h.plane.store.terminalPreview(plan.fingerprint)!;h.plane.store.reserveTerminalLaunch({id,fingerprint:plan.fingerprint,target:'terminal',createdAt:new Date().toISOString(),expiresAt:0,state:'waiting',sessionId:null,error:null,preview});await assert.rejects(runTerminalTicket(h.plane,id,{interactive:true}),/expired/);assert.equal(h.plane.store.sessionCount(),0);
}finally{await h.close();}});
