import {spawn} from 'node:child_process';
import {readFile,writeFile,access,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,join,delimiter} from 'node:path';
import {createConnection} from 'node:net';
export const root=fileURLToPath(new URL('../',import.meta.url));
export const version=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
export function checkRuntime(runtime=process.versions.node){const [major,minor]=runtime.split('.').map(Number);if(major<22||major===22&&minor<13)throw new Error('Shrinkcage requires Node.js 22.13 or newer. Install Node and npm, then try again.');}
const exists=async p=>{try{await access(p);return true;}catch{return false;}};
async function npmCli(){
  const candidates=[process.env.npm_execpath,join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),join(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')].filter(Boolean);
  for(const directory of (process.env.PATH||'').split(delimiter))for(const name of ['npm','npm.cmd'])try{const p=await realpath(join(directory,name));candidates.push(p.endsWith('npm-cli.js')?p:join(dirname(p),'node_modules/npm/bin/npm-cli.js'));}catch{}
  for(const p of candidates)if(p.endsWith('npm-cli.js')&&await exists(p))return p;
  throw new Error('npm was not found. Install the npm bundled with Node.js, or launch using npm run launch.');
}
function command(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:root,stdio:'inherit',shell:false});child.on('error',()=>reject(new Error('A required project command could not start.')));child.on('exit',code=>code===0?resolve():reject(new Error('Dependency installation or build failed. Check the output above.')));});}
async function existing(){try{const r=await fetch('http://127.0.0.1:8790/api/health',{signal:AbortSignal.timeout(900)});return await r.json();}catch{return null;}}
async function occupied(){return new Promise(resolve=>{const s=createConnection({host:'127.0.0.1',port:8790});const finish=v=>{s.destroy();resolve(v);};s.setTimeout(700,()=>finish(false));s.once('connect',()=>finish(true));s.once('error',()=>finish(false));});}
function openBrowser(){if(process.env.OPEN_BROWSER==='0'||process.argv.includes('--no-open'))return;const command=process.platform==='darwin'?['/usr/bin/open',['http://localhost:8790']]:process.platform==='win32'?['rundll32.exe',['url.dll,FileProtocolHandler','http://localhost:8790']]:['xdg-open',['http://localhost:8790']];const child=spawn(command[0],command[1],{stdio:'ignore',detached:true,shell:false});child.on('error',()=>console.log('Open http://localhost:8790 in your browser.'));child.unref();}
export async function launch({source=false}={}){
  checkRuntime();
  if(process.argv.includes('--version')){console.log(`Shrinkcage ${version}`);return;}
  if(process.argv.includes('--help')){console.log('Shrinkcage — local token and cost optimization for AI coding sessions\n\nshrinkcage [--no-open]\n\nOpen http://localhost:8790. Ctrl+C stops the owned server.\nNode.js 22.13+ required. No agent installation or account is required.');return;}
  if(process.argv.slice(2).some(a=>a!=='--no-open'))throw new Error('Unknown option. Use --help for supported options.');
  const running=await existing();if(running?.app==='shrinkcage'){console.log(`Shrinkcage is already running at http://localhost:8790 (version ${running.version}).`);openBrowser();return;}
  if(await occupied())throw new Error('Port 8790 is occupied by another application or an older Codex Monitor. Stop that application before starting Shrinkcage. No process was killed.');
  if(source){
    const cli=await npmCli();const lock=await readFile(join(root,'package-lock.json'));const hash=createHash('sha256').update(lock).digest('hex');let installed='';try{installed=await readFile(join(root,'node_modules/.shrinkcage-lock'),'utf8');}catch{}
    if(hash!==installed||!(await exists(join(root,'node_modules/typescript/bin/tsc')))){console.log('Installing locked project dependencies…');await command([cli,'ci','--include=dev','--no-fund','--no-audit']);await writeFile(join(root,'node_modules/.shrinkcage-lock'),hash);}
    console.log('Building Shrinkcage…');await command([cli,'run','build']);
  }
  const entry=join(root,'dist-server/server/index.js');if(!(await exists(entry)))throw new Error('The compiled server is missing. Run npm run build, or install a complete release package.');
  const child=spawn(process.execPath,[entry],{cwd:root,stdio:'inherit',shell:false});let ended=false,stopping=false;
  child.once('error',()=>{ended=true;console.error('Could not start the local server.');process.exitCode=1;});
  const stop=()=>{if(stopping)return;stopping=true;child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),5000);timer.unref();};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  const exited=new Promise(resolve=>{child.once('error',()=>resolve());child.once('exit',code=>{ended=true;process.exitCode=stopping?0:code??1;resolve();});});
  for(let i=0;i<50&&!ended;i++){const health=await existing();if(health?.app==='shrinkcage'){openBrowser();console.log('Monitoring and profile planning. Managed agents launch only from their terminal. Press Ctrl+C to stop.');await exited;process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);return;}await new Promise(r=>setTimeout(r,150));}
  stop();await exited;throw new Error('The server did not become ready. Check the error above.');
}
