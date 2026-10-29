import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,readFile,writeFile,rm,symlink,rename,lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ControlStore } from '../server/control/store.js';
import { projectDirectory,guardedFile,readBounded } from '../server/control/paths.js';
import { previewSetup,applySetup,previewUndo,undoSetup,atomicProjectWrite,mergeHookRollback,nativeHookCommand,rtkChanges } from '../server/control/transactions.js';
import { digest } from '../server/control/schema.js';
import { sameOpenedFile } from '../server/control/paths.js';
import { inspectConfiguration } from '../server/control/config.js';
import { DEFAULT_PROFILES } from '../server/control/profiles.js';
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'shrinkcage-config-'));const project=join(dir,'project');await mkdir(project);const {path,ref}=await projectDirectory(project);const store=new ControlStore(join(dir,'data'));return {dir,project:path,ref,store,close:async()=>{store.close();await rm(dir,{recursive:true,force:true});}};}
const original={hooks:{PreToolUse:[{matcher:'Other',hooks:[{type:'command',command:'safe-existing-tool'}]}]},userSetting:'kept'};

test('T05 versioned profiles use compare-and-swap, survive reopening and reject baseline mutation',async()=>{
  const f=await fixture();try{
    const value={...DEFAULT_PROFILES[1].profile,id:'custom',name:'Custom'};const saved=f.store.saveProfile(value,0);assert.equal(saved.revision,1);assert.throws(()=>f.store.saveProfile(value,0),/another window/);
    assert.equal(f.store.saveProfile({...value,description:'Updated'},1).revision,2);assert.throws(()=>f.store.saveProfile(DEFAULT_PROFILES[0].profile,0),/immutable/);assert.throws(()=>f.store.saveProfile(value,-1));assert.throws(()=>f.store.removeProfile('baseline',0));
    assert.throws(()=>f.store.removeProfile('custom',1));f.store.removeProfile('custom',2);assert.equal(f.store.profiles().some(p=>p.profile.id==='custom'),false);
    const attempts=await Promise.allSettled(Array.from({length:25},()=>Promise.resolve().then(()=>f.store.saveProfile(value,0))));assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
    const second=new ControlStore(join(f.dir,'data'));try{assert.equal(second.profiles().find(p=>p.profile.id==='custom')?.revision,1);}finally{second.close();}
  }finally{await f.close();}
});
test('T06 native project setup is previewed, approved, backed up, idempotent and exactly reversible',async()=>{
  const f=await fixture();try{
    await mkdir(join(f.project,'.codex'));const bytes=JSON.stringify(original,null,4)+'\n';await writeFile(join(f.project,'.codex/hooks.json'),bytes);await writeFile(join(f.project,'AGENTS.md'),'User rules');await writeFile(join(f.project,'.codex/config.toml'),'model = "test"\n');
    const p=await previewSetup(f.project,f.ref,f.store);assert.equal(p.preview.files.length,2);assert.equal(p.preview.ready,true);
    await assert.rejects(applySetup(f.project,f.ref,f.store,'not-approved','1.1.0'),/fingerprint/);assert.equal(await readFile(join(f.project,'.codex/hooks.json'),'utf8'),bytes);
    const receipt=await applySetup(f.project,f.ref,f.store,p.preview.fingerprint,'1.1.0');assert.equal(receipt?.status,'applied');const hooked=JSON.parse(await readFile(join(f.project,'.codex/hooks.json'),'utf8'));assert.equal(hooked.hooks.PreToolUse[0].hooks[0].command,'safe-existing-tool');assert.equal(hooked.hooks.PreToolUse[1].hooks[0].command,nativeHookCommand(f.project));
    const again=await previewSetup(f.project,f.ref,f.store);assert.equal(again.changes.length,0);assert.equal((await applySetup(f.project,f.ref,f.store,again.preview.fingerprint,'1.1.0'))?.id,receipt!.id);
    assert.equal(await readFile(join(f.project,'AGENTS.md'),'utf8'),'User rules');assert.equal(await readFile(join(f.project,'.codex/config.toml'),'utf8'),'model = "test"\n');
    const undo=await previewUndo(f.project,f.ref,f.store);await assert.rejects(undoSetup(f.project,f.ref,f.store,'wrong'),/stale/);await undoSetup(f.project,f.ref,f.store,undo.fingerprint);assert.equal(await readFile(join(f.project,'.codex/hooks.json'),'utf8'),bytes);assert.equal(f.store.receipts()[0].status,'undone');await assert.rejects(lstat(join(f.project,'.codex/shrinkcage-rtk.mjs')));
  }finally{await f.close();}
});
test('T06 newly created resources are removed, while concurrent unrelated hook edits survive undo',async()=>{
  const f=await fixture();try{
    const p=await previewSetup(f.project,f.ref,f.store);await applySetup(f.project,f.ref,f.store,p.preview.fingerprint,'1.1.0');
    const path=join(f.project,'.codex/hooks.json'),data=JSON.parse(await readFile(path,'utf8'));data.unrelated='preserve';data.hooks.PreToolUse.push({matcher:'Other',hooks:[{type:'command',command:'user-added'}]});await writeFile(path,JSON.stringify(data));
    const u=await previewUndo(f.project,f.ref,f.store);await undoSetup(f.project,f.ref,f.store,u.fingerprint);const kept=JSON.parse(await readFile(path,'utf8'));assert.equal(kept.unrelated,'preserve');assert.equal(kept.hooks.PreToolUse.length,1);assert.equal(kept.hooks.PreToolUse[0].hooks[0].command,'user-added');
    const next=await previewSetup(f.project,f.ref,f.store);await applySetup(f.project,f.ref,f.store,next.preview.fingerprint,'1.1.0');await undoSetup(f.project,f.ref,f.store,(await previewUndo(f.project,f.ref,f.store)).fingerprint);
  }finally{await f.close();}
});
test('T06 user edits to owned resources cause visible conflicts and never get overwritten',async()=>{
  const f=await fixture();try{
    await applySetup(f.project,f.ref,f.store,(await previewSetup(f.project,f.ref,f.store)).preview.fingerprint,'1.1.0');
    await writeFile(join(f.project,'.codex/shrinkcage-rtk.mjs'),'User changed this');assert.equal((await previewSetup(f.project,f.ref,f.store)).preview.ready,false);
    await assert.rejects(undoSetup(f.project,f.ref,f.store,(await previewUndo(f.project,f.ref,f.store)).fingerprint),/changed/);assert.equal(await readFile(join(f.project,'.codex/shrinkcage-rtk.mjs'),'utf8'),'User changed this');assert.equal(f.store.receipts()[0].status,'conflict');
  }finally{await f.close();}
});
test('T06 malformed and unowned configurations fail closed without taking ownership',async()=>{
  const f=await fixture();try{
    await assert.rejects(previewUndo(f.project,f.ref,f.store),/No owned/);await mkdir(join(f.project,'.codex'));
    for(const content of ['{bad','[]','{"hooks":null}','{"hooks":{"PreToolUse":{}}}','{"hooks":{"PreToolUse":[null]}}','{"hooks":{"PreToolUse":[{"hooks":[null]}]}}']){await writeFile(join(f.project,'.codex/hooks.json'),content);const p=await previewSetup(f.project,f.ref,f.store);assert.equal(p.preview.ready,false);}
    await writeFile(join(f.project,'.codex/hooks.json'),JSON.stringify({hooks:{PreToolUse:[{hooks:[{command:'rtk hook codex'}]}]}}));assert.equal((await previewSetup(f.project,f.ref,f.store)).preview.ready,false);
    await writeFile(join(f.project,'.codex/hooks.json'),'{}');await writeFile(join(f.project,'.codex/shrinkcage-rtk.mjs'),'unowned');assert.equal((await previewSetup(f.project,f.ref,f.store)).preview.ready,false);assert.equal(f.store.receipts().length,0);
  }finally{await f.close();}
});
test('T07 20 concurrent setup requests are idempotent and never duplicate registered hooks',async()=>{
  const f=await fixture();try{
    const p=await previewSetup(f.project,f.ref,f.store);const results=await Promise.allSettled(Array.from({length:20},()=>applySetup(f.project,f.ref,f.store,p.preview.fingerprint,'1.1.0')));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const data=JSON.parse(await readFile(join(f.project,'.codex/hooks.json'),'utf8'));assert.equal(data.hooks.PreToolUse.length,1);assert.equal(f.store.receipts().length,1);
    const u=await previewUndo(f.project,f.ref,f.store);await undoSetup(f.project,f.ref,f.store,u.fingerprint);await assert.rejects(readFile(join(f.project,'.codex/hooks.json')));
  }finally{await f.close();}
});
test('T19 mid-apply failure rolls back only completed writes; interrupted receipts require recovery',async()=>{
  const f=await fixture();try{
    const p=await previewSetup(f.project,f.ref,f.store);await assert.rejects(applySetup(f.project,f.ref,f.store,p.preview.fingerprint,'1.1.0',{beforeWrite:async index=>{if(index===1)throw Error('synthetic interruption');}}),/did not complete/);
    assert.equal(f.store.receipts()[0].status,'undone');await assert.rejects(readFile(join(f.project,'.codex/shrinkcage-rtk.mjs')));
    await applySetup(f.project,f.ref,f.store,(await previewSetup(f.project,f.ref,f.store)).preview.fingerprint,'1.1.0');const receipt=f.store.receipts().find(r=>r.status==='applied')!;receipt.status='preparing';f.store.putReceipt(receipt);assert.equal((await previewSetup(f.project,f.ref,f.store)).preview.ready,false);
    await undoSetup(f.project,f.ref,f.store,(await previewUndo(f.project,f.ref,f.store)).fingerprint);assert.equal(f.store.receipts().find(r=>r.id===receipt.id)?.status,'undone');
  }finally{await f.close();}
});
test('T14 compare-before-write detects simultaneous edits, unsafe targets and oversized files',async()=>{
  const opened={ino:9007199254740993n,dev:123n};assert.equal(sameOpenedFile({ino:opened.ino,dev:0n},opened,'win32'),true);for(const [named,platform] of [[{ino:opened.ino+1n,dev:0n},'win32'],[{ino:opened.ino,dev:124n},'win32'],[{ino:opened.ino,dev:0n},'linux']] as const)assert.equal(sameOpenedFile(named,opened,platform),false);

  const f=await fixture();try{
    await mkdir(join(f.project,'.codex'));const target=join(f.project,'.codex/hooks.json');await writeFile(target,'{}');const old=digest('{}');
    await assert.rejects(atomicProjectWrite(f.project,'.codex/hooks.json','wrong',Buffer.from('new')),/changed/);
    await assert.rejects(atomicProjectWrite(f.project,'.codex/hooks.json',old,Buffer.from('new'),()=>writeFile(target,'concurrent-user-edit')),/changed/);assert.equal(await readFile(target,'utf8'),'concurrent-user-edit');
    await assert.rejects(atomicProjectWrite(f.project,'.codex/hooks.json',old,Buffer.alloc(262145)),/size/);await writeFile(target,'x'.repeat(262145));await assert.rejects(readBounded(target));
    await assert.rejects(guardedFile(f.project,'../escape' as never));await assert.rejects(guardedFile('relative','.codex/hooks.json'));
    await assert.rejects(projectDirectory('/'));await assert.rejects(projectDirectory('https://example.org'));await assert.rejects(projectDirectory('\\\\network\\share'));
    const config=await inspectConfiguration(f.project,{CODEX_HOME:join(f.dir,'isolated')});assert.ok(config.errors.length>0);
  }finally{await f.close();}
});
test('T14 directory symlink swaps and non-directory .codex never escape the project',async()=>{
  const f=await fixture();try{
    const outside=join(f.dir,'outside');await mkdir(outside);await writeFile(join(outside,'hooks.json'),'PRIVATE_OUTSIDE');
    await symlink(outside,join(f.project,'.codex'),process.platform==='win32'?'junction':'dir');await assert.rejects(guardedFile(f.project,'.codex/hooks.json'),/symlink/);await rm(join(f.project,'.codex'));
    await writeFile(join(f.project,'.codex'),'not-directory');await assert.rejects(guardedFile(f.project,'.codex/hooks.json'),/not a directory/);await rm(join(f.project,'.codex'));await mkdir(join(f.project,'.codex'));await writeFile(join(f.project,'.codex/hooks.json'),'{}');
    await assert.rejects(atomicProjectWrite(f.project,'.codex/hooks.json',digest('{}'),Buffer.from('new'),async()=>{await rename(join(f.project,'.codex'),join(f.project,'.codex-old'));await symlink(outside,join(f.project,'.codex'),process.platform==='win32'?'junction':'dir');}));
    assert.equal(await readFile(join(outside,'hooks.json'),'utf8'),'PRIVATE_OUTSIDE');
  }finally{await f.close();}
});
test('T06 rollback merge requires an exact single owned hook and preserves other groups',()=>{
  const hook={type:'command',command:'node owned-rtk'};const before=Buffer.from('{}');const after=Buffer.from(JSON.stringify({hooks:{PreToolUse:[{matcher:'Bash',hooks:[hook]}]}}));
  for(const value of ['bad','[]','{}',JSON.stringify({hooks:{PreToolUse:[{hooks:[{...hook,command:'edited'}]}]}}),JSON.stringify({hooks:{PreToolUse:[{hooks:[hook,hook]}]}})])assert.throws(()=>mergeHookRollback(Buffer.from(value),after,before));
  assert.throws(()=>mergeHookRollback(after,Buffer.from('bad'),before));assert.throws(()=>mergeHookRollback(after,after,Buffer.from('bad')));assert.throws(()=>mergeHookRollback(after,before,null));
  const current=Buffer.from(JSON.stringify({keep:true,hooks:{PreToolUse:[{matcher:'Bash',hooks:[hook,{type:'command',command:'keep'}]}]}}));const result=JSON.parse(mergeHookRollback(current,after,before).toString());assert.equal(result.keep,true);assert.equal(result.hooks.PreToolUse[0].hooks[0].command,'keep');
});
test('T06 TOML and hook inspections expose only facts and hashes, not private values',async()=>{
  const f=await fixture();try{
    const home=join(f.dir,'codex-home');await mkdir(home);await mkdir(join(f.project,'.codex'));
    await writeFile(join(home,'config.toml'),'model_provider="private-provider"\n[features]\nhooks=false\n[mcp_servers.serena]\ncommand="serena"\n[mcp_servers.shrinkcage_reserved]\ncommand="PRIVATE_COMMAND"\n');
    await writeFile(join(home,'hooks.json'),JSON.stringify({hooks:{SessionStart:[{hooks:[{command:'headroom start PRIVATE_TOKEN'},{command:'codemem capture PRIVATE_PROMPT'}]}]}}));
    const info=await inspectConfiguration(f.project,{CODEX_HOME:home});assert.equal(info.hooksDisabled,true);assert.equal(info.serenaEntries,1);assert.equal(info.reservedMcp,true);assert.equal(info.headroomHooks,1);assert.equal(info.memoryHooks,1);assert.ok(!JSON.stringify(info).includes('PRIVATE_'));assert.ok(!JSON.stringify(info).includes(f.dir));
    await writeFile(join(f.project,'.codex/config.toml'),'[mcp_servers.serena]\ncommand="serena"\n');assert.equal((await inspectConfiguration(f.project,{CODEX_HOME:home})).serenaEntries,1);
    await writeFile(join(f.project,'.codex/config.toml'),'[mcp_servers.serena]\nenabled=false\n');assert.equal((await inspectConfiguration(f.project,{CODEX_HOME:home})).serenaEntries,0);
    await writeFile(join(f.project,'.codex/config.toml'),'[invalid');assert.ok((await inspectConfiguration(f.project,{CODEX_HOME:home})).errors.length>0);
  }finally{await f.close();}
});

test('T19 an actual process crash recovers its journal, lock and temporary inode without config loss',async()=>{
  const f=await fixture();try{
    const worker=join(f.dir,'crash-worker.mjs');const tx=new URL('../server/control/transactions.ts',import.meta.url).href,db=new URL('../server/control/store.ts',import.meta.url).href;
    await writeFile(worker,`import {ControlStore} from ${JSON.stringify(db)};import {previewSetup,applySetup} from ${JSON.stringify(tx)};const store=new ControlStore(${JSON.stringify(join(f.dir,'data'))});const root=${JSON.stringify(f.project)},project=${JSON.stringify(f.ref)};const preview=await previewSetup(root,project,store);await applySetup(root,project,store,preview.preview.fingerprint,'1.1.0',{beforeWrite:async i=>{if(i===1)process.kill(process.pid,'SIGKILL');}});`);
    const child=spawn(process.execPath,['--import',import.meta.resolve('tsx'),worker],{stdio:'ignore',shell:false});const exit=await new Promise<{code:number|null;signal:string|null}>((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});assert.ok(exit.code!==0||exit.signal);
    assert.equal(f.store.receipts()[0].status,'preparing');assert.ok(f.store.lockProof(f.ref.id));
    const preview=await previewUndo(f.project,f.ref,f.store);await undoSetup(f.project,f.ref,f.store,preview.fingerprint);assert.equal(f.store.receipts()[0].status,'undone');assert.equal(f.store.lockProof(f.ref.id),undefined);
    await assert.rejects(lstat(join(f.project,'.codex/shrinkcage-rtk.mjs')));await assert.rejects(lstat(join(f.project,'.codex/hooks.json')));const fs=await import('node:fs/promises');assert.deepEqual(await fs.readdir(join(f.project,'.codex')),[]);
  }finally{await f.close();}
});
test('T09 an unowned lock or a live/reused PID never authorizes destructive lock recovery',async()=>{
  const f=await fixture();try{
    await mkdir(join(f.project,'.codex'));const lock=join(f.project,'.codex/.shrinkcage-control.lock');const preview=await previewSetup(f.project,f.ref,f.store);await writeFile(lock,'unowned');await assert.rejects(applySetup(f.project,f.ref,f.store,preview.preview.fingerprint,'1.1.0'),/unowned/);assert.equal(await readFile(lock,'utf8'),'unowned');await rm(lock);
    const token='owned-test-token';assert.equal(f.store.reserveLock(f.ref.id,token),true);await writeFile(lock,token);await assert.rejects(applySetup(f.project,f.ref,f.store,preview.preview.fingerprint,'1.1.0'),/locked/);assert.equal(await readFile(lock,'utf8'),token);assert.equal(f.store.lockProof(f.ref.id)?.pid,process.pid);f.store.releaseLock(f.ref.id,token);await rm(lock);
  }finally{await f.close();}
});


test('T05-T19 unknown database versions and corrupt profile state fail closed without replacement',async()=>{
  const f=await fixture();try{
    const root=join(f.dir,'migration');const store=new ControlStore(root);store.saveProfile({...DEFAULT_PROFILES[1].profile,id:'persisted',name:'Persisted'},0);store.close();
    const file=join(root,'control','state.sqlite');const database=new DatabaseSync(file);database.exec('PRAGMA user_version=99');database.close();assert.throws(()=>new ControlStore(root),/newer/);
    const corrupt=new DatabaseSync(file);corrupt.exec('PRAGMA user_version=1');corrupt.prepare('UPDATE profiles SET value=? WHERE id=?').run('{invalid','persisted');corrupt.close();
    const opened=new ControlStore(root);try{assert.throws(()=>opened.profiles(),/malformed/);}finally{opened.close();}
    const unchanged=new DatabaseSync(file);try{assert.equal(unchanged.prepare('SELECT value FROM profiles WHERE id=?').get('persisted')?.value,'{invalid');}finally{unchanged.close();}
  }finally{await f.close();}
});
