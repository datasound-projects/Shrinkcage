import {randomUUID} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {chmod,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {discoverDesktops,selectDesktop,desktopCommand,TERMINAL_ADAPTERS} from '../server/control/desktop-terminals.js';
import {fakeWorkspace} from './control-fixtures.js';
import {ControlPlane} from '../server/control/core.js';
import {controlWrite} from '../server/control/api.js';
test('discovery excludes shells, missing tools and headless desktops, finds custom PATH installations',async()=>{
 const f=await fakeWorkspace();try{for(const name of ['kitty','alacritty','bash']){await writeFile(join(f.bin,name),'#!/bin/sh\nexit 0\n');await chmod(join(f.bin,name),0o700);}
 const env={...f.env,DISPLAY:':fixture'};const found=await discoverDesktops(env,'linux');assert.deepEqual(found.map(t=>t.id).sort(),['alacritty','kitty']);assert.equal((await discoverDesktops({...env,DISPLAY:'',WAYLAND_DISPLAY:''},'linux')).length,0);
 assert.equal(selectDesktop(found,undefined,'kitty').id,'kitty');assert.equal(selectDesktop(found,undefined,'removed').id,'kitty');assert.equal(selectDesktop([found[0]]).id,found[0].id);assert.throws(()=>selectDesktop(found,'removed'),/no longer/);assert.throws(()=>selectDesktop([]),/No compatible/);
 }finally{await f.close();}
});
test('all launch adapters keep owned paths as single arguments, preserve Herdr wrapper and reject unreviewed IDs',()=>{
 const file="/tmp/project with spaces/quote'$/herdr.command";
 for(const a of TERMINAL_ADAPTERS)for(const platform of a.platforms){const t={id:a.id,name:a.name,icon:a.icon,command:'/trusted/'+a.id,...(platform==='darwin'?{bundle:'/Custom Apps/'+a.app+'.app'}:{})};const c=desktopCommand(t,file,platform);assert.ok(c.args.includes(file));assert.ok(!c.args.includes('-c'));}
 assert.throws(()=>desktopCommand({id:'bash',name:'bad',icon:'',command:'/bin/bash'},file),/Unsupported/);
 assert.throws(()=>desktopCommand({id:'windows-terminal',name:'WT',icon:'',command:'wt.exe'},'C:/bad;path/start.ps1','win32'),/safely/);
});
test('terminal preference persists in SQLite and browser mutation rejects arbitrary fields and IDs',async()=>{
 const f=await fakeWorkspace();let p=new ControlPlane({env:f.env,home:f.home,dataDir:f.data});try{p.store.setTerminalPreference('kitty');p.close();p=new ControlPlane({env:f.env,home:f.home,dataDir:f.data});assert.equal(p.store.terminalPreference(),'kitty');await assert.rejects(controlWrite(p,'/api/control/v1/terminal-emulators/preference',{id:'shell-command',approved:true}));await assert.rejects(controlWrite(p,'/api/control/v1/terminal-emulators/rescan',{command:'malicious',approved:true}));assert.equal(p.store.terminalPreference(),'kitty');}finally{p.close();await f.close();}
});

test('removed selection blocks before opening and failed open cannot start an agent',{skip:process.platform==='win32'},async()=>{
 const f=await fakeWorkspace();let available=true,opened=0;const plane=new ControlPlane({env:f.env,home:f.home,dataDir:f.data,terminal:{desktopDiscovery:async()=>available?[{id:'wezterm',name:'WezTerm',icon:'▤',command:'/fixture/wezterm'}]:[],discover:async()=>[{id:'herdr',name:'Herdr',available:true,reason:'Fixture'}],openScript:async()=>{opened++;throw Error('Fixture open failed');}}});try{
 await writeFile(join(f.bin,'herdr'),'#!/bin/sh\nexit 0\n');await chmod(join(f.bin,'herdr'),0o700);
 const project=await plane.project({path:f.project}),{plan}=await plane.plan('codex','baseline',{id:project.ref.id});plane.terminals.remember(plan,{agent:'codex',profile:'baseline',projectId:project.ref.id,options:{}});
 available=false;await assert.rejects(plane.terminals.start({fingerprint:plan.fingerprint,target:'herdr',emulator:'wezterm',requestId:randomUUID()}),/no longer/);assert.equal(opened,0);assert.equal(plane.store.terminalLaunches().length,0);
 available=true;const result=await plane.terminals.start({fingerprint:plan.fingerprint,target:'herdr',emulator:'wezterm',requestId:randomUUID()});assert.equal(result.state,'failed');assert.equal(opened,1);assert.equal(plane.store.sessionCount(),0);
 }finally{plane.close();await f.close();}
});
