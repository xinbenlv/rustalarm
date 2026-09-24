import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameEngine } from './engine';
import { CATALOG } from './data';
import { stringifySaveData } from './snapshot';
import { aircraftIsDocked, aircraftPads, AIRCRAFT_CRUISE_HEIGHT } from './aircraft';
import type { Terrain } from './types';

function fixture(water = false) {
  const cells: Terrain[] = Array(64 * 64).fill('land');
  if (water) for (let y = 18; y < 45; y++) for (let x = 10; x < 50; x++) cells[y * 64 + x] = 'water';
  const g = new GameEngine({ map: { width: 64, height: 64, cells, spawns: [{ x: 6, y: 6 }, { x: 56, y: 56 }] }, players: [
    { id: 0, name: 'A', country: 'korea', team: 0 }, { id: 1, name: 'B', country: 'russia', team: 0 },
  ], startingUnits: 0, startingCredits: 100000, fogOfWar: false });
  g.deploy(g.entities.filter(e => e.type.includes('mcv')).map(e => e.id));
  g.spawnEntity('power_plant', 0, 12, 6);
  return g;
}
function advance(g: GameEngine, seconds: number) { for (let i = 0; i < Math.round(seconds * 20); i++) g.step(.05); }
function until(g: GameEngine, done: () => boolean, seconds = 40) {
  for (let i = 0; i < seconds * 20 && !done(); i++) g.step(.05);
  assert.ok(done(), `Condition did not complete by ${g.time.toFixed(2)}s`);
}

test('fighters complete a missile sortie, return to their reserved pad, land, reload and resume', () => {
  const g = fixture(), airport = g.spawnEntity('airforce_command', 0, 20.5, 20);
  const fighter = g.spawnEntity('harrier', 0, 20.5, 19.5);
  const target = g.spawnEntity('soviet_battle_lab', 1, 34.5, 20.5);
  target.hp = target.maxHp = 10000;
  g.commandAttack([fighter.id], target.id);
  advance(g, .5); assert.ok(fighter.flightHeight! > 0); assert.equal(fighter.lastShot, -10);
  until(g, () => fighter.ammo === 0);
  const shot = g.effects.find(e => e.kind === 'shot' && e.sourceId === fighter.id)!;
  assert.equal(shot.weapon, 'missile'); assert.equal(shot.burst, 1); assert.equal(shot.fromHeight, AIRCRAFT_CRUISE_HEIGHT);
  const missiles = g.effects.filter(e => e.kind === 'shot' && e.sourceId === fighter.id);
  assert.equal(missiles.length, 2); assert.equal(missiles[1].delay, .2);
  assert.ok(missiles.every(missile => missile.projectileSprite === 'dragon'));
  assert.equal(target.hp, target.maxHp, 'Damage waits for missile arrival');
  assert.equal(fighter.homeAirfieldId, airport.id);
  const firstShot = fighter.lastShot;
  const restored = GameEngine.fromSnapshot(JSON.parse(stringifySaveData(g.captureSnapshot())));
  advance(g, 1); advance(restored, 1);
  assert.deepEqual(restored.captureSnapshot(), g.captureSnapshot(), 'An in-flight missile survives a save');
  assert.ok(target.hp < target.maxHp);
  until(g, () => aircraftIsDocked(fighter, g.entities));
  assert.deepEqual({ x: fighter.x, y: fighter.y }, aircraftPads(airport)[fighter.aircraftPadIndex!]);
  assert.equal(fighter.lastShot, firstShot); assert.equal(fighter.ammo, 0);
  advance(g, 10); assert.equal(fighter.ammo, 0); assert.equal(fighter.flightHeight, 0);
  until(g, () => fighter.lastShot > firstShot);
  assert.ok(fighter.lastShot - firstShot >= 18);
  g.commandStop([fighter.id]); until(g, () => aircraftIsDocked(fighter, g.entities));
  const last = fighter.lastShot; advance(g, 25);
  assert.equal(fighter.lastShot, last, 'An idle fighter must not acquire nearby enemies');
  assert.equal(fighter.flightHeight, 0); assert.equal(fighter.ammo, 1);
});

test('move orders and vanished targets return fighters home; airport loss reassigns free pads', () => {
  const g = fixture(), home = g.spawnEntity('airforce_command', 0, 20.5, 20);
  const fighters = aircraftPads(home).map(p => g.spawnEntity('harrier', 0, p.x, p.y));
  g.commandMove(fighters.map(e => e.id), 35.5, 25.5); advance(g, 2);
  assert.ok(fighters.every(e => e.flightHeight! > 0 && e.flightHeight! < AIRCRAFT_CRUISE_HEIGHT));
  until(g, () => fighters.every(e => aircraftIsDocked(e, g.entities)));
  assert.equal(new Set(fighters.map(e => e.aircraftPadIndex)).size, 4);
  const target = g.spawnEntity('rhino', 1, 40.5, 20.5); target.holdFire = true;
  g.commandAttack([fighters[0].id], target.id); advance(g, 2); target.hp = 0;
  until(g, () => aircraftIsDocked(fighters[0], g.entities));
  const backup = g.spawnEntity('airforce_command', 0, 30.5, 32);
  assert.ok(g.sell(home.id));
  until(g, () => fighters.every(e => e.homeAirfieldId === backup.id && aircraftIsDocked(e, g.entities)));
  assert.equal(new Set(fighters.map(e => e.aircraftPadIndex)).size, 4);
});

test('infantry, vehicle and naval factories send produced units to persistent rally points', () => {
  const g = fixture(true);
  const factories = [g.spawnEntity('barracks', 0, 15.5, 10), g.spawnEntity('war_factory', 0, 25.5, 10), g.spawnEntity('naval_yard', 0, 15.5, 25.5)];
  const points = [{ x: 17.5, y: 15.5 }, { x: 29.5, y: 15.5 }, { x: 30.5, y: 32.5 }];
  for (let i = 0; i < factories.length; i++) assert.ok(g.setRallyPoint([factories[i].id], points[i].x, points[i].y));
  const plant = g.ownEntities(0).find(e => e.type === 'power_plant')!;
  assert.equal(g.setRallyPoint([plant.id], 20, 20), false);
  assert.equal(g.setRallyPoint([factories[0].id], -1, 0), false);
  assert.equal(g.setRallyPoint([factories[0].id], NaN, 0), false);
  const restored = GameEngine.fromSnapshot(g.captureSnapshot());
  restored.setDebugInstantProduction(true);
  for (const [i, type] of ['gi', 'grizzly', 'destroyer'].entries()) {
    assert.ok(restored.build(0, type), restored.lastMessage);
    const unit = restored.ownEntities(0).find(e => e.type === type)!;
    assert.deepEqual(unit.order, { kind: 'move', ...points[i] });
    until(restored, () => unit.order.kind === 'idle');
    assert.ok(Math.hypot(unit.x - points[i].x, unit.y - points[i].y) < .5);
  }
});

test('Tanya remains available at the living and queued limit and unlocks after loss', () => {
  const g = fixture(); g.spawnEntity('barracks', 0, 15, 10); g.spawnEntity('battle_lab', 0, 25, 10);
  assert.ok(g.build(0, 'tanya')); assert.equal(g.build(0, 'tanya'), false);
  assert.equal(g.getBuildReason(0, 'tanya'), '已达到建造上限');
  assert.ok(g.getAvailable(0).some(d => d.id === 'tanya'));
  assert.ok(g.cancelBuild(0, 'infantry')); assert.ok(g.canBuild(0, 'tanya'));
  g.setDebugInstantProduction(true); assert.ok(g.build(0, 'tanya'));
  assert.equal(g.canBuild(0, 'tanya'), false);
  g.ownEntities(0).find(e => e.type === 'tanya')!.hp = 0;
  assert.equal(g.canBuild(0, 'tanya'), true);
});

test('primary factory switching uses the selected factory rally and survives saves', () => {
  const g = fixture(), first = g.spawnEntity('barracks', 0, 15.5, 10), second = g.spawnEntity('barracks', 0, 35.5, 10);
  g.setRallyPoint([first.id], 17.5, 15.5); g.setRallyPoint([second.id], 39.5, 15.5);
  assert.ok(g.setPrimaryFactory(second.id));
  const restored = GameEngine.fromSnapshot(g.captureSnapshot()); restored.setDebugInstantProduction(true);
  assert.ok(restored.build(0, 'gi'));
  const gi = restored.ownEntities(0).find(e => e.type === 'gi')!;
  assert.ok(gi.x > 35); assert.deepEqual(gi.order, { kind: 'move', x: 39.5, y: 15.5 });
  assert.ok(restored.sell(second.id)); assert.ok(restored.build(0, 'gi'));
  assert.deepEqual(restored.ownEntities(0).filter(e => e.type === 'gi').at(-1)!.order, { kind: 'move', x: 17.5, y: 15.5 });
});

test('Kirov flies over its target and drops a delayed bomb instead of firing a tracer', () => {
  const g = fixture(), kirov = g.spawnEntity('kirov', 0, 22.5, 25.5), target = g.spawnEntity('rhino', 1, 27.5, 25.5);
  target.holdFire = true; g.commandAttack([kirov.id], target.id);
  advance(g, 1); assert.equal(target.hp, target.maxHp); assert.equal(kirov.lastShot, -10);
  until(g, () => kirov.lastShot > 0);
  assert.ok(Math.hypot(kirov.x - target.x, kirov.y - target.y) < .4);
  assert.equal(target.hp, target.maxHp);
  const bomb = g.effects.find(e => e.sourceId === kirov.id && e.kind === 'shot')!;
  assert.equal(bomb.weapon, 'bomb'); assert.equal(bomb.fromHeight, 45);
  advance(g, 1); assert.ok(target.hp < target.maxHp);
});

test('ground guns cannot hit airborne fighters; AA cannot hit parked fighters', () => {
  const g = fixture(); g.spawnEntity('airforce_command', 1, 25.5, 25);
  const plane = g.spawnEntity('harrier', 1, 25.5, 24.5);
  const aa = g.spawnEntity('aegis', 0, 23.5, 24.5), tank = g.spawnEntity('grizzly', 0, 23.5, 26.5);
  aa.holdFire = tank.holdFire = true;
  g.commandAttack([aa.id], plane.id); advance(g, .1); assert.equal(aa.lastShot, -10);
  g.commandAttack([tank.id], plane.id); advance(g, .1); assert.ok(tank.lastShot > 0);
  tank.cooldown = 0; g.commandMove([plane.id], 28.5, 25.5); advance(g, .2);
  const last = tank.lastShot; advance(g, .2); assert.equal(tank.lastShot, last);
  assert.ok(aa.lastShot > 0);
});

test('naval weapons and anti-air roles match their targets', () => {
  const g = fixture(true);
  const ship = g.spawnEntity('destroyer', 0, 20.5, 25.5), plane = g.spawnEntity('rocketeer', 1, 21.5, 25.5);
  plane.holdFire = true; g.commandAttack([ship.id], plane.id); advance(g, .2);
  assert.equal(ship.lastShot, -10, 'Destroyers have no anti-air gun');
  const sub = g.spawnEntity('submarine', 1, 23.5, 25.5); sub.holdFire = true;
  g.commandAttack([ship.id], sub.id); advance(g, .1);
  assert.equal(g.effects.find(e => e.sourceId === ship.id && e.kind === 'shot')?.weapon, 'carrier');
  const apoc = g.spawnEntity('apocalypse', 0, 21, 15); g.commandAttack([apoc.id], plane.id);
  assert.equal(g.getCombatDefinition(apoc, plane).weapon, 'missile');
  assert.equal(g.getCombatDefinition(apoc, sub).weapon, 'shell');
  for (const [type, weapon] of Object.entries({ submarine: 'torpedo', dolphin: 'sonic', giant_squid: 'melee', carrier: 'carrier', flak_track: 'flak', prism_tank: 'prism', allied_dog: 'melee' })) assert.equal(CATALOG[type].weapon, weapon);
});

test('Tanya swims and uses close-range C4; chrono infantry teleport with a recovery delay', () => {
  const g = fixture(true), tanya = g.spawnEntity('tanya', 0, 20.5, 16.5);
  g.commandMove([tanya.id], 20.5, 22.5); advance(g, 3);
  assert.equal(g.terrainAt(tanya.x, tanya.y), 'water');
  const ship = g.spawnEntity('submarine', 1, 25.5, 22.5); ship.holdFire = true;
  g.commandAttack([tanya.id], ship.id); advance(g, .1); assert.equal(ship.hp, ship.maxHp);
  until(g, () => !g.getEntity(ship.id));
  const chrono = g.spawnEntity('chrono_legionnaire', 0, 5.5, 25.5);
  g.commandMove([chrono.id], 55.5, 25.5); advance(g, .05);
  assert.equal(chrono.x, 55.5); assert.ok(chrono.chronoReadyAt! > g.time);
  g.commandMove([chrono.id], 55.5, 30.5); advance(g, 1); assert.equal(chrono.y, 25.5);
  until(g, () => chrono.y === 30.5);
});

test('Nighthawk lands before unloading and does not require an airport', () => {
  const g = fixture(), heli = g.spawnEntity('nighthawk', 0, 20.5, 20.5), gi = g.spawnEntity('gi', 0, 21.5, 20.5);
  assert.equal(g.load([gi.id], heli.id), 1);
  g.commandMove([heli.id], 28.5, 20.5); advance(g, 2);
  assert.equal(heli.flightHeight, 45); assert.equal(g.unload([heli.id]), 0);
  until(g, () => !gi.transportedBy);
  assert.equal(heli.flightHeight, 0); assert.equal(heli.homeAirfieldId, undefined);
});
