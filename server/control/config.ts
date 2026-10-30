import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { parse } from 'smol-toml';
import { readBounded } from './paths.js';
import { digest } from './schema.js';
import { codexHome, headroomPort } from './probe.js';
import type { ConfigFacts } from './types.js';

function headroomRoute(value:unknown,env:NodeJS.ProcessEnv):boolean {if(typeof value!=='string')return false;try{const u=new URL(value);return ['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&Number(u.port)===headroomPort(env);}catch{return false;}}

export async function inspectConfiguration(project:string,env:NodeJS.ProcessEnv=process.env,home?:string):Promise<ConfigFacts>{
  const result:ConfigFacts={digests:{},errors:[],rtkHooks:0,headroomHooks:0,memoryHooks:0,serenaEntries:0,reservedMcp:false,ownedRtk:false,baselineConfounders:[]};
  const mcp=new Map<string,unknown>();
  const ancestors:string[]=[];let ancestor=dirname(resolve(project));while(ancestor!==dirname(ancestor)&&ancestors.length<32){ancestors.unshift(ancestor);ancestor=dirname(ancestor);}
  const roots=[{label:'user',path:codexHome(env,home)},...ancestors.filter(path=>resolve(join(path,'.codex'))!==resolve(codexHome(env,home))).map((path,i)=>({label:'ancestor-'+i,path:join(path,'.codex')})),{label:'project',path:join(project,'.codex')}];
  for(const root of roots)for(const file of ['config.toml','hooks.json']){
    const label=root.label+'/'+file;try{
      const bytes=await readBounded(join(root.path,file));result.digests[label]=bytes===null?'absent':digest(bytes);if(bytes===null)continue;
      const data=file.endsWith('.toml')?parse(bytes.toString('utf8')):JSON.parse(bytes.toString('utf8'));
      if(!data||typeof data!=='object'||Array.isArray(data))throw Error();
      if(data.features?.hooks===false)result.hooksDisabled=true;
      const activeProfile=typeof data.profile==='string'?data.profiles?.[data.profile]:null;
      if(activeProfile?.features?.hooks===false)result.hooksDisabled=true;
      const provider=activeProfile?.model_provider??data.model_provider;
      if(typeof provider==='string'&&(/headroom/i.test(provider)||headroomRoute(data.model_providers?.[provider]?.base_url,env)))result.externalHeadroomRouting=true;
      if(headroomRoute(data.openai_base_url,env)||headroomRoute(env.OPENAI_BASE_URL,env))result.externalHeadroomRouting=true;
      const hooks=data.hooks;
      if(hooks&&typeof hooks==='object'){
        for(const [event,groups] of Object.entries(hooks)){
          if(!Array.isArray(groups))continue;
          for(const group of groups){if(!group||typeof group!=='object'||!Array.isArray(group.hooks))continue;
            for(const hook of group.hooks){if(typeof hook?.command!=='string')continue;const command=hook.command;
              if(/\brtk(?:\.exe)?["']?\s+hook\s+codex\b|shrinkcage-rtk\.mjs|rtk-rewrite/i.test(command)){result.rtkHooks++;if(command.includes('shrinkcage-rtk.mjs'))result.ownedRtk=true;}
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
  result.externalHeadroomRouting ||= headroomRoute(env.OPENAI_BASE_URL,env);
  const shim=await readBounded(join(project,'.codex','shrinkcage-rtk.mjs')).catch(()=>null);result.digests['project/shrinkcage-rtk.mjs']=shim?digest(shim):'absent';
  result.baselineConfounders=[...new Set(result.baselineConfounders)].sort();return result;
}

/** Only settings files are inspected, never Claude's OAuth/credential files. */
export async function inspectClaudeConfiguration(project:string,env:NodeJS.ProcessEnv=process.env,home=homedir()):Promise<ConfigFacts>{
  const result:ConfigFacts={digests:{},errors:[],rtkHooks:0,headroomHooks:0,memoryHooks:0,serenaEntries:0,reservedMcp:false,ownedRtk:false,baselineConfounders:[]};
  const files=[['user',join(env.CLAUDE_CONFIG_DIR||join(home,'.claude'),'settings.json')],['project',join(project,'.claude','settings.json')],['local',join(project,'.claude','settings.local.json')],['mcp',join(project,'.mcp.json')]];
  for(const [label,path] of files)try{
    const bytes=await readBounded(path);result.digests[label]=bytes?digest(bytes):'absent';if(!bytes)continue;
    const data=JSON.parse(bytes.toString());if(!data||typeof data!=='object'||Array.isArray(data))throw Error();
    if(data.disableAllHooks===true||data.allowManagedHooksOnly===true)result.hooksDisabled=true;
    if(data.hooks&&typeof data.hooks==='object')for(const groups of Object.values(data.hooks)){
      if(!Array.isArray(groups))continue;
      for(const group of groups)if(Array.isArray(group?.hooks))for(const hook of group.hooks){
        if(typeof hook?.command!=='string')continue;
        if(/\brtk(?:\.exe)?["']?\s+hook\s+claude\b|rtk-rewrite|shrinkcage-rtk/i.test(hook.command))result.rtkHooks++;
        if(/headroom/i.test(hook.command))result.headroomHooks++;
        if(/codemem|context-mode|lean-ctx/i.test(hook.command))result.memoryHooks++;
        result.baselineConfounders.push('External '+label+' Claude hooks remain inherited; individual external hooks cannot be disabled by a session overlay.');
      }
    }
    if(data.env&&Object.keys(data.env).some(k=>/BASE_URL|PROVIDER|BEDROCK|VERTEX/.test(k)))result.baselineConfounders.push('External Claude routing settings may affect billing and baseline results.');
    if(headroomRoute(data.env?.ANTHROPIC_BASE_URL,env)||headroomRoute(env.ANTHROPIC_BASE_URL,env))result.externalHeadroomRouting=true;
  }catch{result.digests[label]='unsafe';result.errors.push('Cannot safely inspect Claude '+label+' settings.');}
  result.externalHeadroomRouting ||= headroomRoute(env.ANTHROPIC_BASE_URL,env);
  result.baselineConfounders.push('Claude managed policy and enabled plugin hooks may add inherited behavior. Their secrets and private config are not copied or changed.');
  return result;
}
