import { join } from 'node:path';
import { parse } from 'smol-toml';
import { readBounded } from './paths.js';
import { digest } from './schema.js';
import { codexHome } from './probe.js';
import type { ConfigFacts } from './types.js';

export async function inspectConfiguration(project:string,env:NodeJS.ProcessEnv=process.env,home?:string):Promise<ConfigFacts>{
  const result:ConfigFacts={digests:{},errors:[],rtkHooks:0,headroomHooks:0,memoryHooks:0,serenaEntries:0,reservedMcp:false,ownedRtk:false,baselineConfounders:[]};
  const mcp=new Map<string,unknown>();
  const roots=[{label:'user',path:codexHome(env,home)},{label:'project',path:join(project,'.codex')}];
  for(const root of roots)for(const file of ['config.toml','hooks.json']){
    const label=root.label+'/'+file;try{
      const bytes=await readBounded(join(root.path,file));result.digests[label]=bytes===null?'absent':digest(bytes);if(bytes===null)continue;
      const data=file.endsWith('.toml')?parse(bytes.toString('utf8')):JSON.parse(bytes.toString('utf8'));
      if(!data||typeof data!=='object'||Array.isArray(data))throw Error();
      if(data.features?.hooks===false)result.hooksDisabled=true;
      const hooks=data.hooks;
      if(hooks&&typeof hooks==='object'){
        for(const [event,groups] of Object.entries(hooks)){
          if(!Array.isArray(groups))continue;
          for(const group of groups){if(!group||typeof group!=='object'||!Array.isArray(group.hooks))continue;
            for(const hook of group.hooks){if(typeof hook?.command!=='string')continue;const command=hook.command;
              if(/\brtk\s+hook\s+codex\b|shrinkcage-rtk\.mjs|rtk-rewrite/i.test(command)){result.rtkHooks++;if(command.includes('shrinkcage-rtk.mjs'))result.ownedRtk=true;}
              if(/\bheadroom\b/i.test(command))result.headroomHooks++;
              if(/codemem/i.test(command))result.memoryHooks++;
              result.baselineConfounders.push('Existing '+root.label+' '+event+' hooks are present.');
            }
          }
        }
      }
      if(data.mcp_servers&&typeof data.mcp_servers==='object')for(const [name,entry] of Object.entries(data.mcp_servers)){
        if(name.startsWith('shrinkcage_'))result.reservedMcp=true;
        mcp.set(name,entry);
        result.baselineConfounders.push('Existing '+root.label+' MCP entries are present.');
      }
      if(root.label==='user'&&(data.model_provider||data.openai_base_url||data.model_providers))result.baselineConfounders.push('Existing user provider configuration may affect routing and baseline results.');
    }catch{result.digests[label]='unsafe';result.errors.push('Cannot safely parse '+label+'. Inspect malformed, oversized or symlinked configuration before activation.');}
  }
  // Codex layers same-name project MCP entries over user entries; count the effective alias once.
  for(const [name,value] of mcp){
    if(!value||typeof value!=='object'||(value as {enabled?:boolean}).enabled===false)continue;
    const command=typeof (value as {command?:unknown}).command==='string'?(value as {command:string}).command:'';
    if(/serena/i.test(name)||/serena/i.test(command))result.serenaEntries++;
    if(/headroom/i.test(name)||/headroom/i.test(command))result.headroomEntries=(result.headroomEntries??0)+1;
    if(name==='serena')result.replaceSerenaEntry=true;
    if(name==='headroom')result.replaceHeadroomEntry=true;
  }
  const shim=await readBounded(join(project,'.codex','shrinkcage-rtk.mjs')).catch(()=>null);result.digests['project/shrinkcage-rtk.mjs']=shim?digest(shim):'absent';
  result.baselineConfounders=[...new Set(result.baselineConfounders)].sort();return result;
}
