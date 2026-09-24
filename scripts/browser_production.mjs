/** 浏览器验证飞机名额、停机位置、建筑按钮和通知刷新。 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const url = process.env.RA2_BROWSER_URL || 'http://127.0.0.1:4248/';
const out = '.cache/airfield';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const card = id => page.locator(`[data-build="${id}"]`);
const tick = () => page.waitForTimeout(300);
try {
  await page.goto(url);
  await page.getByTestId('mode-skirmish').click();
  await page.locator('#start').waitFor({ timeout: 60000 });
  await page.locator('#music').uncheck();
  await page.locator('[data-slot="0"][data-key="country"]').selectOption('korea');
  await page.locator('#start').click();
  await page.locator('#battlefield-canvas').waitFor();
  console.log('Entered skirmish');
  await page.evaluate(() => {
    const { game: g, renderer: r } = window.ra2;
    g.paused = true; g.setDebugMapReveal(true); g.adjustDebugCredits(100000);
    g.deploy(g.entities.filter(e => e.type.includes('mcv')).map(e => e.id));
    const o = g.players[0].spawn;
    g.spawnEntity('power_plant', 0, o.x + 4, o.y);
    g.spawnEntity('refinery', 0, o.x + 9, o.y);
    g.spawnEntity('barracks', 0, o.x - 4, o.y);
    const a = g.spawnEntity('airforce_command', 0, o.x + 5.5, o.y + 5);
    window.airfieldId = a.id;
    r.camera = r.project(a.x, a.y); r.zoom = 2; r.draw();
  });
  assert.equal(await page.evaluate(() => ['gaairc', 'gaairc-snow'].every(key =>
    window.ra2.assets.manifest.sprites[key].originalLayers.some(layer => /aircbb\.shp$/.test(layer)))), true);
  await tick();
  await page.locator('[data-category="vehicle"]').click();
  console.log('Aircraft tab available');
  for (const type of ['harrier', 'black_eagle', 'harrier', 'black_eagle']) { await card(type).click(); await tick(); }
  assert.equal(await card('harrier').getAttribute('aria-disabled'), 'true');
  assert.equal(await card('black_eagle').getAttribute('aria-disabled'), 'true');
  await card('harrier').click({ force: true }); await tick();
  assert.equal(await page.evaluate(() => window.ra2.game.players[0].queues.aircraft.length), 4);
  await card('black_eagle').click({ button: 'right', force: true }); await tick();
  assert.equal(await card('harrier').getAttribute('aria-disabled'), 'false');
  await card('black_eagle').click(); await tick();
  await page.evaluate(() => window.ra2.game.setDebugInstantProduction(true)); await tick();
  const docks = await page.evaluate(() => {
    const { game: g, renderer: r } = window.ra2;
    const fighters = g.ownEntities(0).filter(e => ['harrier', 'black_eagle'].includes(e.type));
    r.draw();
    return fighters.map(e => { const p = r.toScreen(e.x, e.y); return { id: e.id, height: r.flyingHeight(e, { flying: true, category: 'aircraft' }), picked: r.pick(p.x, p.y)?.id }; });
  });
  assert.equal(docks.length, 4);
  for (const dock of docks) { assert.equal(dock.height, 0); assert.equal(dock.picked, dock.id); }
  await page.screenshot({ path: `${out}/four-parked.png` });
  await page.evaluate(() => {
    const { game: g } = window.ra2, a = g.getEntity(window.airfieldId);
    const ids = g.ownEntities(0).filter(e => ['harrier', 'black_eagle'].includes(e.type)).map(e => e.id);
    g.commandMove(ids, a.x - 7, a.y + 6); g.paused = false;
    for (let i = 0; i < 40; i++) g.step(.1);
    g.paused = true;
  }); await tick();
  assert.equal(await card('harrier').getAttribute('aria-disabled'), 'true');
  assert.equal(await card('harrier').count(), 1);
  await page.evaluate(() => {
    const g = window.ra2.game, a = g.getEntity(window.airfieldId);
    g.spawnEntity('airforce_command', 0, a.x + 6, a.y);
  }); await tick();
  assert.equal(await card('harrier').getAttribute('aria-disabled'), 'false');
  await page.locator('[data-category="structure"]').click();
  for (const type of ['power_plant', 'refinery', 'barracks', 'airforce_command']) assert.equal(await card(type).count(), 1);
  await page.waitForTimeout(6600);
  await page.locator('[data-category="defense"]').click();
  await card('patriot').click(); await tick();
  assert.equal(await card('patriot').locator('.ready-text').count(), 1);
  assert.equal(await page.locator('#hud-message').textContent(), '');
  await card('patriot').click(); await tick();
  assert.equal(await page.locator('#hud-message').textContent(), '');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const g = window.ra2.game, a = g.getEntity(window.airfieldId);
    g.spawnEntity('weather_control', 0, a.x + 12, a.y);
    for(let i=0;i<5;i++)g.spawnEntity('power_plant',0,a.x+15+i*3,a.y);
    g.players[0].abilityCooldowns.lightning = 30;
  }); await tick();
  await page.evaluate(() => { window.supportNode = document.querySelector('[data-support="lightning"]'); window.supportNode.focus(); });
  await page.evaluate(() => { window.ra2.game.players[0].abilityCooldowns.lightning = 29; }); await tick();
  assert.equal(await page.evaluate(() => window.supportNode === document.querySelector('[data-support="lightning"]') && document.activeElement === window.supportNode), true);
  assert.equal(await page.locator('[data-support="lightning"] .ready-text').textContent(), '00:29');
  assert.equal(await page.locator('[data-support="lightning"] .progress-mask').isVisible(), true);
  await page.evaluate(() => { window.ra2.game.players[0].abilityCooldowns.lightning = 0; }); await tick();
  assert.equal(await page.locator('[data-support="lightning"]').getAttribute('aria-disabled'), 'false');
  await page.locator('[data-support="lightning"]').click();
  assert.equal(await page.evaluate(() => window.ra2.renderer.tool), 'support');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const g = window.ra2.game;
    g.events.push({ id: (g.events.at(-1)?.id ?? 0) + 1, time: g.time, owner: 0, kind: 'warning', text: '警告：我方基地正在遭受攻击！' });
  }); await tick();
  await page.evaluate(() => { window.noticeNode = document.querySelector('#hud-message .notice.warn'); });
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(() => !!window.noticeNode && window.noticeNode === document.querySelector('#hud-message .notice.warn')), true);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${out}/capacity-and-warning.png` });
  console.log('PASS aircraft capacity, native pads, aircraft picking, repeatable buildings, ready feedback, stable warning nodes');
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` }); throw error;
} finally { await browser.close(); }
