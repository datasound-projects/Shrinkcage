// Synthetic responses exist only in this automated browser test, never in production collectors.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {normalizeHeadroom,normalizeRtk,normalizeSerena} from '../dist-server/server/adapters.js';
const base=process.env.SHRINKCAGE_TEST_URL||'http://localhost:8790';
let child,temp,browser;
const now=new Date().toISOString(),earlier=new Date(Date.now()-3600000).toISOString();
const sampleSession=(agent,i,provider,model)=>({id:String(i).repeat(24),shortId:`sample0${i}`,agent,provider,model,project:{id:`project-${i}`,label:['Atlas','Studio','Orchard'][i-1]},startedAt:earlier,updatedAt:now,lastActivityAt:now,status:'recorded',archived:false,tokens:{input:10000*i,output:1500*i,cached:4000*i,cacheWrite:null,reasoning:null,total:11500*i},coverage:'complete-file',usageBasis:'Recorded fixture usage',observedToolCalls:3,version:'example',tools:[{name:'read_file',count:2,lastUsedAt:now},{name:'find_symbol',count:1,lastUsedAt:earlier}],activity:[],tokenHistory:[],notes:['Synthetic metadata for automated UI verification. No prompts or tool contents are included.']});
const sessions=[sampleSession('codex',1,'openai','model-alpha'),sampleSession('claude',2,null,'model-beta'),sampleSession('gemini',3,'google','model-gamma')];
const ws={updatedAt:now,version:'1.0.0',platform:'test',csrfToken:'0'.repeat(48),totalSessions:3,scanLimited:false,settingsError:null,projects:sessions.map(s=>s.project),providers:['openai','google'],models:sessions.map(s=>s.model),connectors:['codex','claude','gemini'].map((id,i)=>({id,name:['Codex CLI','Claude Code','Gemini CLI'][i],enabled:true,installed:i!==2,process:'not-observed',integration:'local-history',rootLabels:[`~/.${id}/sessions`],customRoot:null,accessibleRoots:1,sessions:1,filesDiscovered:1,filesParsed:1,errors:[],lastSuccess:now,capabilities:['Session metadata','Reported usage','Tool names'],limits:['History is not a live connection.'],sampledSessions:0}))};
const headroom=normalizeHeadroom({tokens:{input:840000,output:26000,saved:120000,savings_percent:12.5,input_provider_reported:840000,input_estimated:0},requests:{total:84,failed:0,cached:63},cache:{total_hits:11,entries:4},telemetry:{enabled:true},summary:{cost:{total_saved_usd:1.24,breakdown:{compression_savings_usd:1.24}}}},{lifetime:{tokens_saved:420000,requests:280},series:{daily:Array.from({length:7},(_,i)=>({timestamp:new Date(Date.now()-(6-i)*86400000).toISOString().slice(0,10)+'T00:00:00Z',tokens_saved:[8000,14000,11000,21000,16000,24000,26000][i]}))}},{service:'headroom-proxy',status:'healthy'});
const rtk=normalizeRtk({summary:{total_commands:120,total_input:800000,total_output:240000,total_saved:560000,avg_savings_pct:70},commands:[{command:'rtk git status',count:56,input_tokens:200000,output_tokens:60000,saved_tokens:140000,savings_pct:70}],daily:[{date:now.slice(0,10),commands:120,saved_tokens:560000}]},{});
const instance=normalizeSerena(24282,{stats:{find_symbol:{num_times_called:16,input_tokens:200,output_tokens:800},read_file:{num_times_called:8,input_tokens:50,output_tokens:500}}},{tool_names:['find_symbol','read_file']},{active_tools:['find_symbol','read_file'],active_project:{name:'Atlas'},context:{name:'coding'},languages:['typescript'],agent_interface:'REPL'});
const log=[{id:2,observedAt:now,since:earlier,port:24282,tool:'find_symbol',kind:'calls',count:2,total:16},{id:1,observedAt:earlier,since:null,port:24282,tool:'read_file',kind:'snapshot',count:null,total:8}];
const serena={state:'connected',checkedAt:now,lastSuccess:now,errors:[],notes:['Synthetic UI fixture.'],instances:[instance],ports:[24282],calls:24,rows:instance.rows,history:[{date:earlier,calls:22,saved:null,input:null,output:null},{date:now,calls:24,saved:null,input:null,output:null}],activity:'recorded',reportingInstances:1,emptyInstances:0,unavailableInstances:0,activityLog:log};
const metrics={updatedAt:now,headroom,rtk,serena,services:[{name:'Shrinkcage',port:8790,listening:true,reachable:true,integration:'Running',process:'node',pid:null,dashboard:base}],systemErrors:[],snapshots:false};
try{
  if(!process.env.SHRINKCAGE_TEST_URL){
    const existing=await fetch(base+'/api/health',{signal:AbortSignal.timeout(400)}).catch(()=>null);if(existing)throw new Error('Port 8790 is occupied. Stop the owned server or explicitly set SHRINKCAGE_TEST_URL to use its frontend assets.');
    temp=await mkdtemp(join(tmpdir(),'shrinkcage-ui-'));await writeFile(join(temp,'settings.json'),JSON.stringify(Object.fromEntries(['codex','claude','gemini'].map(a=>[a,{enabled:false,root:null}]))));
    child=spawn(process.execPath,['dist-server/server/index.js'],{env:{...process.env,SHRINKCAGE_DATA_DIR:temp,OPEN_BROWSER:'0'},stdio:'pipe'});
    let ready=false;for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,150));if((await fetch(base+'/api/health').catch(()=>null))?.ok){ready=true;break;}}assert.ok(ready,'Test server should start');
  }
  browser=await chromium.launch({headless:true,...(process.env.SHRINKCAGE_BROWSER_EXECUTABLE?{executablePath:process.env.SHRINKCAGE_BROWSER_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light',reducedMotion:'reduce'});const page=await context.newPage();const errors=[],external=[];let configSaved=false;
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:'))external.push(r.url());});
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());let data;
    if(url.pathname==='/api/metrics'||url.pathname==='/api/refresh')data=metrics;
    else if(url.pathname==='/api/workspace'||url.pathname==='/api/discover')data=ws;
    else if(url.pathname==='/api/connectors/config'){configSaved=true;data=ws;}
    else if(url.pathname==='/api/sessions'){let items=sessions;for(const key of ['agent','model'])if(url.searchParams.get(key))items=items.filter(s=>s[key]===url.searchParams.get(key));if(url.searchParams.get('provider'))items=items.filter(s=>(s.provider??'unknown')===url.searchParams.get('provider'));if(url.searchParams.get('project'))items=items.filter(s=>s.project.id===url.searchParams.get('project'));const q=(url.searchParams.get('search')||'').toLowerCase();items=items.filter(s=>`${s.project.label} ${s.model}`.toLowerCase().includes(q));data={items,total:items.length,offset:0,limit:50,updatedAt:now};}
    else if(url.pathname.startsWith('/api/sessions/'))data=sessions.find(s=>s.id===url.pathname.split('/').at(-1));
    else return route.continue();
    await route.fulfill({json:data??{error:'Not found'}});
  });
  await page.goto(base);await page.getByRole('heading',{name:'Workspace overview'}).waitFor();await page.locator('.session-inspector').waitFor();await page.locator('#analytics .recharts-surface').waitFor();
  await mkdir('artifacts',{recursive:true});
  await page.evaluate(()=>{const x=document.createElement('div');x.textContent='Illustrative test data';x.style.cssText='position:fixed;bottom:8px;right:12px;z-index:1000;background:#25352c;color:#fff;padding:4px 8px;border-radius:5px;font:10px sans-serif';document.body.append(x);});
  await page.screenshot({path:'artifacts/overview.png'});await page.locator('#sessions').screenshot({path:'artifacts/sessions.png'});
  await page.getByRole('combobox',{name:'Filter agent',exact:true}).selectOption('claude');await page.waitForFunction(()=>document.querySelector('.session-detail-heading .eyebrow')?.textContent.includes('Claude Code'));
  await page.getByRole('combobox',{name:'Filter agent',exact:true}).selectOption('');await page.getByRole('textbox',{name:'Search sessions',exact:true}).fill('not-a-project');await page.getByText('No matching saved sessions',{exact:true}).waitFor();await page.getByRole('textbox',{name:'Search sessions',exact:true}).fill('');await page.locator('.session-inspector').waitFor();
  await page.getByRole('combobox',{name:'Sort sessions',exact:true}).selectOption('tokens');await page.getByRole('combobox',{name:'Session time range',exact:true}).selectOption('7');
  await page.getByRole('combobox',{name:'Filter model',exact:true}).selectOption('model-gamma');await page.waitForFunction(()=>document.querySelector('.session-detail-heading .eyebrow')?.textContent.includes('Gemini CLI'));await page.getByRole('combobox',{name:'Filter model',exact:true}).selectOption('');
  const card=page.locator('.connector-card').filter({has:page.getByRole('heading',{name:'Codex CLI',exact:true})});await card.locator('.connector-setup summary').click();const save=card.getByRole('button',{name:'Save approved location'});assert.equal(await save.isDisabled(),true);await card.getByRole('textbox',{name:'Codex CLI session folder'}).fill('/synthetic/approved/session-folder');await card.getByRole('checkbox',{name:/I approve/}).check();await save.click();await card.getByText('Saved. Only Shrinkcage settings were updated.').waitFor();assert.equal(configSaved,true);
  const h=page.getByRole('group',{name:'Headroom views'});await h.getByRole('button',{name:'History',exact:true}).click();for(const name of ['Daily','Weekly','Monthly'])await page.locator('#headroom').getByRole('button',{name,exact:true}).click();await h.getByRole('button',{name:/Metrics/}).click();
  const commands=page.getByRole('textbox',{name:'Search commands',exact:true});await commands.fill('no-match');await page.getByText('No matching results',{exact:true}).waitFor();await commands.fill('');await page.locator('#rtk').getByRole('button',{name:/Executions/}).click();
  for(const value of ['rtk','serena','headroom'])await page.getByRole('combobox',{name:'Chart data source'}).selectOption(value);for(const name of ['Today','7 days','30 days','All time'])await page.getByRole('button',{name,exact:true}).click();
  await page.getByRole('group',{name:'Serena views'}).getByRole('button',{name:/Instances/}).click();await page.getByRole('group',{name:'Serena instances'}).getByRole('button').first().click();await page.getByRole('link',{name:'Explore Serena activity'}).click();await page.getByRole('log',{name:'Serena tool activity',exact:true}).waitFor();
  const response=page.waitForResponse(r=>r.url().endsWith('/api/refresh'));await page.getByRole('button',{name:'Refresh',exact:true}).click();assert.equal((await response).status(),200);
  await page.getByRole('button',{name:'Switch to dark mode'}).click();await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:'artifacts/dark.png'});await page.reload();await page.locator('.session-inspector').waitFor();assert.equal(await page.locator('html').getAttribute('class'),'dark');await page.getByRole('button',{name:'Switch to light mode'}).click();
  for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`No page overflow at ${width}`);}
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:'artifacts/mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  if(process.env.SHRINKCAGE_DOC_SCREENSHOTS==='1'){await mkdir('docs/images',{recursive:true});for(const name of ['overview','sessions','dark','mobile'])await copyFile(`artifacts/${name}.png`,`docs/images/${name}.png`);}
  const logo=await browser.newPage();await logo.goto(base+'/icon.svg');
  await logo.waitForFunction(()=>document.getAnimations().length===4);
  await logo.evaluate(()=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=0;}));
  assert.equal(await logo.locator('.top').evaluate(e=>getComputedStyle(e).opacity),'1');
  await logo.locator('svg').screenshot({path:'artifacts/logo-stack.png'});
  await logo.evaluate(()=>document.getAnimations().forEach(a=>{a.currentTime=3600;}));
  assert.equal(await logo.locator('.top').evaluate(e=>Number(getComputedStyle(e).opacity)<.01),true);
  assert.equal(await logo.locator('.third').evaluate(e=>Number(getComputedStyle(e).opacity)<.01),true);
  assert.equal(await logo.locator('.base').evaluate(e=>getComputedStyle(e).opacity),'1');
  await logo.locator('svg').screenshot({path:'artifacts/logo-reduced.png'});
  await logo.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await logo.locator('.top').evaluate(e=>getComputedStyle(e).animationName),'none');
  assert.equal(await logo.locator('.top').evaluate(e=>getComputedStyle(e).opacity),'1');await logo.close();
  console.log('PASS: branded UI, provider/agent/project session grouping, filters, details, approved connector settings, retained optimization controls, themes, responsive layouts, local-only requests, coin animation and reduced motion. Screenshots use synthetic test data.');
}finally{await browser?.close();if(child){const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,5000))]);if(child.exitCode===null)child.kill('SIGKILL');}if(temp)await rm(temp,{recursive:true,force:true});}
