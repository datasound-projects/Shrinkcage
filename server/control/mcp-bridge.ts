import { spawn } from 'node:child_process';
import { executable,headroomPort } from './probe.js';
import { OwnedResources } from './ownership.js';
import { runtimeAlive,runtimeContext,writeReceipt,type ReceiptEvent } from './runtime.js';

export async function bridge(tool:'serena'|'headroom'){
  const context=await runtimeContext();if(!context||!context.tools.includes(tool)||!await runtimeAlive(context.path))throw Error('Managed MCP ownership is unavailable.');
  const binary=await executable(tool);if(!binary||context.fingerprints[tool]&&context.fingerprints[tool]!==binary.fingerprint)throw Error('Managed MCP executable is missing or changed.');
  const args=tool==='serena'?['start-mcp-server','--project-from-cwd','--context=codex','--transport','stdio','--enable-web-dashboard','false','--open-web-dashboard','false','--enable-gui-log-window','false']:['mcp','serve','--proxy-url',`http://127.0.0.1:${headroomPort()}`,'--transport','stdio'];
  const child=spawn(binary.command,[...binary.prefix,...args],{shell:false,stdio:['pipe','pipe','ignore'],env:{...process.env,HEADROOM_BEACON:'off',HEADROOM_OFFLINE:'1',DO_NOT_TRACK:'1'},windowsHide:true});
  const pool=new OwnedResources(),owner=pool.attach('mcp',context.id,child);let ended=false,stopping=false;let force:ReturnType<typeof setTimeout>|undefined;
  const stop=()=>{if(stopping||ended)return;stopping=true;child.stdin.end();setTimeout(()=>{if(!ended)pool.release('mcp',context.id,owner);},200).unref();force=setTimeout(()=>{if(!ended&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');},2500);force.unref();};
  const pending=new Map<string,{method:string;name:string}>();let initialized=false,initializeSucceeded=false;const availableNames=new Set<string>();
  const writes=new Set<Promise<void>>();let tail=Promise.resolve(),dropped=false;const record=(event:ReceiptEvent)=>{if(writes.size>=64){dropped=true;return;}let p:Promise<void>;p=tail.then(()=>writeReceipt(event)).finally(()=>writes.delete(p));tail=p.catch(()=>{});writes.add(p);};
  const capture=(outbound:boolean)=>{let buffer='',dropping=false;return (chunk:Buffer)=>{
    const text=chunk.toString('utf8');buffer+=text;if(buffer.length>1048576){buffer='';dropping=true;}
    let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(dropping){dropping=false;continue;}try{
      const message=JSON.parse(line);if(!outbound&&message.method==='notifications/initialized'&&initializeSucceeded){initialized=true;record({tool,phase:'agent_connected',name:'initialize',at:new Date().toISOString()});}
      else if(!outbound&&message.id!==undefined&&typeof message.method==='string'){
        if(pending.size>=200)pending.delete(pending.keys().next().value!);
        pending.set(String(message.id),{method:message.method,name:typeof message.params?.name==='string'&&/^[\w.:-]{1,96}$/.test(message.params.name)?message.params.name:'tool'});
      }else if(outbound&&message.id!==undefined){const request=pending.get(String(message.id));pending.delete(String(message.id));if(!request)continue;
        if(request.method==='initialize'&&typeof message.result?.protocolVersion==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(message.result.protocolVersion)&&message.result.capabilities&&message.result.serverInfo&&!message.error)initializeSucceeded=true;
        if(request.method==='tools/list'&&Array.isArray(message.result?.tools))for(const t of message.result.tools.slice(0,500))if(typeof t.name==='string'&&/^[\w.:-]{1,96}$/.test(t.name)&&!/^PRIVATE_|^sk-/i.test(t.name))availableNames.add(t.name);
        if(request.method==='tools/call'&&initialized)record({tool,phase:message.error||message.result?.isError||!Array.isArray(message.result?.content)?'failed':'usage_observed',name:availableNames.has(request.name)?request.name:'unknown_tool',at:new Date().toISOString()});
      }
    }catch{/* raw frames are forwarded; only bounded valid metadata is inspected */}}
  };};
  process.stdin.on('data',capture(false));child.stdout.on('data',capture(true));process.stdin.pipe(child.stdin);child.stdout.pipe(process.stdout);
  child.stdin.on('error',()=>{});process.stdout.on('error',stop);process.stdin.on('end',stop);process.once('SIGTERM',stop);process.once('SIGINT',stop);
  const heartbeat=setInterval(()=>{void runtimeAlive(context.path).then(alive=>{if(!alive)stop();});},4000);heartbeat.unref();
  await new Promise<void>(resolve=>{child.once('error',()=>{ended=true;process.exitCode=1;resolve();});child.once('close',(code,signal)=>{ended=true;process.exitCode=stopping?0:signal?1:code??1;resolve();});});
  await Promise.allSettled([...writes]);
  if(!stopping||dropped)await writeReceipt({tool,phase:'failed',name:dropped?'bounded_receipt_capacity':'mcp_process_exit',at:new Date().toISOString()});
  clearInterval(heartbeat);if(force)clearTimeout(force);process.stdin.unpipe(child.stdin);process.stdin.pause();
}
if(process.argv[2]==='--tool'&&['serena','headroom'].includes(process.argv[3])&&process.argv.length===4)void bridge(process.argv[3] as 'serena'|'headroom').catch(()=>{console.error('Managed MCP relay could not initialize. Check diagnostics; no payload was logged.');process.exitCode=1;});
