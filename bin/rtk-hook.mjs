// Reviewed project hook. Delegates rewriting to RTK; never executes the tool command.
import {spawnSync} from 'node:child_process';
import {appendFileSync,closeSync,constants,existsSync,lstatSync,openSync,readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
const chunks=[];let size=0;
const timer=setTimeout(()=>process.exit(0),8000);timer.unref();
process.stdin.on('data',chunk=>{size+=chunk.length;if(size>1048576)process.exit(0);chunks.push(chunk);});
process.stdin.on('error',()=>process.exit(0));
process.stdin.on('end',()=>{
  try{
    let binary='rtk',prefix=[];
    if(process.platform==='win32')for(const directory of (process.env.PATH||process.env.Path||'').split(';')){
      const native=join(directory,'rtk.exe');if(existsSync(native)&&lstatSync(native).isFile()){binary=native;break;}
      const shim=join(directory,'rtk.cmd'),script=join(directory,'rtk.mjs');if(existsSync(shim)&&existsSync(script)&&!lstatSync(script).isSymbolicLink()&&/\bnode\b/.test(readFileSync(shim,'utf8'))&&readFileSync(shim,'utf8').includes('rtk.mjs')){binary=process.execPath;prefix=[script];break;}
    }
    const result=spawnSync(binary,[...prefix,'hook','codex'],{input:Buffer.concat(chunks).toString('utf8'),encoding:'utf8',shell:false,timeout:6000,maxBuffer:1048576,windowsHide:true});
    if(result.status!==0||!result.stdout)return;
    const output=JSON.parse(result.stdout);process.stdout.write(result.stdout);
    if(!output.hookSpecificOutput?.updatedInput)return;
    const id=process.env.SHRINKCAGE_SESSION_ID,token=process.env.SHRINKCAGE_SESSION_TOKEN,root=process.env.SHRINKCAGE_DATA_DIR;
    if(!id||!/^[a-f0-9-]{36}$/.test(id)||!token||!root)return;
    const dir=resolve(root,'control','runtime',id);if(realpathSync(dir)!==dir||lstatSync(dir).isSymbolicLink())return;
    const ownerPath=join(dir,'owner.json');const ownerFd=openSync(ownerPath,constants.O_RDONLY|(constants.O_NOFOLLOW||0));let owner;
    try{if(lstatSync(ownerPath).size>2048)return;owner=JSON.parse(readFileSync(ownerFd,'utf8'));}finally{closeSync(ownerFd);}
    if(owner.id!==id||owner.tokenHash!==createHash('sha256').update(token).digest('hex'))return;
    const file=join(dir,'events.jsonl');try{const s=lstatSync(file);if(s.isSymbolicLink()||!s.isFile()||s.size>1048576)return;}catch(e){if(e.code!=='ENOENT')return;}
    const fd=openSync(file,constants.O_CREAT|constants.O_APPEND|constants.O_WRONLY|(constants.O_NOFOLLOW||0),0o600);
    try{appendFileSync(fd,JSON.stringify({tool:'rtk',phase:'usage_observed',name:'native_hook_rewrite',at:new Date().toISOString()})+'\n');}finally{closeSync(fd);}
  }catch{/* Fail open exactly as the native RTK hook does; never echo input or errors. */}
  finally{clearTimeout(timer);}
});
