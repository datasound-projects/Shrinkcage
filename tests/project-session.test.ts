import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod,mkdir,readFile,rename,symlink,unlink,writeFile } from 'node:fs/promises';
import { join,dirname,parse } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ControlPlane } from '../server/control/core.js';
import { controlRead,controlWrite } from '../server/control/api.js';
import { runBounded } from '../server/control/probe.js';
import { pickerArguments,pickProjectDirectory,pickerSelection } from '../server/control/project-picker.js';
import { runTerminalTicket } from '../server/control/terminal.js';
import { makeServer } from '../server/http.js';
import { fakeWorkspace } from './control-fixtures.js';

const prefix='/api/control/v1';
test('native folder selection registers only the selected canonical project; cancellation is inert',async()=>{
  const f=await fakeWorkspace();let selected:string|null=null;
  const plane=new ControlPlane({dataDir:f.data,home:f.home,env:f.env,pickDirectory:async()=>selected});
  try{assert.deepEqual(await controlWrite(plane,prefix+'/projects/pick',{approved:true}),{cancelled:true});assert.equal(plane.store.projects().length,0);
    selected=f.project;const value=await controlWrite(plane,prefix+'/projects/pick',{approved:true}) as {project:{id:string;label:string}};assert.equal(plane.store.projects().length,1);assert.equal(plane.store.projectPath(value.project.id),f.project);assert.ok(!JSON.stringify(value).includes(f.home));assert.ok(!JSON.stringify(value).includes(f.project));
    await controlWrite(plane,prefix+'/projects/pick',{approved:true});assert.equal(plane.store.projects().length,1,'choosing the same folder does not duplicate it');
  }finally{plane.close();await f.close();}
});
test('folder selection rejects credentials, home, roots, symlinks and browser command/path injection',async()=>{
  const f=await fakeWorkspace();let selected:string|null=null,calls=0;const plane=new ControlPlane({dataDir:f.data,home:f.home,env:f.env,pickDirectory:async()=>{calls++;return selected;}});
  try{for(const value of [{approved:false},{approved:true,path:f.project},{approved:true,command:'arbitrary'},{approved:true,url:'http://example.com'}])await assert.rejects(controlWrite(plane,prefix+'/projects/pick',value));assert.equal(calls,0);
    await mkdir(join(f.home,'.ssh'));for(const path of [f.home,parse(f.project).root,join(f.home,'.ssh'),'relative-project',f.project+'\nsecret']){selected=path;await assert.rejects(controlWrite(plane,prefix+'/projects/pick',{approved:true}));}assert.equal(plane.store.projects().length,0);
    const alias=join(f.root,'alias');await symlink(f.project,alias,process.platform==='win32'?'junction':'dir');selected=alias;await assert.rejects(plane.pickProject(),/symlink/);
  }finally{plane.close();await f.close();}
});
test('only one native folder dialog can be open and the lock recovers after cancel or failure',async()=>{
  const f=await fakeWorkspace();let release!:(path:string|null)=>void;let fail=false;const plane=new ControlPlane({dataDir:f.data,home:f.home,env:f.env,pickDirectory:()=>fail?Promise.reject(Error('native failure')):new Promise(r=>{release=r;})});
  try{const first=plane.pickProject();await assert.rejects(plane.pickProject(),/already open/);release(null);assert.deepEqual(await first,{cancelled:true});fail=true;await assert.rejects(plane.pickProject());fail=false;const second=plane.pickProject();release(f.project);assert.equal((await second).cancelled,false);
  }finally{plane.close();await f.close();}
});
test('folder dialogs use fixed platform scripts and explicit argument arrays',async()=>{
  const encoded=await runBounded({command:process.execPath,prefix:[],fingerprint:'test-only'},['-e',"const b=Buffer.from('ś');process.stdout.write(b.subarray(0,1));setTimeout(()=>process.stdout.write(b.subarray(1)),25);"]);assert.equal(encoded.stdout,'ś','split UTF-8 output preserves folder names');
  assert.equal(pickerSelection('/tmp/my project \n'),'/tmp/my project ');assert.equal(pickerSelection('C:\\Projects\\my app\r\n'),'C:\\Projects\\my app');assert.equal(pickerSelection('\n'),null);assert.throws(()=>pickerSelection('/tmp/first\n/tmp/second\n'));assert.throws(()=>pickerSelection('/tmp/bad\0folder'));
  assert.deepEqual(pickerArguments('darwin').slice(0,1),['-e']);assert.match(pickerArguments('darwin')[1],/choose folder/);assert.match(pickerArguments('darwin')[1],/number -128/);
  assert.deepEqual(pickerArguments('win32').slice(0,3),['-NoProfile','-STA','-Command']);assert.match(pickerArguments('win32')[3],/FolderBrowserDialog/);
  assert.deepEqual(pickerArguments('linux'),['--file-selection','--directory','--title=Choose a project for Shrinkcage']);
  if(process.platform==='linux')await assert.rejects(pickProjectDirectory({DISPLAY:undefined,WAYLAND_DISPLAY:undefined}),/No desktop/);
});
test('native picker HTTP boundary requires exact Origin, process capability and an approved action',async()=>{
  const f=await fakeWorkspace();let calls=0;const plane=new ControlPlane({dataDir:f.data,home:f.home,env:f.env,pickDirectory:async()=>{calls++;return null;}});const server=makeServer(async()=>{throw Error('No metrics');},join(f.root,'empty'),undefined,plane);
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
  try{const state=await(await fetch(base+prefix+'/state')).json();const headers={'Content-Type':'application/json','Origin':base,'X-Shrinkcage-Token':state.csrfToken};
    assert.equal((await fetch(base+prefix+'/projects/pick')).status,404);assert.equal(calls,0);
    for(const extra of [{Origin:'https://evil.example'},{'X-Shrinkcage-Token':'wrong'}])assert.equal((await fetch(base+prefix+'/projects/pick',{method:'POST',headers:{...headers,...extra},body:JSON.stringify({approved:true})})).status,403);
    assert.equal((await fetch(base+prefix+'/projects/pick',{method:'POST',headers,body:JSON.stringify({approved:false})})).status,403);
    assert.equal((await fetch(base+prefix+'/projects/pick',{method:'POST',headers,body:JSON.stringify({approved:true})})).status,200);assert.equal(calls,1);
  }finally{await new Promise<void>(r=>server.close(()=>r()));plane.close();await f.close();}
});
test('Herdr reconnect validates owned files and live session identity without creating another agent',{skip:process.platform==='win32'},async()=>{
  const f=await fakeWorkspace(),opened:string[]=[];let live=true,moveDuringProbe=false;let ownedPath='';await writeFile(join(f.bin,'herdr'),'#!/bin/sh\nexit 0\n');await chmod(join(f.bin,'herdr'),0o700);
  const plane=new ControlPlane({dataDir:f.data,home:f.home,env:{...f.env,FIXTURE_NATIVE_USAGE:'1',PRIVATE_KEY:'NEVER_STORE_THIS'},terminal:{discover:async()=>[{id:'herdr',name:'Herdr',available:true,reason:'Test-only desktop boundary'}],openScript:async file=>{opened.push(file);},sessionRunning:async()=>{if(moveDuringProbe){await rename(ownedPath,ownedPath+'-raced');await symlink(ownedPath+'-raced',ownedPath);}return live;}}});
  try{const project=await plane.project({path:f.project});const {plan}=await plane.plan('codex','lean',{id:project.ref.id},{billing:'api'});plane.terminals.remember(plan,{agent:'codex',profile:'lean',projectId:project.ref.id,options:{billing:'api'}});const id=randomUUID();await plane.terminals.start({fingerprint:plan.fingerprint,target:'herdr',requestId:id});
    const ticket=plane.store.terminalLaunch(id)!;assert.ok(ticket.herdr);const config=await readFile(join(dirname(opened[0]),'herdr.toml'),'utf8');assert.match(config,/resume_agents_on_restore = false/);assert.ok(!config.includes('NEVER_STORE_THIS'));
    await runTerminalTicket(plane,id,{interactive:true});const session=plane.store.sessions()[0];assert.deepEqual(session.plannedTools,['rtk']);assert.equal(opened.length,1);
    assert.deepEqual(await controlWrite(plane,prefix+'/sessions/reopen',{id:session.id,approved:true}),{opened:true,sessionId:session.id});assert.equal(opened.length,2);assert.equal(plane.store.sessionCount(),1);assert.deepEqual(plane.store.sessions()[0].plannedTools,['rtk']);
    await assert.rejects(runTerminalTicket(plane,id,{interactive:true}),/already used/);const state=await plane.state();assert.equal(state.herdrSessions?.[0].sessionId,session.id);assert.ok(!JSON.stringify(state.herdrSessions).includes(f.root));
    live=false;await assert.rejects(plane.terminals.reopen(session.id),/no longer running/);assert.equal(opened.length,2);live=true;
    const wrapper=opened[0],body=await readFile(wrapper,'utf8');await writeFile(wrapper,body+'\n# changed');await assert.rejects(plane.terminals.reopen(session.id),/changed/);assert.equal(opened.length,2);await writeFile(wrapper,body);
    const owned=dirname(wrapper),moved=owned+'-moved';await rename(owned,moved);await symlink(moved,owned);await assert.rejects(plane.terminals.reopen(session.id),/moved or changed/);assert.equal(opened.length,2);assert.equal(await readFile(join(moved,'herdr.command'),'utf8'),body);
    await unlink(owned);await rename(moved,owned);ownedPath=owned;moveDuringProbe=true;await assert.rejects(plane.terminals.reopen(session.id),/moved or changed/);assert.equal(opened.length,2,'moving the directory during the live-status probe cannot open a replacement');
    await assert.rejects(controlWrite(plane,prefix+'/sessions/reopen',{id:session.id,approved:true,command:'arbitrary'}));await assert.rejects(plane.terminals.reopen('../arbitrary'));
  }finally{plane.close();await f.close();}
});
