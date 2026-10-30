// Manual CI only: fixed official CLIs, version/help probes. No login, task or model request.
import {mkdir,writeFile} from 'node:fs/promises';
import {detectAgent} from '../server/control/probe.ts';
const agents=await Promise.all(['codex','claude'].map(id=>detectAgent(process.env,id)));
const report={checkedAt:new Date().toISOString(),platform:process.platform,node:process.version,agents,scope:'Native version/help interfaces only; no authentication, model-backed task, optimizer efficacy or automatic adapter promotion.'};
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/upstream-interfaces.json',JSON.stringify(report,null,2));
for(const a of agents)console.log(`${a.id}: ${a.version??'unavailable'} · ${a.compatible?'PASS':'FAIL'}`);
if(agents.some(a=>!a.compatible))process.exitCode=1;
