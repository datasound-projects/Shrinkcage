// Real browser/API/SQLite/managed processes. Desktop dialog/opener and Herdr liveness are isolated fixtures.
import {chromium} from 'playwright';
import {mkdir,copyFile,writeFile,chmod} from 'node:fs/promises';
import {basename,dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {fakeWorkspace} from '../tests/control-fixtures.ts';
import {ControlPlane} from '../server/control/core.ts';
import {runTerminalTicket} from '../server/control/terminal.ts';
import {makeServer} from '../server/http.ts';
import {normalizeHeadroom,normalizeRtk} from '../server/adapters.ts';
let f,plane,server,browser;const runs=[],opened=[],errors=[];let available=false;
try{
  f=await fakeWorkspace();const other=join(f.root,'other-project');await mkdir(other);
  await writeFile(join(f.bin,'herdr'),'#!/bin/sh\nexit 0\n');await chmod(join(f.bin,'herdr'),0o700);
  const folders=[null,f.project,other];
  plane=new ControlPlane({dataDir:f.data,env:{...f.env,FIXTURE_NATIVE_USAGE:'1'},home:f.home,pickDirectory:async()=>folders.shift()??null,terminal:{
    desktopDiscovery:async()=>[{id:'terminal-app',name:'Terminal',icon:'▣',command:'/fixture/terminal'},{id:'wezterm',name:'WezTerm',icon:'▤',command:'/fixture/wezterm'}],
    discover:async()=>[{id:'terminal',name:'Terminal',available:true,reason:'Legacy interface'},{id:'herdr',name:'Herdr',available,reason:available?'Isolated Herdr fixture':'Herdr is not installed in this isolated fixture.'}],
    sessionRunning:async()=>true,
    openScript:async file=>{opened.push(file);const id=basename(dirname(file)),ticket=plane.store.terminalLaunch(id);if(['opening','waiting'].includes(ticket.state))runs.push(runTerminalTicket(plane,id,{interactive:true}).catch(e=>{errors.push(e.message);}));}
  }});
  server=makeServer(async()=>({updatedAt:new Date().toISOString(),headroom:normalizeHeadroom({}, {}, {}),rtk:normalizeRtk({},{}),serena:{state:'offline',checkedAt:new Date().toISOString(),lastSuccess:null,errors:[],notes:[],instances:[],ports:[24282],calls:null,rows:[],history:[],activity:'unavailable',reportingInstances:0,emptyInstances:0,unavailableInstances:0,activityLog:[]},services:[],systemErrors:[],snapshots:false}),resolve(fileURLToPath(new URL('../dist/',import.meta.url))),undefined,plane);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.SHRINKCAGE_BROWSER_EXECUTABLE?{executablePath:process.env.SHRINKCAGE_BROWSER_EXECUTABLE}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/same key|unique.*key/i.test(m.text()))errors.push(m.text());});
  await page.route('**/api/workspace',route=>route.fulfill({json:{updatedAt:new Date().toISOString(),version:'fixture',platform:'test',csrfToken:'0'.repeat(48),totalSessions:0,scanLimited:false,settingsError:null,projects:[],providers:[],models:[],connectors:[]}}));
  await page.goto(base);await page.getByRole('heading',{name:'Projects & sessions',level:1,exact:true}).waitFor();
  const manager=page.locator('#managed');
  await manager.getByRole('button',{name:'Add project',exact:true}).click();await manager.getByText('No folder added.',{exact:true}).waitFor();assert.equal(plane.store.projects().length,0);
  await manager.getByRole('button',{name:'Add project',exact:true}).click();await page.locator('.project-buttons').getByRole('button',{name:/^project /}).waitFor();
  const project=plane.store.projects().find(p=>p.label==='project');assert.ok(project);assert.equal(plane.store.projects().length,1);
  await manager.getByRole('link',{name:'New session',exact:true}).click();assert.equal(await page.getByRole('combobox',{name:'Setup project',exact:true}).inputValue(),project.id);
  const terminalMenu=page.getByRole('combobox',{name:'Terminal application',exact:true});await terminalMenu.waitFor();await terminalMenu.selectOption('wezterm');await page.waitForFunction(()=>!document.querySelector('.terminal-picker select')?.disabled);assert.equal((await(await fetch(base+'/api/control/v1/terminal-emulators')).json()).preferred,'wezterm');
  await page.getByRole('checkbox',{name:'Remember my choice',exact:true}).uncheck();await terminalMenu.selectOption('terminal-app');assert.equal((await(await fetch(base+'/api/control/v1/terminal-emulators')).json()).preferred,'wezterm','session override does not replace the saved default');
  const headroomSwitch=page.getByRole('switch',{name:'Setup enable Headroom',exact:true});
  for(const agent of ['codex','claude'])for(const billing of ['subscription','api']){
    await page.getByRole('combobox',{name:'Setup agent',exact:true}).selectOption(agent);await page.getByRole('combobox',{name:'Setup billing',exact:true}).selectOption(billing);
    await page.waitForFunction(()=>document.querySelector('[aria-label="Review session configuration"]')?.disabled===false);
    assert.equal(await headroomSwitch.isDisabled(),false,agent+'/'+billing+' supports Headroom');await headroomSwitch.check();assert.equal(await headroomSwitch.isChecked(),true);
    assert.equal(await page.getByText('Requires Codex with API billing',{exact:true}).count(),0);
  }
  await page.getByRole('combobox',{name:'Setup agent',exact:true}).selectOption('codex');
  await page.getByRole('combobox',{name:'Setup billing',exact:true}).selectOption('api');
  await page.waitForFunction(()=>!document.querySelector('[aria-label="Review session configuration"]')?.disabled);
  for(const name of ['RTK','Serena'])await page.getByRole('switch',{name:'Setup enable '+name,exact:true}).check();
  f.headroomState.optimize=false;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByText('Headroom is running with compression disabled.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Review session configuration',exact:true}).click();await page.locator('[aria-label="Setup configuration preview"]').getByText('A few things need attention',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Open in Herdr',exact:true}).isDisabled(),true);
  f.headroomState.optimize=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.simple-tool-list .unavailable'));assert.equal(await page.locator('[aria-label="Setup configuration preview"]').count(),0,'health recovery invalidates the old approval');
  await page.getByRole('switch',{name:'Setup enable Headroom',exact:true}).uncheck();
  let releasePlan;const heldPlan=new Promise(r=>{releasePlan=r;});let capturedPlan=false;
  const delayPlan=async route=>{const response=await route.fetch();capturedPlan=true;await heldPlan;await route.fulfill({response});};
  await page.route('**/api/control/v1/plans',delayPlan);await page.getByRole('button',{name:'Review session configuration',exact:true}).click();
  for(let i=0;i<200&&!capturedPlan;i++)await new Promise(r=>setTimeout(r,50));assert.equal(capturedPlan,true);
  await page.getByRole('combobox',{name:'Setup agent',exact:true}).selectOption('claude');const delivered=page.waitForResponse(r=>r.url().endsWith('/plans'));releasePlan();await delivered;await page.waitForFunction(()=>document.querySelector('[aria-label="Review session configuration"]')?.disabled===false);
  assert.equal(await page.locator('[aria-label="Setup configuration preview"]').count(),0,'an old Codex review cannot appear after choosing Claude');await page.unroute('**/api/control/v1/plans',delayPlan);
  await page.getByRole('combobox',{name:'Setup agent',exact:true}).selectOption('codex');await page.getByRole('combobox',{name:'Setup billing',exact:true}).selectOption('api');await page.waitForFunction(()=>document.querySelector('[aria-label="Review session configuration"]')?.disabled===false);await page.getByRole('switch',{name:'Setup enable Headroom',exact:true}).uncheck();
  await page.getByRole('button',{name:'Review session configuration',exact:true}).click();const start=page.getByRole('button',{name:'Open in Herdr',exact:true});await start.waitFor();assert.equal(await start.isDisabled(),true);assert.equal(opened.length,0);
  await page.getByRole('checkbox',{name:'Approve setup launch preview',exact:true}).check();assert.equal(await start.isDisabled(),true);await page.getByText('Herdr is not installed in this isolated fixture.',{exact:false}).first().waitFor();assert.equal(await page.getByRole('combobox',{name:'Session terminal',exact:true}).count(),0,'no silent Terminal fallback');
  available=true;await page.getByText('Herdr availability & persistence',{exact:true}).click();await page.getByRole('button',{name:'Recheck Herdr',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.terminal-start .primary')?.disabled);
  await page.getByText('Herdr availability & persistence',{exact:true}).click();await mkdir('artifacts',{recursive:true});await page.evaluate(()=>{const label=document.createElement('div');label.textContent='Illustrative test data';label.style.cssText='position:fixed;top:80px;right:28px;z-index:1000;color:#fff;background:#30363f;padding:5px 9px;border-radius:5px;font:10px sans-serif';document.body.append(label);});await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});await page.screenshot({path:'artifacts/start-session.png',fullPage:true});
  let loseAcknowledgement=true;const requestIds=[];const intercept=async route=>{if(route.request().method()!=='POST')return route.continue();requestIds.push(route.request().postDataJSON().requestId);if(loseAcknowledgement){loseAcknowledgement=false;await route.fetch();await route.abort('failed');}else await route.continue();};await page.route('**/api/control/v1/terminal-launches',intercept);
  await start.click();await page.getByRole('alert').filter({hasText:'The launch was not confirmed'}).waitFor();assert.equal(opened.length,1);await start.click();await page.getByRole('heading',{name:'Projects & sessions',level:1,exact:true}).waitFor({timeout:20000});await Promise.all(runs);assert.equal(requestIds[0],requestIds[1],'a lost response retries the original request');await page.unroute('**/api/control/v1/terminal-launches',intercept);
  await page.waitForFunction(()=>sessionStorage.getItem('shrinkcage:terminal')==='wezterm');
  let sessions=plane.store.sessions();assert.equal(plane.store.terminalLaunches()[0].emulator,'terminal-app');assert.equal(sessions.length,1);assert.deepEqual(sessions[0].plannedTools,['rtk','serena']);assert.deepEqual(sessions[0].appliedTools,['rtk','serena']);assert.equal(sessions[0].exitCode,0);assert.equal(opened.length,1);assert.equal(basename(opened[0]),'herdr.command');
  await manager.getByRole('button',{name:'Reopen in Herdr',exact:true}).click();await manager.getByText('Opened the existing Herdr session.',{exact:true}).waitFor();assert.equal(plane.store.sessionCount(),1);assert.equal(opened.length,2,'reopen attaches without a second agent');
  // A second project has its own empty session list.
  await manager.getByRole('button',{name:'Add project',exact:true}).click();await page.locator('.project-buttons').getByRole('button',{name:/^other-project /}).waitFor();await manager.getByText('No sessions here yet.',{exact:false}).waitFor();
  await page.locator('.project-buttons').getByRole('button',{name:/^project /}).click();await manager.getByRole('link',{name:'New session',exact:true}).click();
  for(const name of ['RTK','Serena','Headroom'])await page.getByRole('switch',{name:'Setup enable '+name,exact:true}).uncheck();
  await page.getByRole('button',{name:'Review session configuration',exact:true}).click();await page.getByRole('checkbox',{name:'Approve setup launch preview',exact:true}).check();await start.click();await page.getByRole('heading',{name:'Projects & sessions',level:1,exact:true}).waitFor({timeout:20000});await Promise.all(runs);sessions=plane.store.sessions();assert.equal(sessions.length,2);assert.deepEqual(sessions[0].plannedTools,[]);assert.deepEqual(sessions[1].plannedTools,['rtk','serena']);assert.equal(opened.length,3);
  await manager.getByRole('checkbox',{name:'Enable RTK for session',exact:true}).check();await manager.getByRole('button',{name:'Save next-launch stack',exact:true}).click();await manager.getByRole('button',{name:'Preview restart plan',exact:true}).click();await manager.getByRole('checkbox',{name:'Approve session restart preview',exact:true}).check();await manager.getByRole('button',{name:'Open in Herdr',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[aria-label="Managed session list"] [role="listitem"]').length===3);await Promise.all(runs);sessions=plane.store.sessions();assert.equal(sessions.length,3);assert.deepEqual(sessions[0].plannedTools,['rtk']);assert.equal(opened.length,4);assert.equal(sessions[1].plannedTools.length,0,'the baseline session remains unchanged');
  assert.equal(await manager.getByRole('button',{name:'Reopen in Herdr',exact:true}).count(),1);await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});await page.screenshot({path:'artifacts/project-sessions.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:'artifacts/project-sessions-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);if(process.env.SHRINKCAGE_DOC_SCREENSHOTS==='1'){await copyFile('artifacts/start-session.png','docs/images/start-session.png');await copyFile('artifacts/project-sessions.png','docs/images/projects.png');}
  console.log('PASS: project-first default, native folder cancellation/selection, per-project lists, automatic compatible defaults, independent session switches, explicit approval, Herdr-only launch, missing-Herdr recovery, real managed receipts, lost-response retries and reconnect without a duplicate agent, pending next-launch stacks and responsive layouts.');
}catch(e){console.error(JSON.stringify({error:e.message,opened:opened.length,launches:plane?.terminals.list(),sessions:plane?.store.sessions().map(s=>({id:s.id,tools:s.plannedTools,status:s.status})),runtimeErrors:errors}));throw e;}
finally{await Promise.all(runs);if(browser)await browser.close();if(server)await new Promise(r=>{server.close(()=>r());server.closeAllConnections();});plane?.close();if(f)await f.close();}
