// The static guide must remain usable without telemetry, agent discovery or writes.
import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {makeServer} from '../server/http.ts';
import {sections} from '../src/useSectionNavigation.ts';
let server,browser;const errors=[],writes=[];
try{
  server=makeServer(async()=>{throw Error('Offline guide fixture');},resolve('dist'));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.SHRINKCAGE_BROWSER_EXECUTABLE?{executablePath:process.env.SHRINKCAGE_BROWSER_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light',reducedMotion:'reduce'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')writes.push(r.method()+' '+new URL(r.url()).pathname);});
  await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'Read-only offline fixture'}}));
  await page.goto(base);await page.getByRole('heading',{name:'Overview',exact:true,level:1}).waitFor();
  const help=page.locator('.sidebar-help').getByRole('link',{name:'How to use',exact:true});await help.click();await page.getByRole('heading',{name:'Start your first session',exact:true}).waitFor();
  assert.equal(new URL(page.url()).hash,'#help');assert.equal(await help.getAttribute('aria-current'),'page');assert.equal(await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('link').count(),5);assert.equal(await page.getByRole('navigation',{name:'Main navigation',exact:true}).locator('[aria-current="page"]').count(),0);
  const navBox=await page.getByRole('navigation',{name:'Main navigation',exact:true}).boundingBox(),helpBox=await help.boundingBox();assert.ok(helpBox.y>navBox.y+navBox.height,'help belongs below the main sidebar navigation');
  const topics=page.locator('.help-topics>details');assert.equal(await topics.count(),10);
  for(let i=0;i<await topics.count();i++){await topics.nth(i).locator('summary').click();assert.equal(await topics.nth(i).evaluate(e=>e.open),true);await topics.nth(i).locator('summary').click();}
  const links=await page.locator('.help-guide a').evaluateAll(a=>a.map(x=>x.getAttribute('href'))),valid=new Set(sections.map(([id])=>'#'+id));assert.ok(links.every(link=>valid.has(link)),'every guide link has a real application route');
  const first=topics.first().locator('summary');await first.focus();await page.keyboard.press('Enter');assert.equal(await topics.first().evaluate(e=>e.open),true);await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.tagName),'A');await first.click();
  await page.getByRole('link',{name:'Start a session',exact:true}).click();await page.getByRole('heading',{name:'New session',level:1,exact:true}).waitFor();await page.goBack();await page.getByRole('heading',{name:'How to use',level:1,exact:true}).waitFor();
  await page.reload();await page.getByRole('heading',{name:'Start your first session',exact:true}).waitFor();assert.equal(new URL(page.url()).hash,'#help');assert.equal(await page.getByRole('alert').count(),0,'unrelated API failures do not obscure the static guide');assert.equal(await page.locator('.initial-loading').count(),0,'the guide does not wait for telemetry');assert.equal(await page.locator('.help-steps').evaluate(e=>getComputedStyle(e).listStyleType),'decimal');
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/how-to-use-desktop.png',fullPage:true});
  for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:1000});await topics.nth(5).locator('summary').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'guide fits '+width);await topics.nth(5).locator('summary').click();}
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Switch to dark mode',exact:true}).click();await page.locator('.topbar').getByRole('link',{name:/New session/}).click();await page.getByRole('heading',{name:'New session',level:1,exact:true}).waitFor();
  await page.locator('.mobile-help-link').click();await page.getByRole('heading',{name:'How to use',level:1,exact:true}).waitFor();assert.equal(await page.locator('.mobile-help-link').getAttribute('aria-current'),'page');await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'artifacts/how-to-use-mobile.png',fullPage:true});
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);console.log('PASS: bottom-sidebar and mobile help, all manual topics and links, keyboard, deep links, back navigation, silver/graphite layouts, and readable guide with every API offline. No mutation requests.');
}finally{await browser?.close();if(server)await new Promise(r=>{server.close(()=>r());server.closeAllConnections();});}
