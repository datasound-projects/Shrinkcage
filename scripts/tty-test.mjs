// Run with a real terminal/PTY; no account or model requests are used.
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {fakeWorkspace,cli,ENTRY,TSX} from '../tests/control-fixtures.ts';
assert.ok(process.stdin.isTTY&&process.stdout.isTTY,'Run this check in a real terminal or allocated PTY.');
const f=await fakeWorkspace();try{
  const p=await cli(['plan','codex','--profile','baseline','--project',f.project,'--json'],f.env,f.project);assert.equal(p.code,0,p.stderr);const plan=JSON.parse(p.stdout),capture=join(f.root,'tty-capture.json');
  const child=spawn(process.execPath,['--import',TSX,ENTRY,'run','codex','--profile','baseline','--project',f.project,'--approve',plan.fingerprint],{cwd:f.project,env:{...f.env,FIXTURE_CAPTURE:capture},stdio:'inherit',shell:false});const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});assert.equal(code,0);assert.equal(JSON.parse(await readFile(capture,'utf8')).tty,true);console.log('PASS: the actual managed CLI preserves terminal stdin/stdout/stderr and TTY identity.');
}finally{await f.close();}
