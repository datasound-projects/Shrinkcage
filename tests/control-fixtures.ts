import { chmod,mkdir,mkdtemp,realpath,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const COMMON=`import {spawn,spawnSync} from 'node:child_process';import {readFileSync,writeFileSync} from 'node:fs';import {dirname,join} from 'node:path';import {fileURLToPath} from 'node:url';import {createInterface} from 'node:readline';const args=process.argv.slice(2);const root=dirname(fileURLToPath(import.meta.url));`;
const MCP=`const rl=createInterface({input:process.stdin});rl.on('line',line=>{try{const m=JSON.parse(line);if(m.id===undefined)return;const result=m.method==='initialize'?{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}:m.method==='tools/list'?{tools:[{name:'find_symbol',inputSchema:{type:'object'}}]}:{content:[{type:'text',text:'PRIVATE_RESULT_DO_NOT_STORE'}]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');}catch{}});rl.on('close',()=>process.exit(0));`;
const CODEX=COMMON+`
if(args.includes('--version')){console.log('codex-cli '+(process.env.FIXTURE_CODEX_VERSION||'0.165.0'));process.exit(0);}
if(args.includes('--help')){console.log('--config --no-daemon --model --sandbox --no-alt-screen');process.exit(0);}
if(process.env.FIXTURE_CAPTURE)writeFileSync(process.env.FIXTURE_CAPTURE,JSON.stringify({args,cwd:process.cwd(),tty:!!process.stdin.isTTY}));
const children=[];let stopped=false;
const stop=s=>{if(stopped)return;stopped=true;for(const c of children)c.kill(s);process.exit(s==='SIGINT'?130:143);};process.on('SIGTERM',()=>stop('SIGTERM'));process.on('SIGINT',()=>stop('SIGINT'));
if(process.env.FIXTURE_STARTED)writeFileSync(process.env.FIXTURE_STARTED,String(process.pid));
const overrides={};for(let i=0;i<args.length;i++)if(args[i]==='--config'){const text=args[++i],at=text.indexOf('=');try{overrides[text.slice(0,at)]=JSON.parse(text.slice(at+1));}catch{}}
for(const name of ['shrinkcage_serena','shrinkcage_headroom']){
 const command=overrides['mcp_servers.'+name+'.command'];if(!command)continue;
 const child=spawn(command,overrides['mcp_servers.'+name+'.args'],{cwd:overrides['mcp_servers.'+name+'.cwd'],env:process.env,stdio:['pipe','pipe','pipe'],shell:false});children.push(child);
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('fixture MCP timeout')),12000);const rl=createInterface({input:child.stdout});rl.on('line',line=>{try{const m=JSON.parse(line);if(m.id===1){child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\\n');child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})+'\\n');}else if(m.id===2)child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'find_symbol',arguments:{content:'PRIVATE_PROMPT_DO_NOT_STORE'}}})+'\\n');else if(m.id===3){clearTimeout(timer);child.stdin.end();resolve();}}catch{}});child.once('error',reject);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'fixture',version:'1'}}})+'\\n');});
}
if(process.env.FIXTURE_USE_HOOK){const hook=JSON.parse(readFileSync(join(process.cwd(),'.codex/hooks.json'),'utf8')).hooks.PreToolUse.find(g=>g.hooks.some(h=>h.statusMessage==='Shrinkcage RTK'));if(hook){const command=hook.hooks[0].command;const path=join(process.cwd(),'.codex/shrinkcage-rtk.mjs');spawnSync(process.execPath,[path],{input:JSON.stringify({permission_mode:'default',hook_event_name:'PreToolUse',tool_name:'Bash',tool_input:{command:'git status'}}),env:process.env,encoding:'utf8',shell:false});}}
if(args.includes('--echo-stdin')){for await(const chunk of process.stdin)process.stdout.write(chunk);}
if(args.includes('--wait')){setInterval(()=>{},1000);await new Promise(()=>{});}
console.log('FIXTURE_TERMINAL_OUTPUT');for(const c of children)if(c.exitCode===null)await new Promise(r=>{c.once('close',r);setTimeout(()=>{c.kill('SIGTERM');r();},3000).unref();});
const exit=args.indexOf('--exit');process.exitCode=exit<0?0:Number(args[exit+1]);
`;
const RTK=COMMON+`
if(args.includes('--version')){console.log(process.env.FIXTURE_RTK_BAD_VERSION?'rtk 0.1.0':'rtk 1.1.0');process.exit(0);}
if(args.includes('--help')){console.log('codex hook --dry-run');process.exit(0);}
if(args[0]==='hook'){let text='';for await(const c of process.stdin)text+=c;try{const input=JSON.parse(text);console.log(JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',updatedInput:{command:'rtk git status'},permissionDecision:'allow'}}));}catch{console.log('{}');}process.exit(0);}
console.log(JSON.stringify({summary:{total_commands:2,total_input:100,total_output:20,total_saved:80,avg_savings_pct:80},commands:[],daily:[]}));
`;
const SERENA=COMMON+`
if(args.includes('--version')){console.log('Serena 2.1.0');process.exit(0);}
if(args.includes('--help')){console.log('--project-from-cwd --context --transport --enable-web-dashboard --open-web-dashboard --enable-gui-log-window');process.exit(0);}
if(process.env.FIXTURE_SERENA_CRASH)process.exit(8);
${MCP}`;
const HEADROOM=COMMON+`
if(args.includes('--version')){console.log('headroom, version 0.42.0');process.exit(0);}
if(args.includes('--help')){console.log('--no-proxy --no-mcp --code-memory --port --proxy-url --transport');process.exit(0);}
if(args[0]==='mcp'){${MCP}}else{
if(process.env.FIXTURE_WRAPPER_FAIL)process.exit(9);
if(!args.includes('--no-proxy')||!args.includes('--no-mcp')||!args.includes('--code-memory'))process.exit(10);
const pass=args.slice(args.indexOf('--')+1);const c=spawn(process.execPath,[join(root,'codex.mjs'),...pass],{stdio:'inherit',env:process.env,shell:false});
process.on('SIGTERM',()=>c.kill('SIGTERM'));process.on('SIGINT',()=>c.kill('SIGINT'));c.on('close',(code,signal)=>{process.exitCode=signal?1:code??1;});}
`;
export async function fakeWorkspace(){
  const temporary=await mkdtemp(join(tmpdir(),'shrinkcage-control-'));const root=await realpath(temporary);const bin=join(root,'bin'),project=join(root,'project'),home=join(root,'home'),data=join(root,'data');await Promise.all([bin,project,home,join(home,'.codex')].map(p=>mkdir(p,{recursive:true})));
  for(const [name,code] of Object.entries({codex:CODEX,rtk:RTK,serena:SERENA,headroom:HEADROOM})){
    await writeFile(join(bin,name+'.mjs'),code);
    if(process.platform==='win32')await writeFile(join(bin,name+'.cmd'),'@echo off\r\nnode "%~dp0'+name+'.mjs" %*\r\n');
    else{await writeFile(join(bin,name),'#!/usr/bin/env node\n'+code);await chmod(join(bin,name),0o700);}
  }
  const health=createServer((req,res)=>{if(req.url==='/health'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({service:'headroom-proxy',status:'healthy'}));}else{res.writeHead(404);res.end();}});await new Promise<void>(r=>health.listen(0,'127.0.0.1',r));const address=health.address();if(!address||typeof address==='string')throw Error('Fixture listener failed');
  const env={...process.env,PATH:bin+(process.platform==='win32'?';':':')+dirname(process.execPath),HOME:home,USERPROFILE:home,CODEX_HOME:join(home,'.codex'),SHRINKCAGE_DATA_DIR:data,SHRINKCAGE_HEADROOM_PORT:String(address.port),HEADROOM_BEACON:'off',DO_NOT_TRACK:'1',OPEN_BROWSER:'0',APPDATA:join(home,'Roaming'),LOCALAPPDATA:join(home,'Local'),XDG_CONFIG_HOME:join(home,'.config')};
  return {root,bin,project,home,data,env,close:async()=>{await new Promise<void>(r=>health.close(()=>r()));await rm(root,{recursive:true,force:true});}};
}
const ENTRY=fileURLToPath(new URL('../server/control/entry.ts',import.meta.url));
const TSX=import.meta.resolve('tsx');
export function cli(args:string[],env:NodeJS.ProcessEnv,cwd:string,input?:string):Promise<{code:number|null;stdout:string;stderr:string}>{
  const child=spawn(process.execPath,['--import',TSX,ENTRY,...args],{cwd,env,stdio:['pipe','pipe','pipe'],shell:false});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.stdin.end(input);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Fixture CLI timed out'));},25000);child.once('error',reject);child.once('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});});
}
export {ENTRY,TSX};
