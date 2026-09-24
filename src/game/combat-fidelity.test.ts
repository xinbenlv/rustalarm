import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameEngine } from './engine';
import { AIRCRAFT_CRUISE_HEIGHT } from './aircraft';
import { PRISM_CHARGE_SECONDS, PRISM_TOWER_HEIGHT } from './prism';
import { formatCountdown } from './support';
import { superweaponTimers } from '../hud/superweapon-timers';
import { projectileFrame } from '../weapon-effects';

function fixture() {
  const game = new GameEngine({ map: { width: 64, height: 64, cells: Array(4096).fill('land'), spawns: [{ x: 5, y: 5 }, { x: 55, y: 55 }] },
    players: [{ id: 0, name: '甲', country: 'america', team: 1, color: '#ffee00' }, { id: 1, name: '乙', country: 'russia', team: 2, color: '#ee0000' }],
    startingUnits: 0, fogOfWar: false });
  game.deploy(game.entities.map(e => e.id));
  game.spawnEntity('nuclear_reactor', 0, 5, 10); game.spawnEntity('nuclear_reactor', 1, 55, 50);
  return game;
}
function advance(game: GameEngine, seconds: number) { for (let i = 0; i < Math.round(seconds * 20); i++) game.step(.05); }

test('光棱塔聚光增加伤害，支援塔不另行开火，存档保留充能', () => {
  const game = fixture(), tower = game.spawnEntity('prism_tower', 0, 20, 20);
  const helper = game.spawnEntity('prism_tower', 0, 16, 20);
  const target = game.spawnEntity('soviet_battle_lab', 1, 27, 20);
  game.commandAttack([tower.id], target.id); advance(game, .1);
  assert.deepEqual(tower.prismCharge?.supportIds, [helper.id]);
  assert.equal(target.hp, target.maxHp);
  const support = game.effects.find(effect => effect.prismSupport)!;
  assert.equal(support.sourceId, helper.id); assert.equal(support.targetId, tower.id);
  assert.equal(support.fromHeight, PRISM_TOWER_HEIGHT); assert.equal(support.color, '#ffee00');
  const restored = GameEngine.fromSnapshot(game.captureSnapshot());
  advance(game, PRISM_CHARGE_SECONDS + .1); advance(restored, PRISM_CHARGE_SECONDS + .1);
  assert.deepEqual(restored.captureSnapshot(), game.captureSnapshot());
  assert.equal(target.maxHp - target.hp, 300);
  assert.ok(helper.cooldown > 0); assert.equal(tower.prismCharge, undefined);
  assert.equal(game.effects.filter(effect => effect.kind === 'shot').length, 1);
});

test('光棱塔限制八座支援塔，并拒绝敌军、冷却和超距支援', () => {
  const game = fixture(), tower = game.spawnEntity('prism_tower', 0, 20, 20);
  game.spawnEntity('nuclear_reactor', 0, 6, 12);
  const enemy = game.spawnEntity('prism_tower', 1, 20, 23); enemy.holdFire = true;
  const far = game.spawnEntity('prism_tower', 0, 10, 20);
  const cooling = game.spawnEntity('prism_tower', 0, 19, 20); cooling.cooldown = 10;
  for (let i = 0; i < 10; i++) game.spawnEntity('prism_tower', 0, 16 + i / 10, 18);
  const target = game.spawnEntity('soviet_battle_lab', 1, 27, 20);
  game.commandAttack([tower.id], target.id); advance(game, .1);
  assert.equal(tower.prismCharge?.supportIds.length, 8);
  for (const id of [enemy.id, far.id, cooling.id]) assert.ok(!tower.prismCharge?.supportIds.includes(id));
});

test('停电或目标消失会取消光棱聚光', () => {
  for (const reason of ['power', 'target']) {
    const game = fixture(), tower = game.spawnEntity('prism_tower', 0, 20, 20);
    game.spawnEntity('prism_tower', 0, 16, 20);
    const target = game.spawnEntity('soviet_battle_lab', 1, 27, 20);
    game.commandAttack([tower.id], target.id); advance(game, .1);
    if (reason === 'power') game.sell(game.ownEntities(0).find(e => e.type === 'nuclear_reactor')!.id);
    else target.hp = 0;
    advance(game, 2);
    assert.equal(tower.prismCharge, undefined);
    assert.equal(game.effects.some(effect => effect.prismSupport), false);
    if (reason === 'power') assert.equal(target.hp, target.maxHp);
  }
});

test('光棱坦克从单位目标分裂光束，建筑目标不分裂', () => {
  for (const type of ['rhino', 'soviet_battle_lab']) {
    const game = fixture(), tank = game.spawnEntity('prism_tank', 0, 20, 20);
    const target = game.spawnEntity(type, 1, 25, 20); target.holdFire = true;
    const neighbor = game.spawnEntity('rhino', 1, 25, 22.5); neighbor.holdFire = true;
    const friend = game.spawnEntity('grizzly', 0, 25, 21); friend.holdFire = true;
    game.commandAttack([tank.id], target.id); advance(game, .1);
    assert.equal(neighbor.maxHp - neighbor.hp, type === 'rhino' ? 30 : 0);
    assert.equal(friend.hp, friend.maxHp);
    assert.equal(game.effects.some(effect => effect.sourceId === tank.id && effect.x === target.x && effect.targetId === neighbor.id), type === 'rhino');
    assert.ok(game.effects.filter(effect => effect.kind === 'shot').every(effect => !effect.prismSupport));
  }
});

test('战机爬升同时加速，巡航高度前不开火，落地后停稳', () => {
  const game = fixture(); game.spawnEntity('airforce_command', 0, 20.5, 20);
  const fighter = game.spawnEntity('harrier', 0, 20.5, 19.5);
  game.commandMove([fighter.id], 50, 20);
  advance(game, .1); const earlySpeed = fighter.flightSpeed!;
  assert.ok(fighter.x > 20.5); assert.ok(fighter.flightHeight! > 0);
  assert.ok(earlySpeed > 0 && earlySpeed < 6);
  advance(game, .4); assert.ok(fighter.flightSpeed! > earlySpeed);
  advance(game, 2.5); assert.ok(fighter.flightHeight! < AIRCRAFT_CRUISE_HEIGHT);
  advance(game, .4); assert.equal(fighter.flightHeight, AIRCRAFT_CRUISE_HEIGHT);
  game.commandStop([fighter.id]); advance(game, 15);
  assert.equal(fighter.flightHeight, 0); assert.equal(fighter.flightSpeed, 0);
});

test('全部玩家公开超级武器倒计时，空降在停电时继续充能', () => {
  const game = fixture();
  game.spawnEntity('weather_control', 0, 12, 15); game.spawnEntity('airforce_command', 0, 12, 20);
  const silo = game.spawnEntity('nuclear_silo', 1, 50, 45);
  const timers = superweaponTimers(game);
  assert.deepEqual(timers.map(timer => [timer.owner, timer.id, timer.color]), [[0, 'lightning', '#ffee00'], [1, 'nuke', '#ee0000']]);
  assert.equal(formatCountdown(timers[0].remaining), '10:00');
  game.sell(game.ownEntities(0).find(e => e.type === 'nuclear_reactor')!.id);
  const before = game.getSupport(0); advance(game, 2);
  const after = game.getSupport(0);
  assert.equal(after.find(a => a.id === 'lightning')!.remaining, before.find(a => a.id === 'lightning')!.remaining);
  assert.ok(after.find(a => a.id === 'paradrop')!.remaining < before.find(a => a.id === 'paradrop')!.remaining);
  game.players[0].abilityCooldowns.paradrop = 0;
  assert.equal(game.getSupport(0).find(a => a.id === 'paradrop')!.ready, true);
  game.sell(silo.id); assert.equal(superweaponTimers(game).length, 1);
  game.players[0].defeated = true; assert.deepEqual(superweaponTimers(game), []);
});

test('倒计时处理分钟边界，导弹帧跟随屏幕朝向', () => {
  assert.deepEqual([0, .1, 59, 60, 61, 600].map(formatCountdown), ['00:00', '00:01', '00:59', '01:00', '01:01', '10:00']);
  const origin = { x: 0, y: 0 };
  assert.deepEqual([{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }].map(p => projectileFrame(origin, p)), [0, 8, 16, 24]);
});
