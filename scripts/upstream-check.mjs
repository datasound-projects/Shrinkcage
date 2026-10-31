// Manual CI only: fixed official CLIs, version/help probes. No login, task or model request.
import {mkdir,writeFile,mkdtemp,realpath,readFile,lstat,rm} from 'node:fs/promises';
import {join,dirname,delimiter,isAbsolute} from 'node:path';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {pluginEnvironment} from '../server/control/sdk/binding.ts';
import {detectAgent} from '../server/control/probe.ts';
const root=await realpath(await mkdtemp(join(tmpdir(),'shrinkcage-upstream-')));let agents;let nativeSource=null;
try{const env=await pluginEnvironment(join(root,'home'),process.env);env.CODEX_HOME=join(root,'home','.codex');env.CLAUDE_CONFIG_DIR=join(root,'home','.claude');await mkdir(env.CODEX_HOME,{recursive:true});await mkdir(env.CLAUDE_CONFIG_DIR,{recursive:true});
  // --ignore-scripts leaves modern Claude's launcher as a placeholder. Probe the
  // official installed native dependency directly; never execute its installer.
  const npmRoot=process.env.SHRINKCAGE_UPSTREAM_NPM_ROOT;
  if(npmRoot){if(!isAbsolute(npmRoot))throw Error('Use an absolute upstream npm root.');const wrapper=JSON.parse(await readFile(join(npmRoot,'@anthropic-ai','claude-code','package.json'),'utf8')),name='@anthropic-ai/claude-code-'+process.platform+'-'+process.arch;
    if(wrapper.optionalDependencies?.[name]){const metadata=createRequire(join(npmRoot,'@anthropic-ai','claude-code','package.json')).resolve(name+'/package.json'),dir=dirname(metadata),meta=JSON.parse(await readFile(metadata,'utf8')),file=join(dir,process.platform==='win32'?'claude.exe':'claude'),info=await lstat(file);if(wrapper.name!=='@anthropic-ai/claude-code'||meta.name!==name||meta.version!==wrapper.version||wrapper.optionalDependencies[name]!==meta.version||!info.isFile()||info.isSymbolicLink())throw Error('Official native package identity did not match.');env.PATH=dir+delimiter+(env.PATH??env.Path??'');delete env.Path;nativeSource=name+'@'+meta.version;}
  }
  agents=await Promise.all(['codex','claude'].map(id=>detectAgent(env,id)));
}finally{await rm(root,{recursive:true,force:true});}
const report={checkedAt:new Date().toISOString(),platform:process.platform,node:process.version,agents,nativeSource,scope:'Private HOME; native version/help interfaces only. Official native dependency used directly when required; no install scripts, authentication, model-backed task, optimizer efficacy or automatic adapter promotion.'};
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/upstream-interfaces.json',JSON.stringify(report,null,2));
for(const a of agents)console.log(`${a.id}: ${a.version??'unavailable'} · ${a.compatible?'PASS':'FAIL'}`);
if(agents.some(a=>!a.compatible))process.exitCode=1;
