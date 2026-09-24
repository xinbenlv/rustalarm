/** 浏览器检查公共倒计时、支援指针、聚光和原版导弹。 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const url = process.env.RA2_BROWSER_URL || 'http://127.0.0.1:4259/';
const out = '.cache/combat-fidelity';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(30000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
const refresh = () => page.waitForTimeout(300);
try {
  await page.goto(url); await page.getByTestId('mode-skirmish').click();
  await page.locator('#start').waitFor({ timeout: 60000 });
  await page.locator('#music').uncheck();
  await page.locator('[data-slot="0"][data-key="country"]').selectOption('america');
  await page.locator('#start').click(); await page.locator('#battlefield-canvas').waitFor();
  await page.evaluate(() => {
    const { game: g, renderer: r } = window.ra2;
    g.paused = true; g.players.forEach(p => p.ai = false); g.setDebugMapReveal(true);
    g.deploy(g.entities.filter(e => e.type.includes('mcv')).map(e => e.id));
    const o = g.players[0].spawn;
    g.spawnEntity('nuclear_reactor', 0, o.x - 4, o.y + 1);
    const airport = g.spawnEntity('airforce_command', 0, o.x + 5.5, o.y + 5);
    g.spawnEntity('chronosphere', 0, o.x + 3, o.y - 6);
    g.spawnEntity('weather_control', 0, o.x + 9, o.y - 4);
    const enemy = g.players[1].spawn;
    g.spawnEntity('nuclear_reactor', 1, enemy.x - 4, enemy.y);
    g.spawnEntity('nuclear_silo', 1, enemy.x + 4, enemy.y);
    g.players[0].abilityCooldowns = { paradrop: 180, chronosphere: 61, lightning: 600 };
    g.players[1].abilityCooldowns.nuke = 59;
    window.combatIds = { airport: airport.id, origin: o };
    r.center(o.x + 4, o.y); r.zoom = 1.3; r.draw();
  }); await refresh();
  await page.locator('[data-category="defense"]').click(); await refresh();
  const drop = page.locator('[data-support="paradrop"]');
  assert.match(await drop.locator('img').getAttribute('src'), /\/apar\.png$/);
  const clock = drop.locator('.progress-mask');
  assert.equal(await clock.isVisible(), true);
  const before = Number(await clock.getAttribute('data-frame'));
  await page.evaluate(() => window.ra2.game.players[0].abilityCooldowns.paradrop = 120); await refresh();
  assert.ok(Number(await clock.getAttribute('data-frame')) > before);
  assert.equal(await drop.evaluate(el => getComputedStyle(el).filter), 'none');
  const timers = page.locator('#superweapon-timers');
  assert.equal(await timers.locator('[data-timer]').count(), 3);
  assert.match(await timers.textContent(), /01:01/); assert.match(await timers.textContent(), /00:59/);
  const colors = await timers.locator('[data-timer]').evaluateAll(nodes => nodes.map(n => n.style.color));
  assert.equal(colors[0], colors[1]); assert.notEqual(colors[0], colors[2]);
  const rect = await timers.boundingBox(), field = await page.locator('#battlefield').boundingBox();
  assert.ok(rect.x + rect.width >= field.x + field.width - 10);
  assert.ok(rect.y + rect.height >= field.y + field.height - 25);
  await page.evaluate(() => {
    const g = window.ra2.game;
    g.setDebugMapReveal(false); g.players[0].fog.fill(0); g.players[0].explored.fill(0);
  }); await refresh();
  assert.equal(await timers.locator('[data-timer="1:nuke"]').count(), 1);
  await page.evaluate(() => window.ra2.game.setDebugMapReveal(true));
  await page.mouse.move(500, 100); await refresh();
  await page.screenshot({ path: `${out}/timers-and-cameos.png` });
  await page.evaluate(() => window.ra2.game.players[0].abilityCooldowns.paradrop = 0); await refresh();
  assert.equal(await clock.isVisible(), false); assert.equal(await drop.getAttribute('aria-disabled'), 'false');
  await drop.click(); assert.equal(await page.evaluate(() => window.ra2.renderer.tool), 'support');
  await page.keyboard.press('Escape'); await page.mouse.move(500, 100);
  await page.evaluate(() => {
    const { game: g, renderer: r } = window.ra2, o = window.combatIds.origin;
    g.entities.forEach(e => e.holdFire = true);
    const tower = g.spawnEntity('prism_tower', 0, o.x + 5, o.y + 12);
    const helper = g.spawnEntity('prism_tower', 0, o.x + 1, o.y + 12);
    const target = g.spawnEntity('soviet_battle_lab', 1, o.x + 12, o.y + 12);
    target.hp = target.maxHp = 10000;
    g.commandAttack([tower.id], target.id); g.paused = false; g.step(.8); g.paused = true;
    r.center(tower.x + 2, tower.y); r.zoom = 1.5; r.draw();
    window.combatIds.tower = tower.id; window.combatIds.target = target.id;
    window.combatIds.helper = helper.id;
  }); await refresh();
  const charge = await page.evaluate(() => window.ra2.game.getEntity(window.combatIds.tower).prismCharge);
  assert.equal(charge.supportIds.length, 1);
  await page.screenshot({ path: `${out}/prism-support.png` });
  await page.evaluate(() => { const g = window.ra2.game; g.paused = false; g.step(1.25); g.paused = true; window.ra2.renderer.draw(); });
  assert.equal(await page.evaluate(() => { const g = window.ra2.game, t = g.getEntity(window.combatIds.target); return t.maxHp - t.hp; }), 300);
  await page.screenshot({ path: `${out}/prism-attack.png` });
  await page.evaluate(() => {
    const { game: g, renderer: r } = window.ra2, airport = g.getEntity(window.combatIds.airport);
    g.commandStop([window.combatIds.tower]); g.getEntity(window.combatIds.tower).holdFire = true;
    g.getEntity(window.combatIds.helper).holdFire = true;
    const fighter = g.spawnEntity('harrier', 0, airport.x, airport.y - .5);
    const point = [{ x: airport.x + 9, y: airport.y + 1 }, { x: airport.x - 9, y: airport.y - 1 }, g.getEntity(window.combatIds.target)]
      .find(point => g.visible(0, point.x, point.y));
    if (!point) throw new Error('浏览器夹具没有可见的战机目标位置');
    const target = g.spawnEntity('soviet_battle_lab', 1, point.x, point.y);
    target.hp = target.maxHp = 10000;
    g.commandAttack([fighter.id], target.id); g.paused = false;
    for (let i = 0; i < 200 && fighter.ammo; i++) g.step(.05);
    g.step(.2); g.paused = true;
    window.combatIds.fighter = fighter.id;
    r.center(fighter.x, fighter.y - 2); r.zoom = 1.7; r.draw();
  }); await refresh();
  const shots = await page.evaluate(() => window.ra2.game.effects.filter(e => e.sourceId === window.combatIds.fighter && e.kind === 'shot'));
  if (shots.length !== 2) console.log(await page.evaluate(() => ({ fighter: window.ra2.game.getEntity(window.combatIds.fighter), status: window.ra2.game.status, effects: window.ra2.game.effects })));
  assert.equal(shots.length, 2); assert.ok(shots.every(e => e.projectileSprite === 'dragon' && e.fromHeight === 150));
  await page.screenshot({ path: `${out}/fighter-missiles.png` });
  await page.setViewportSize({ width: 800, height: 600 }); await refresh();
  const narrow = await timers.boundingBox(); assert.ok(narrow.x >= 0 && narrow.x + narrow.width < 640);
  await page.screenshot({ path: `${out}/narrow-timers.png` });
  await page.evaluate(() => {
    const g = window.ra2.game;
    while (g.players.length < 8) {
      const p = structuredClone(g.players[0]); p.id = g.players.length; p.name = `Player ${p.id}`;
      p.abilityCooldowns = {}; g.players.push(p);
    }
    for (const p of g.players) for (const type of ['chronosphere', 'weather_control', 'nuclear_silo', 'iron_curtain']) {
      if (!g.ownEntities(p.id).some(e => e.type === type)) g.spawnEntity(type, p.id, 20 + p.id * 3, 20);
    }
  }); await refresh();
  assert.equal(await timers.locator('[data-timer]').count(), 32);
  const fits = await timers.locator('[data-timer]').evaluateAll(nodes => nodes.every(node => {
    const rect = node.getBoundingClientRect(), field = document.querySelector('#battlefield').getBoundingClientRect();
    return rect.x >= field.x && rect.y >= field.y && rect.right <= field.right && rect.bottom <= field.bottom;
  }));
  assert.equal(fits, true); await page.screenshot({ path: `${out}/eight-player-timers.png` });
  assert.deepEqual(errors, []);
  console.log('PASS 公共倒计时、玩家颜色、迷雾可见性、支援图标、旋转指针、聚光伤害、原版导弹和窄屏布局');
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` }); throw error;
} finally { await browser.close(); }
