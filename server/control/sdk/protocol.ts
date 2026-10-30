import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VERSION } from '../../version.js';
import { ControlError } from '../schema.js';
import { pluginArguments, pluginVersionCompatible } from './manifest.js';
import { pluginEnvironment, verifyBinding } from './binding.js';
import type { PluginBinding, PluginManifest } from './types.js';

export interface ProtocolProof {version:string;protocolVersion:string;toolNames:string[];checkedAt:string;method:'isolated-local-protocol';limitations:string[]}
export async function probeMcpPlugin(manifest:PluginManifest,binding:PluginBinding,configuration:unknown={},env:NodeJS.ProcessEnv=process.env):Promise<ProtocolProof>{
  if(manifest.template!=='mcp-stdio')throw new ControlError('Integration required: no reviewed executable template exists for this interface.');
  if(!await verifyBinding(binding))throw new ControlError('Executable or entry script changed. Review a fresh registration preview before running it.');
  const temporary=await mkdtemp(join(tmpdir(),'shrinkcage-plugin-')),root=await realpath(temporary),workspace=join(root,'workspace');let child:ChildProcess|undefined;
  await mkdir(workspace);let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    const safeEnv=await pluginEnvironment(join(root,'home'),env),args=[...binding.prefix,...pluginArguments(manifest,configuration)];
    return await new Promise<ProtocolProof>((resolve,reject)=>{
      let settled=false,buffer='',bytes=0,version='',protocolVersion='',stage=0;
      const fail=(message:string)=>{if(settled)return;settled=true;reject(new ControlError(message));};
      child=spawn(binding.command,args,{cwd:workspace,env:safeEnv,shell:false,stdio:['pipe','pipe','pipe'],windowsHide:true});
      timer=setTimeout(()=>fail('MCP validation timed out. The tool must stay in the foreground and answer initialize/tools/list on stdio.'),10000);
      child.on('error',()=>fail('The approved executable could not start.'));child.on('close',()=>{if(!settled)fail('The tool exited before completing its MCP handshake.');});
      child.stderr?.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>524288)fail('MCP validation output exceeded its bounded limit. Raw output was discarded.');});
      child.stdin?.on('error',()=>{});
      child.stdout?.on('data',(chunk:Buffer)=>{
        bytes+=chunk.length;if(bytes>524288){fail('MCP validation output exceeded its bounded limit.');return;}buffer+=chunk.toString('utf8');
        let end:number;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;
          let m:Record<string,any>;try{m=JSON.parse(line);}catch{fail('MCP stdout must contain JSON-RPC messages only. Send diagnostic text to stderr.');return;}
          if(!m||typeof m!=='object'||Array.isArray(m)||m.jsonrpc!=='2.0'){fail('The tool did not use the supported JSON-RPC protocol.');return;}
          if(m.id===1&&stage===0){
            if(m.error||!m.result?.serverInfo||typeof m.result.serverInfo.version!=='string'){fail('MCP initialize did not report a valid server identity/version.');return;}
            version=m.result.serverInfo.version;protocolVersion=m.result.protocolVersion;
            if(!pluginVersionCompatible(version,manifest.toolVersion.min,manifest.toolVersion.maxMajor)){fail('The reported MCP tool version is outside the approved compatibility boundary.');return;}
            if(!['2024-11-05','2025-03-26','2025-06-18'].includes(protocolVersion)){fail('This MCP protocol version needs adapter review.');return;}
            stage=1;child!.stdin!.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');child!.stdin!.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})+'\n');
          }else if(m.id===2&&stage===1){
            if(m.error||!Array.isArray(m.result?.tools)||!m.result.tools.length||m.result.tools.some((t:unknown)=>!t||typeof t!=='object'||typeof (t as {name?:unknown}).name!=='string'||!/^[a-zA-Z0-9_.:-]{1,96}$/.test((t as {name:string}).name)||/^sk-|^AIza|^gh[pousr]_|^github_pat_/i.test((t as {name:string}).name))){fail('MCP tools/list did not provide a valid nonempty tool list.');return;}
            settled=true;resolve({version,protocolVersion,toolNames:m.result.tools.map((t:{name:string})=>t.name).slice(0,100),checkedAt:new Date().toISOString(),method:'isolated-local-protocol',limitations:['Private HOME and temporary working directory; no provider credentials or owner token inherited.','This is a protocol test, not an OS sandbox, code audit or proof of token savings.','The test lists tools without calling project-reading or mutating tools.']});
          }
        }
      });
      child.stdin?.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'shrinkcage-validation',version:VERSION}}})+'\n');
    });
  }finally{
    if(timer)clearTimeout(timer);
    if(child&&child.exitCode===null&&child.signalCode===null){child.stdin?.end();const closed=new Promise<void>(r=>child!.once('close',()=>r()));const terminate=setTimeout(()=>child?.kill('SIGTERM'),150),kill=setTimeout(()=>child?.kill('SIGKILL'),900);await closed;clearTimeout(terminate);clearTimeout(kill);}
    await rm(root,{recursive:true,force:true});
  }
}
