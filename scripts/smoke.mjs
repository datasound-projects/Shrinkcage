import {spawnSync,spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const pkg=JSON.parse(await readFile('package.json','utf8'));const dir=await mkdtemp(join(tmpdir(),'shrinkcage-package-'));
let child;
try{
  assert.ok(process.env.npm_execpath,'Run npm run smoke');
  const install=spawnSync(process.execPath,[process.env.npm_execpath,'install','--prefix',dir,'--ignore-scripts','--no-audit','--no-fund','--omit=dev',join(process.cwd(),'release',`${pkg.name}-${pkg.version}.tgz`)],{encoding:'utf8',shell:false});
  assert.equal(install.status,0,install.stderr);
  const base=join(dir,'node_modules',pkg.name);const version=spawnSync(process.execPath,[join(base,'bin/shrinkcage.mjs'),'--version'],{encoding:'utf8'});assert.equal(version.status,0);assert.match(version.stdout,/Shrinkcage 1\.0\.0/);
  const data=join(dir,'app-data');await mkdir(data);await writeFile(join(data,'settings.json'),JSON.stringify(Object.fromEntries(['codex','claude','gemini'].map(a=>[a,{enabled:false,root:null}]))));
  const probe=await fetch('http://127.0.0.1:8790/api/health',{signal:AbortSignal.timeout(400)}).catch(()=>null);if(probe)throw new Error('Stop the owned local server before running the isolated package smoke test on port 8790.');
  child=spawn(process.execPath,[join(base,'dist-server/server/index.js')],{env:{...process.env,SHRINKCAGE_DATA_DIR:data,OPEN_BROWSER:'0'},stdio:'pipe'});let output='';child.stderr.on('data',x=>output+=x);
  let ready=false;for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,150));const r=await fetch('http://127.0.0.1:8790/api/health',{signal:AbortSignal.timeout(500)}).catch(()=>null);if(r?.ok){const health=await r.json();assert.equal(health.app,'shrinkcage');ready=true;break;}}
  assert.ok(ready,output);assert.equal((await fetch('http://127.0.0.1:8790/')).status,200);const w=await(await fetch('http://127.0.0.1:8790/api/workspace')).json();assert.equal(w.totalSessions,0);assert.ok(w.connectors.every(c=>c.integration==='disabled'));
  console.log('PASS: clean package installation, CLI version, compiled server, frontend assets and disabled-source discovery.');
}finally{if(child){const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,5000))]);if(child.exitCode===null)child.kill('SIGKILL');}await rm(dir,{recursive:true,force:true});}
