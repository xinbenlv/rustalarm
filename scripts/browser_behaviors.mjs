/** 独立浏览器验证集结点、雷达右键、限额按钮和建筑完整图层。 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const url = process.env.RA2_BROWSER_URL || 'http://127.0.0.1:4248/';
const out = '.cache/behavior';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const card = id => page.locator(`[data-build="${id}"]`);
const tick = () => page.waitForTimeout(300);
try {
  await page.goto(url); await page.getByTestId('mode-skirmish').click();
  await page.locator('#start').waitFor({ timeout: 60000 });
  await page.locator('#music').uncheck();
  await page.locator('[data-slot="0"][data-key="country"]').selectOption('korea');
  await page.locator('#start').click(); await page.locator('#battlefield-canvas').waitFor();
  await page.evaluate(() => {
    const { game: g, renderer: r } = window.ra2;
    g.paused = true; g.setDebugMapReveal(true); g.adjustDebugCredits(100000);
    g.deploy(g.entities.filter(e => e.type.includes('mcv')).map(e => e.id));
    const o = g.players[0].spawn;
    g.spawnEntity('nuclear_reactor', 0, o.x - 5, o.y);
    const barracks = g.spawnEntity('barracks', 0, o.x + 5, o.y);
    g.spawnEntity('battle_lab', 0, o.x + 10, o.y);
    const airport = g.spawnEntity('airforce_command', 0, o.x + 5.5, o.y + 5);
    const weather = g.spawnEntity('weather_control', 0, o.x + 12, o.y + 7);
    g.spawnEntity('chronosphere', 0, o.x - 1, o.y + 7);
    window.behaviorIds = { barracks: barracks.id, airport: airport.id, weather: weather.id };
    r.selection = new Set([barracks.id]); r.center(barracks.x, barracks.y); r.zoom = 1.6; r.draw();
  }); await tick();
  const point = await page.evaluate(() => {
    const { renderer: r, game: g } = window.ra2, b = g.getEntity(window.behaviorIds.barracks);
    const tile = { x: b.x + 3, y: b.y + 4 }, screen = r.toScreen(tile.x, tile.y);
    const rect = r.canvas.getBoundingClientRect();
    return { x: rect.x + screen.x, y: rect.y + screen.y };
  });
  await page.mouse.click(point.x, point.y, { button: 'right' }); await tick();
  const flag = await page.evaluate(() => {
    const { game: g, renderer: r } = window.ra2, b = g.getEntity(window.behaviorIds.barracks);
    r.draw(); const point = r.toScreen(b.rallyPoint.x, b.rallyPoint.y);
    const pixels = r.ctx.getImageData(Math.round(point.x), Math.round(point.y - 29), 20, 30).data;
    let yellow = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 220 && pixels[i + 1] > 220 && pixels[i + 2] < 80) yellow++;
    return { rally: b.rallyPoint, yellow };
  });
  assert.ok(flag.rally); assert.ok(flag.yellow > 30, 'Selected barracks shows a visible flag');
  const factoryPoint = await page.evaluate(() => {
    const r = window.ra2.renderer, b = r.displayedSprites.get(window.behaviorIds.barracks), rect = r.canvas.getBoundingClientRect();
    return { x: rect.x + b.x + b.w * .5, y: rect.y + b.y + b.h * .6 };
  });
  await page.mouse.dblclick(factoryPoint.x, factoryPoint.y); await tick();
  assert.equal(await page.evaluate(() => window.ra2.game.getEntity(window.behaviorIds.barracks).primaryFactory), true);
  await page.screenshot({ path: `${out}/rally-flag.png` });
  await page.evaluate(() => window.ra2.game.setDebugInstantProduction(true));
  await page.locator('[data-category="infantry"]').click(); await card('gi').click(); await tick();
  assert.deepEqual(await page.evaluate(() => window.ra2.game.ownEntities(0).filter(e => e.type === 'gi').at(-1).order), { kind: 'move', ...flag.rally });
  await card('tanya').click(); await tick();
  assert.equal(await card('tanya').count(), 1); assert.equal(await card('tanya').getAttribute('aria-disabled'), 'true');
  assert.ok(await card('tanya').evaluate(el => getComputedStyle(el).filter.includes('brightness(0.5)')));
  await page.locator('[data-category="structure"]').click(); await tick();
  for (const type of ['weather_control', 'chronosphere']) {
    assert.equal(await card(type).count(), 1); assert.equal(await card(type).getAttribute('aria-disabled'), 'true');
  }
  await page.evaluate(() => window.ra2.game.sell(window.behaviorIds.weather)); await tick();
  assert.equal(await card('weather_control').getAttribute('aria-disabled'), 'false');
  const before = await page.evaluate(() => ({ ...window.ra2.renderer.camera }));
  const radar = await page.locator('#radar').boundingBox();
  await page.mouse.click(radar.x + radar.width * .65, radar.y + radar.height * .6, { button: 'right' }); await tick();
  const after = await page.evaluate(() => ({ ...window.ra2.renderer.camera }));
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 20, 'Radar right-click moves camera');
  assert.deepEqual(await page.evaluate(() => window.ra2.game.getEntity(window.behaviorIds.barracks).rallyPoint), flag.rally, 'Radar click does not issue a world order');
  const manifest = await page.evaluate(() => window.ra2.assets.manifest.sprites);
  for (const [base, layer] of [['gacsph','csph_e.shp'],['gaweth','weth_e.shp'],['nairon','iron_a.shp'],['namisl','misl_e.shp']]) for (const suffix of ['', '-snow']) {
    assert.ok(manifest[base + suffix].originalLayers.some(name => name.endsWith(layer)), base + suffix);
  }
  for (const base of ['gagcan','nasam','naflak','nalasr']) for (const suffix of ['', '-snow']) {
    assert.equal(manifest[base + suffix].facings, 32);
    assert.ok(manifest[base + suffix].originalLayers.some(name => name.endsWith('.vxl')));
  }
  const sortie = await page.evaluate(() => {
    const { game: g, renderer: r } = window.ra2, airport = g.getEntity(window.behaviorIds.airport);
    const f = g.spawnEntity('black_eagle', 0, airport.x, airport.y - .5);
    const target = g.spawnEntity('soviet_battle_lab', 1, airport.x + 9, airport.y + 1);
    target.hp = target.maxHp = 10000;
    g.commandAttack([f.id], target.id); g.paused = false;
    for (let i = 0; i < 400 && f.ammo !== 0; i++) g.step(.05);
    g.paused = true; r.selection = new Set([f.id]); r.center((f.x + target.x) / 2, (f.y + target.y) / 2); r.draw();
    window.fighterId = f.id;
    return { ammo: f.ammo, height: f.flightHeight, shot: g.effects.find(e => e.kind === 'shot' && e.sourceId === f.id) };
  });
  assert.equal(sortie.ammo, 0); assert.equal(sortie.shot.weapon, 'missile'); assert.equal(sortie.height, 150);
  await page.screenshot({ path: `${out}/fighter-missiles.png` });
  await page.evaluate(() => {
    const { game: g, renderer: r } = window.ra2, f = g.getEntity(window.fighterId);
    g.commandStop([f.id]); g.paused = false; for (let i = 0; i < 250; i++) g.step(.05);
    g.paused = true; r.center(f.x, f.y); r.draw();
  });
  assert.equal(await page.evaluate(() => window.ra2.game.getEntity(window.fighterId).flightHeight), 0);
  await page.screenshot({ path: `${out}/returned-fighter.png` });
  assert.deepEqual(errors, []);
  console.log('PASS rally flag and production order, radar right-click, visible disabled limits, building parts, missile sortie and landing');
} catch (error) {
  await page.screenshot({ path: `${out}/browser-failure.png` }); throw error;
} finally { await browser.close(); }
