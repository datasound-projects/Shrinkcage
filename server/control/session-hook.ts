import { executable, runBounded } from './probe.js';
import { runtimeContext, writeReceipt } from './runtime.js';
import { linkNativeSession } from './session-telemetry.js';

export async function handleHook(event:string,input:unknown,env:NodeJS.ProcessEnv=process.env):Promise<unknown|null> {
  await linkNativeSession(input,env).catch(()=>{});
  if(event!=='rtk'||!input||typeof input!=='object')return null;
  const context=await runtimeContext(env);if(!context?.tools.includes('rtk'))return null;
  const binary=await executable('rtk',env);if(!binary||binary.fingerprint!==context.fingerprints.rtk)return null;
  const agent=env.SHRINKCAGE_AGENT;if(agent!=='codex'&&agent!=='claude')return null;
  try{
    const result=await runBounded(binary,['hook',agent],{env,input:JSON.stringify(input),timeout:6000});
    if(result.code!==0)return null;
    const native=JSON.parse(result.stdout),output=native.hookSpecificOutput;
    if(!output||typeof output.updatedInput?.command!=='string')return null;
    // Codex requires allow *for the PreToolUse rewrite*. Its parsed result only
    // carries updated input, not a PermissionRequest approval. Claude can rewrite
    // without allow (where allow would skip its permission prompt).
    const original=(input as {tool_input?:unknown}).tool_input;
    if(!original||typeof original!=='object'||Array.isArray(original))return null;
    const projected={hookSpecificOutput:{hookEventName:'PreToolUse',...(agent==='codex'?{permissionDecision:'allow'}:{}),updatedInput:{...original,command:output.updatedInput.command}}};
    await writeReceipt({tool:'rtk',phase:'usage_observed',name:'native_hook_rewrite',at:new Date().toISOString()},env);
    return projected;
  }catch{return null;}
}

if(process.argv[2]==='--event'&&['observe','rtk'].includes(process.argv[3])&&process.argv.length===4){
  const chunks:Buffer[]=[];let size=0;const timer=setTimeout(()=>process.exit(0),8000);timer.unref();
  process.stdin.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1048576)process.exit(0);chunks.push(chunk);});
  process.stdin.on('error',()=>process.exit(0));
  process.stdin.on('end',()=>{void(async()=>{try{const output=await handleHook(process.argv[3],JSON.parse(Buffer.concat(chunks).toString('utf8')));if(output)process.stdout.write(JSON.stringify(output));}catch{/* no payload/error logging */}finally{clearTimeout(timer);}})();});
}
