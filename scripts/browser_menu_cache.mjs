/** Hosted entry showed fallback chrome before checking originals. Require setup first,
 * then verify real cached menu art/video on a cold service-worker start and offline.
 * Readiness padding is synthetic; menu media comes only from ignored local output. */
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const url=process.env.RA2_BROWSER_URL||'http://127.0.0.1:4229/';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:800}});
const page=await context.newPage(),errors=[],downloads=[],failed=[];
page.on('requestfailed',r=>failed.push({url:r.url(),reason:r.failure()}));
page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',route=>{
  if(/archive\.org/.test(route.request().url())){downloads.push(route.request().url());return route.abort();}
  return route.continue();
});
try {
  await page.goto(url);
  await page.locator('.asset-setup-screen').waitFor({timeout:10000});
  assert.equal(await page.getByTestId('mode-screen').count(),0,'unprepared entry must not masquerade as the finished menu');
  assert.deepEqual(downloads,[],'first entry does not download an installer without consent');
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  const manifest=JSON.parse(await readFile('public/assets/manifest.json','utf8'));
  const files=['/assets/manifest.json',...new Set(Object.values(manifest.ui).map(s=>s.src)),manifest.menuVideo.src];
  // The fixture never enters gameplay, so unrelated game files need only marker keys.
  await page.evaluate(async()=>{await caches.delete('ra2-originals-v2');});
  for(const file of files){
    const bytes=await readFile('public'+file);
    await page.evaluate(async({file,data})=>{
      const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
      const type=file.endsWith('.png')?'image/png':file.endsWith('.webm')?'video/webm':'application/json';
      await (await caches.open('ra2-originals-v2')).put(file,new Response(bytes,{headers:{'Content-Type':type}}));
    },{file,data:bytes.toString('base64')});
  }
  await page.evaluate(async files=>{
    const cache=await caches.open('ra2-originals-v2');
    for(let i=files.length;i<3001;i++){const path=`/assets/test-padding-${i}`;files.push(path);await cache.put(path,new Response('fixture'));}
    await cache.put('/assets/ready.json',Response.json({version:8,sourceSha256:'5388c54d7d7b73060083563ff1926bca0d2663a76678b807e23e9a8d491441ce',files,installedAt:new Date().toISOString()}));
    for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister();
  },files);
  await page.goto('about:blank');await page.goto(url);
  await page.locator('.menu-monitor.has-video').waitFor({timeout:20000});
  await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.1);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.nativeMenu),'true');
  await page.locator('.entry-splash').waitFor({state:'hidden'});
  await mkdir('.cache/menu-video',{recursive:true});
  await page.screenshot({path:'.cache/menu-video/hosted-cached-menu.png'});
  await context.unroute('**/*');
  await context.setOffline(true);await page.reload();
  await page.locator('.menu-monitor.has-video').waitFor({timeout:20000});
  await context.setOffline(false);
  await page.evaluate(async()=>{await (await caches.open('ra2-originals-v2')).delete('/assets/ui/ra2ts_l.webm');});
  await page.reload();await page.locator('.asset-setup-screen').waitFor({timeout:10000});
  assert.deepEqual(errors,[]);assert.deepEqual(downloads,[]);
  console.log('PASS hosted fresh setup, cold-worker native skin/video, offline entry and incomplete-cache recovery');
}catch(error){console.error(await page.content(),errors,failed,await page.evaluate(async()=>({controller:navigator.serviceWorker.controller?.scriptURL,cache:await (await caches.open('ra2-app-v10')).keys().then(r=>r.map(x=>x.url))})));throw error;}
finally{await browser.close();}
