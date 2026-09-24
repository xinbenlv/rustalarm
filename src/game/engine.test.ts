import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG, COUNTRIES } from './data';
import { GameEngine } from './engine';
import { findPath } from './pathfinding';
import type { Entity, GameMap, Terrain } from './types';

function battlefield(): GameMap {
  const cells: Terrain[] = Array(64 * 64).fill('land');
  for (let y = 13; y <= 17; y++) for (let x = 17; x <= 21; x++) cells[y * 64 + x] = 'ore';
  for (let y = 44; y <= 48; y++) for (let x = 44; x <= 48; x++) cells[y * 64 + x] = 'ore';
  return { width: 64, height: 64, spawns: [{ x: 12, y: 12 }, { x: 51, y: 51 }], cells };
}
function game(options: Partial<ConstructorParameters<typeof GameEngine>[0]> = {}) {
  return new GameEngine({ map: battlefield(), players: [{ id: 0, name: 'Player', country: 'america', team: 0 }, { id: 1, name: 'CPU', country: 'russia', team: 0 }], startingCredits: 20000, startingUnits: 0, fogOfWar: false, ...options });
}
function advance(engine: GameEngine, seconds: number) { for (let i = 0; i < seconds * 10; i++) engine.step(.1); }
function deploy(engine: GameEngine) { engine.deploy(engine.entities.filter(e => e.type.includes('mcv')).map(e => e.id)); }
function finishBuilding(engine: GameEngine, type: string, x: number, y: number) {
  assert.ok(engine.build(0, type), `${type}: ${engine.lastMessage}`);
  advance(engine, CATALOG[type].buildTime + 1);
  assert.ok(engine.place(0, type, x, y), `${type} place: ${engine.lastMessage}`);
  return engine.entities.find(e => e.type === type && e.owner === 0)!;
}

test('all nine original RA2 countries and their national units are available', () => {
  assert.equal(COUNTRIES.length, 9);
  assert.deepEqual(new Set(COUNTRIES.map(c => c.faction)), new Set(['allied', 'soviet']));
  assert.ok(Object.values(CATALOG).some(d => d.country === 'libya'));
  assert.ok(!COUNTRIES.some(c => (c.id as string) === 'yuri'));
});

test('deployment, technology prerequisites, paid construction, placement, and unit production', () => {
  const engine = game();
  assert.equal(engine.canBuild(0, 'power_plant'), false);
  deploy(engine);
  assert.ok(engine.entities.some(e => e.type === 'construction_yard'));
  assert.equal(engine.canBuild(0, 'power_plant'), true);
  assert.equal(engine.canBuild(0, 'war_factory'), false);
  const before = engine.getPlayer(0)!.credits;
  finishBuilding(engine, 'power_plant', 17, 10);
  assert.equal(engine.getPlayer(0)!.credits, before - CATALOG.power_plant.cost);
  assert.equal(engine.canPlace(0, 'barracks', 12, 12), false, 'existing buildings block placement');
  finishBuilding(engine, 'barracks', 18, 6);
  assert.ok(engine.build(0, 'gi'));
  advance(engine, CATALOG.gi.buildTime + 1);
  assert.ok(engine.entities.some(e => e.type === 'gi' && e.owner === 0));
  assert.equal(engine.getPlayer(0)!.queues.infantry.length, 0);
});

test('four aircraft slots per airfield count flying aircraft and the paid queue', () => {
  const engine = game({ startingCredits: 50000 }); deploy(engine);
  engine.spawnEntity('power_plant', 0, 18, 12);
  engine.spawnEntity('airforce_command', 0, 25.5, 25);
  for (let i = 0; i < 4; i++) assert.ok(engine.build(0, 'harrier'));
  const credits = engine.getPlayer(0)!.credits;
  assert.equal(engine.build(0, 'harrier'), false);
  assert.equal(engine.getBuildReason(0, 'harrier'), '飞机名额已满');
  assert.equal(engine.getPlayer(0)!.credits, credits);
  assert.ok(engine.cancelBuild(0, 'aircraft'));
  assert.ok(engine.build(0, 'harrier'));
  engine.setDebugInstantProduction(true);
  const fighters = engine.ownEntities(0).filter(e => e.type === 'harrier');
  assert.deepEqual(fighters.map(e => ({ x: e.x, y: e.y })), [
    { x: 25.5, y: 24.5 }, { x: 25.5, y: 25.5 },
    { x: 26.5, y: 24.5 }, { x: 26.5, y: 25.5 },
  ]);
  for (const fighter of fighters) assert.equal(fighter.order.kind, 'idle');
  engine.commandMove(fighters.map(e => e.id), 12, 32);
  advance(engine, 4);
  assert.ok(fighters.every(e => e.x < 20));
  assert.equal(engine.canBuild(0, 'harrier'), false, 'Takeoff keeps all four slots occupied');
  const restored = GameEngine.fromSnapshot(engine.captureSnapshot());
  assert.equal(restored.canBuild(0, 'harrier'), false, 'Save restoration retains flying aircraft capacity');
  engine.spawnEntity('airforce_command', 1, 40.5, 30);
  assert.equal(engine.canBuild(0, 'harrier'), false, 'Enemy airports do not add capacity');
  const second = engine.spawnEntity('airforce_command', 0, 34.5, 25);
  assert.deepEqual(engine.aircraftCapacity(0), { capacity: 8, used: 4 });
  for (let i = 0; i < 4; i++) assert.ok(engine.build(0, 'harrier'));
  assert.equal(engine.canBuild(0, 'harrier'), false);
  fighters[0].hp = 0;
  assert.equal(engine.canBuild(0, 'harrier'), true, 'Aircraft loss frees a slot');
  assert.ok(engine.sell(second.id));
  assert.equal(engine.canBuild(0, 'harrier'), false, 'Selling an airport removes four slots');
});

test('mixed fighters share capacity and queued aircraft wait after an airfield loss', () => {
  const engine = game({ startingCredits: 50000, players: [
    { id: 0, name: 'Player', country: 'korea', team: 0 },
    { id: 1, name: 'CPU', country: 'russia', team: 0 },
  ] }); deploy(engine);
  engine.spawnEntity('airforce_command', 0, 25.5, 25);
  const second = engine.spawnEntity('airforce_command', 0, 34.5, 25);
  engine.setDebugInstantProduction(true);
  for (const type of ['harrier', 'black_eagle', 'harrier', 'black_eagle']) assert.ok(engine.build(0, type));
  engine.commandMove(engine.ownEntities(0).filter(e => e.type === 'harrier' || e.type === 'black_eagle').map(e => e.id), 12, 32);
  advance(engine, 4);
  engine.setDebugInstantProduction(false);
  assert.ok(engine.build(0, 'black_eagle'));
  second.hp = 0;
  engine.setDebugInstantProduction(true);
  advance(engine, 1);
  assert.equal(engine.aircraftCapacity(0).used, 4);
  assert.equal(engine.getPlayer(0)!.queues.aircraft.length, 1);
  const fighter = engine.ownEntities(0).find(e => e.type === 'harrier')!;
  fighter.hp = 0;
  advance(engine, 1);
  assert.equal(engine.aircraftCapacity(0).used, 4);
  assert.equal(engine.getPlayer(0)!.queues.aircraft.length, 0);
});

test('canceling a queued item refunds exactly its paid cost', () => {
  const engine = game(); deploy(engine);
  const before = engine.getPlayer(0)!.credits;
  assert.ok(engine.build(0, 'power_plant'));
  advance(engine, 2);
  assert.ok(engine.cancelBuild(0, 'structure'));
  assert.equal(engine.getPlayer(0)!.credits, before);
  assert.equal(engine.getPlayer(0)!.queues.structure.length, 0);
});

test('ordinary buildings remain available for repeated placement', () => {
  const engine = game(); deploy(engine);
  engine.setDebugInstantProduction(true);
  for (const [type, x, y] of [
    ['power_plant', 17, 10], ['power_plant', 20, 10],
    ['barracks', 18, 6], ['pillbox', 22, 9], ['pillbox', 22, 11],
  ] as const) {
    assert.ok(engine.build(0, type), type);
    assert.ok(engine.place(0, type, x, y), engine.lastMessage);
    assert.equal(engine.canBuild(0, type), true);
    assert.ok(engine.getAvailable(0).some(d => d.id === type));
  }
  assert.equal(engine.ownEntities(0).filter(e => e.type === 'power_plant').length, 2);
  assert.equal(engine.ownEntities(0).filter(e => e.type === 'pillbox').length, 2);
});

for (const [country, tech, types] of [
  ['america', 'battle_lab', ['chronosphere', 'weather_control']],
  ['russia', 'soviet_battle_lab', ['iron_curtain', 'nuclear_silo']],
] as const) test(`${country} superweapons retain a one-building limit and allow rebuilding`, () => {
  const engine = game({ players: [{ id: 0, name: 'Player', country, team: 0 }] }); deploy(engine);
  engine.spawnEntity(tech, 0, 17, 12);
  engine.setDebugInstantProduction(true);
  for (const type of types) {
    assert.ok(engine.build(0, type));
    assert.ok(engine.place(0, type, 22, 12), engine.lastMessage);
    assert.equal(engine.canBuild(0, type), false);
    assert.equal(engine.getAvailable(0).some(d => d.id === type), true);
    assert.equal(engine.build(0, type), false);
    assert.equal(engine.getPlacementReason(0, type, 28, 12), '已达到建造上限');
    assert.ok(engine.sell(engine.ownEntities(0).find(e => e.type === type)!.id));
    assert.equal(engine.canBuild(0, type), true);
  }
});

test('a placed weather controller charges its support and pauses without power', () => {
  const engine = game({ startingCredits: 50000 }); deploy(engine);
  const plants = [engine.spawnEntity('power_plant', 0, 6, 8), engine.spawnEntity('power_plant', 0, 9, 8)];
  engine.spawnEntity('battle_lab', 0, 17, 12);
  engine.setDebugInstantProduction(true);
  assert.ok(engine.build(0, 'weather_control'));
  assert.ok(engine.place(0, 'weather_control', 22, 12), engine.lastMessage);
  const support = () => engine.getSupport(0).find(ability => ability.id === 'lightning')!;
  assert.equal(support().total, 600);
  assert.equal(support().remaining, 600);
  assert.equal(support().ready, false);
  advance(engine, 1);
  assert.ok(support().remaining < 600);
  const remaining = support().remaining;
  for (const plant of plants) assert.ok(engine.sell(plant.id));
  advance(engine, 1);
  assert.equal(support().remaining, remaining);
  assert.equal(support().ready, false);
  engine.spawnEntity('power_plant', 0, 6, 8);
  engine.spawnEntity('power_plant', 0, 9, 8);
  advance(engine, 600);
  assert.equal(support().remaining, 0);
  assert.equal(support().ready, true);
});

test('a second airfield preserves the active paradrop countdown', () => {
  const engine = game(); deploy(engine);
  engine.spawnEntity('refinery', 0, 17, 12);
  engine.setDebugInstantProduction(true);
  assert.ok(engine.build(0, 'airforce_command'));
  assert.ok(engine.place(0, 'airforce_command', 22, 12));
  engine.getPlayer(0)!.abilityCooldowns.paradrop = 12;
  assert.ok(engine.build(0, 'airforce_command'));
  assert.ok(engine.place(0, 'airforce_command', 26, 12));
  assert.equal(engine.getPlayer(0)!.abilityCooldowns.paradrop, 12);
  assert.equal(engine.aircraftCapacity(0).capacity, 8);
});

test('debug credits can be added and removed independently for each side', () => {
  const engine = game({ localPlayerId: 1 });
  engine.grantDebugCredits(); engine.grantDebugCredits();
  assert.equal(engine.getPlayer(1)!.credits, 40000);
  assert.equal(engine.getPlayer(0)!.credits, 20000);
  engine.deductDebugCredits(1);
  engine.adjustDebugCredits(-50000, 0);
  assert.equal(engine.getPlayer(1)!.credits, 30000);
  assert.equal(engine.getPlayer(0)!.credits, 0);
  engine.status = 'defeat'; engine.grantDebugCredits();
  assert.equal(engine.getPlayer(1)!.credits, 30000);
});

test('debug reveal survives fog updates and can target friendly and enemy players independently', () => {
  const engine = game({ fogOfWar: true, localPlayerId: 1 });
  assert.equal(engine.visible(1, 30, 30), false);
  assert.equal(engine.explored(1, 30, 30), false);
  engine.debugRevealMap = true;
  advance(engine, 1);
  assert.equal(engine.visible(1, 30, 30), true);
  assert.equal(engine.explored(1, 30, 30), true);
  assert.equal(engine.visible(0, 30, 30), false);
  assert.equal(engine.explored(0, 30, 30), false);
  engine.setDebugMapReveal(true, 0);
  assert.equal(engine.visible(0, 30, 30), true);
  assert.equal(engine.explored(0, 30, 30), true);
  assert.equal(engine.visible(1, -1, 0), false);
  engine.debugRevealMap = false;
  assert.equal(engine.visible(1, 30, 30), false);
  assert.equal(engine.explored(1, 30, 30), false);
  assert.equal(engine.visible(0, 30, 30), true);
  engine.setDebugMapReveal(false, 0);
  assert.equal(game().debugRevealMap, false);
});

test('instant production completes paid queues and recruitment without bypassing costs or prerequisites', () => {
  const engine = game(); deploy(engine);
  assert.ok(engine.build(0, 'power_plant'));
  assert.ok(engine.build(1, 'tesla_reactor'));
  const paidCredits = engine.getPlayer(0)!.credits;
  engine.setDebugInstantProduction(true);
  assert.equal(engine.getPlayer(0)!.queues.structure[0].ready, true);
  assert.equal(engine.getPlayer(0)!.credits, paidCredits);
  assert.equal(engine.getPlayer(1)!.queues.structure[0].ready, false);
  engine.setDebugInstantProduction(true, 1);
  assert.equal(engine.getPlayer(1)!.queues.structure[0].ready, true);
  engine.setDebugInstantProduction(false, 1);
  assert.equal(engine.build(0, 'war_factory'), false);
  assert.equal(engine.canPlace(0, 'power_plant', 12, 12), false);
  assert.ok(engine.place(0, 'power_plant', 17, 10));
  assert.ok(engine.build(0, 'barracks'));
  assert.ok(engine.place(0, 'barracks', 18, 6));
  const before = engine.getPlayer(0)!.credits;
  assert.ok(engine.build(0, 'gi'));
  assert.equal(engine.getPlayer(0)!.credits, before - CATALOG.gi.cost);
  assert.equal(engine.entities.filter(e => e.type === 'gi').length, 1);
  engine.setDebugInstantProduction(false);
  assert.ok(engine.build(0, 'gi')); assert.ok(engine.build(0, 'gi'));
  assert.equal(engine.getPlayer(0)!.queues.infantry.length, 2);
  engine.setDebugInstantProduction(true);
  assert.equal(engine.getPlayer(0)!.queues.infantry.length, 0);
  assert.equal(engine.entities.filter(e => e.type === 'gi').length, 3);
  engine.getPlayer(0)!.credits = 0;
  assert.equal(engine.build(0, 'gi'), false);
  assert.equal(game().debugInstantProduction, false);
});

test('refinery grants a miner that harvests ore and delivers real income', () => {
  const engine = game(); deploy(engine);
  finishBuilding(engine, 'power_plant', 17, 10);
  finishBuilding(engine, 'refinery', 20, 15);
  assert.ok(engine.entities.some(e => e.type === 'chrono_miner'));
  const credits = engine.getPlayer(0)!.credits;
  advance(engine, 45);
  assert.ok(engine.getPlayer(0)!.credits > credits, `miner delivered no income; entities ${JSON.stringify(engine.entities.filter(e => CATALOG[e.type].harvest))}`);
  assert.ok(engine.ore.some((value, i) => engine.map.cells[i] === 'ore' && value < 5000));
});

test('ground movement routes around water; aircraft cross it; transports carry and unload', () => {
  const map = battlefield(); const cells = [...map.cells];
  for (let y = 0; y < 64; y++) for (let x = 29; x < 35; x++) cells[y * 64 + x] = 'water';
  const engine = game({ map: { ...map, cells } }); deploy(engine);
  const tank = engine.spawnEntity('grizzly', 0, 24.5, 25.5);
  const plane = engine.spawnEntity('harrier', 0, 24.5, 26.5);
  engine.commandMove([tank.id], 39, 25); engine.commandMove([plane.id], 39, 26);
  advance(engine, 5);
  assert.ok(tank.x < 29, 'tank cannot cross water');
  assert.ok(plane.x > 35, 'aircraft crosses water');
  const transport = engine.spawnEntity('allied_transport', 0, 25.5, 25.5);
  assert.equal(engine.load([tank.id], transport.id), 1);
  engine.commandMove([transport.id], 39, 25); advance(engine, 10);
  assert.ok(transport.x > 35);
  assert.equal(engine.unload([transport.id]), 1);
  assert.equal(tank.transportedBy, undefined);
  assert.ok(tank.x > 35);
});

test('combat destroys targets and ending all enemy bases triggers victory', () => {
  const engine = game(); deploy(engine);
  const enemy = engine.entities.find(e => e.owner === 1)!;
  const tank = engine.spawnEntity('apocalypse', 0, enemy.x - 4, enemy.y);
  engine.commandAttack([tank.id], enemy.id); advance(engine, 50);
  assert.equal(engine.getEntity(enemy.id), undefined);
  assert.equal(engine.status, 'victory');
  assert.ok(engine.getPlayer(0)!.kills >= 1);
});

test('hostile base and miner attacks warn independently at most once per minute', () => {
  class WarningEngine extends GameEngine {
    hit(target: Entity, amount: number, attackerOwner: number) { this.damage(target, amount, attackerOwner); }
  }
  const engine = new WarningEngine({
    map: battlefield(),
    players: [{ id: 0, name: 'Player', country: 'america', team: 0 }, { id: 1, name: 'CPU', country: 'russia', team: 0 }],
    startingUnits: 0, fogOfWar: false,
  });
  const base = engine.spawnEntity('power_plant', 0, 20, 20);
  const miner = engine.spawnEntity('chrono_miner', 0, 24, 20);
  const unit = engine.spawnEntity('gi', 0, 26, 20);
  const enemyBase = engine.spawnEntity('tesla_reactor', 1, 30, 20);
  const warnings = () => engine.events.filter(event => event.kind === 'warning').map(event => event.text);

  engine.hit(unit, 1, 1);
  engine.hit(base, 0, 1);
  engine.hit(base, 1, 0);
  engine.hit(enemyBase, 1, 0);
  assert.deepEqual(warnings(), []);

  engine.hit(base, 1, 1);
  assert.deepEqual(warnings(), ['警告：我方基地正在遭受攻击！']);
  engine.time = 30;
  engine.hit(miner, 1, 1);
  assert.deepEqual(warnings(), ['警告：我方基地正在遭受攻击！', '我方采矿车正在遭受攻击！']);
  engine.time = 59.9;
  engine.hit(base, 1, 1);
  assert.equal(warnings().length, 2);
  engine.time = 60;
  engine.hit(base, 1, 1);
  assert.equal(warnings().length, 3);
  engine.time = 89.9;
  engine.hit(miner, 1, 1);
  assert.equal(warnings().length, 3);
  engine.time = 90;
  engine.hit(miner, 1, 1);
  assert.equal(warnings().length, 4);
});

test('fog follows scouts while previously revealed terrain stays explored', () => {
  const engine = game({ fogOfWar: true }); deploy(engine);
  const unit = engine.spawnEntity('grizzly', 0, 20.5, 12.5);
  advance(engine, 1);
  assert.equal(engine.visible(0, 25, 12), true);
  assert.equal(engine.visible(0, 35, 12), false);
  engine.commandMove([unit.id], 36.5, 12.5); advance(engine, 9);
  assert.equal(engine.visible(0, 36, 12), true);
  assert.equal(engine.visible(0, 25, 12), false);
  assert.equal(engine.explored(0, 25, 12), true);
});

test('AI deploys, builds an economy, and produces armed units without free credits', () => {
  const engine = game({ players: [{ id: 0, name: 'Player', country: 'america', team: 0 }, { id: 1, name: 'CPU', country: 'iraq', team: 0, ai: true, difficulty: 'medium' }] });
  engine.deploy(engine.entities.filter(e => e.owner === 0).map(e => e.id));
  advance(engine, 130);
  assert.ok(engine.entities.some(e => e.owner === 1 && e.type === 'soviet_construction_yard'));
  assert.ok(engine.getPlayer(1)!.buildingsBuilt >= 3);
  assert.ok(engine.getPlayer(1)!.unitsBuilt > 0);
  assert.ok(engine.getPlayer(1)!.credits >= 0);
});

test('A* cannot cut a blocked diagonal corner and finds an alternate route', () => {
  const blocked = new Set(['1,0', '0,1']);
  assert.deepEqual(findPath(4, 4, { x: .5, y: .5 }, { x: 2.5, y: 2.5 }, (x, y) => !blocked.has(`${x},${y}`)), []);
  const path = findPath(7, 7, { x: .5, y: .5 }, { x: 6.5, y: 6.5 }, (x, y) => x !== 3 || y === 5);
  assert.ok(path.some(p => Math.floor(p.x) === 3 && Math.floor(p.y) === 5));
  assert.deepEqual(path.at(-1), { x: 6.5, y: 6.5 });
});

test('surrender immediately ends the game, including during initial deployment', () => {
  const engine = game(); engine.surrender();
  assert.equal(engine.status, 'defeat');
  assert.equal(engine.getPlayer(0)!.defeated, true);
});

test('construction yards pack into mobile MCVs and redeploy without duplicating units', () => {
  const engine = game(); deploy(engine);
  const yard = engine.entities.find(e => e.owner === 0)!;
  const id = yard.id, count = engine.entities.length;
  assert.equal(engine.deploy([id]), 1);
  assert.equal(yard.type, 'allied_mcv');
  engine.commandMove([id], 20, 15); advance(engine, 8);
  assert.equal(engine.deploy([id]), 1);
  assert.equal(yard.type, 'construction_yard');
  assert.equal(engine.entities.length, count);
});

test('original Soviet Yuri controls one unit and controller death restores its original owner', () => {
  const engine = game(); deploy(engine);
  const yuri = engine.spawnEntity('yuri', 0, 20.5, 20.5);
  const victim = engine.spawnEntity('rhino', 1, 24.5, 20.5);
  engine.commandAttack([yuri.id], victim.id); advance(engine, 1);
  assert.equal(victim.owner, 0);
  assert.equal(victim.controlledBy, yuri.id);
  assert.equal(yuri.controlledId, victim.id);
  assert.equal(victim.hp, victim.maxHp, 'mind control replaces damage');
  const killer = engine.spawnEntity('sniper', 1, 20.5, 24.5);
  engine.commandAttack([killer.id], yuri.id); advance(engine, 1);
  assert.equal(engine.getEntity(yuri.id), undefined);
  assert.equal(victim.owner, 1);
  assert.equal(victim.controlledBy, undefined);
});

test('Yuri cannot mind-control immune miners and deploys an anti-infantry psychic pulse', () => {
  const engine = game(); deploy(engine);
  const yuri = engine.spawnEntity('yuri', 0, 20.5, 20.5);
  const miner = engine.spawnEntity('war_miner', 1, 26.5, 20.5);
  engine.commandAttack([yuri.id], miner.id); advance(engine, 1);
  assert.equal(miner.owner, 1);
  const enemy = engine.spawnEntity('conscript', 1, yuri.x + 1, yuri.y);
  engine.commandStop([yuri.id]);
  assert.equal(engine.deploy([yuri.id]), 1);
  assert.equal(engine.getEntity(enemy.id), undefined);
});

test('Crazy Ivan plants a delayed bomb instead of dealing immediate direct damage', () => {
  const engine = game(); deploy(engine);
  const target = engine.spawnEntity('power_plant', 1, 24, 20);
  const ivan = engine.spawnEntity('crazy_ivan', 0, 21.5, 20.5);
  engine.commandAttack([ivan.id], target.id); advance(engine, .5);
  assert.ok(target.bomb);
  assert.equal(target.hp, target.maxHp);
  engine.commandMove([ivan.id], 15, 20);
  advance(engine, 29);
  assert.equal(target.hp, target.maxHp);
  advance(engine, 2);
  assert.equal(target.bomb, undefined);
  assert.equal(target.hp, target.maxHp - 400);
});

test('engineers defuse friendly Ivan bombs without being consumed', () => {
  const engine = game(); deploy(engine);
  const target = engine.spawnEntity('power_plant', 0, 24, 20);
  const ivan = engine.spawnEntity('crazy_ivan', 1, 21.5, 20.5);
  engine.commandAttack([ivan.id], target.id); advance(engine, .5);
  assert.ok(target.bomb);
  const engineer = engine.spawnEntity('allied_engineer', 0, 25.5, 20.5);
  engine.commandAttack([engineer.id], target.id); advance(engine, .5);
  assert.equal(target.bomb, undefined);
  assert.ok(engine.getEntity(engineer.id));
});

test('IFV loads exactly one infantry, switches to repair mode, and restores missiles on unload', () => {
  const engine = game(); deploy(engine);
  const ifv = engine.spawnEntity('ifv', 0, 22.5, 20.5);
  const engineer = engine.spawnEntity('allied_engineer', 0, 21.5, 20.5);
  const gi = engine.spawnEntity('gi', 0, 21.5, 21.5);
  const tank = engine.spawnEntity('grizzly', 0, 24, 20.5); tank.hp = 100;
  engine.commandAttack([engineer.id], ifv.id);
  assert.equal(engine.getUnitMode(ifv), 'repair');
  assert.equal(engine.load([gi.id], ifv.id), 0);
  assert.equal(engine.load([tank.id], ifv.id), 0);
  const credits = engine.getPlayer(0)!.credits;
  engine.commandAttack([ifv.id], tank.id); advance(engine, 3);
  assert.ok(tank.hp > 180);
  assert.equal(engine.getPlayer(0)!.credits, credits, 'IFV field repairs consume no cash');
  assert.equal(engine.unload([ifv.id]), 1);
  assert.equal(engineer.transportedBy, undefined);
  assert.equal(engine.getUnitMode(ifv), 'missile');
  assert.equal(engine.getCombatDefinition(ifv).antiAir, true);
});

test('IFV uses native sniper and Tesla passenger weapon modes', () => {
  const engine = game(); deploy(engine);
  const ifv = engine.spawnEntity('ifv', 0, 22.5, 20.5);
  const sniper = engine.spawnEntity('sniper', 0, 21.5, 20.5);
  engine.load([sniper.id], ifv.id);
  assert.equal(engine.getCombatDefinition(ifv).range, 14);
  assert.equal(ifv.turretIndex, 1);
  engine.unload([ifv.id]);
  const tesla = engine.spawnEntity('tesla_trooper', 0, 21.5, 20.5);
  engine.load([tesla.id], ifv.id);
  assert.equal(engine.getCombatDefinition(ifv).weapon, 'tesla');
  assert.equal(ifv.ifvMode, 6);
  assert.equal(ifv.turretIndex, 3);
});

test('disabling short game lets an army survive the loss of its last base', () => {
  const engine = game({ shortGame: false }); deploy(engine);
  const enemyBase = engine.entities.find(e => e.owner === 1)!;
  const survivor = engine.spawnEntity('conscript', 1, 61, 61);
  const tank = engine.spawnEntity('apocalypse', 0, enemyBase.x - 4, enemyBase.y);
  engine.commandAttack([tank.id], enemyBase.id); advance(engine, 50);
  assert.equal(engine.getEntity(enemyBase.id), undefined);
  assert.equal(engine.status, 'playing');
  assert.equal(engine.getPlayer(1)!.defeated, false);
  assert.ok(engine.getEntity(survivor.id));
});

test('neutral oil derricks are captured by engineers, grant startup cash, and generate income', () => {
  const engine = game({ neutralStructures: [{ nativeType: 'CAOILD', x: 24, y: 20, health: 1, foundation: [2, 2] }] });
  deploy(engine);
  const oil = engine.entities.find(e => e.type === 'neutral_caoild')!;
  assert.equal(oil.owner, -1);
  assert.equal(engine.players.length, 2, 'neutral is not a competing player');
  assert.equal(engine.getPlayer(-1)!.name, '中立');
  const engineer = engine.spawnEntity('allied_engineer', 0, 22.5, 20.5);
  const before = engine.getPlayer(0)!.credits;
  engine.commandAttack([engineer.id], oil.id); advance(engine, 1);
  assert.equal(oil.owner, 0);
  assert.equal(engine.getEntity(engineer.id), undefined);
  assert.equal(engine.getPlayer(0)!.credits, before + 1000);
  advance(engine, 7);
  assert.equal(engine.getPlayer(0)!.credits, before + 1020);
  assert.equal(engine.sell(oil.id), false, 'original technology structures cannot be sold');
  assert.ok(!engine.getAvailable(0).some(def => def.neutral));
});

test('neutral structures block construction and require explicit attack to be destroyed', () => {
  const engine = game({ neutralStructures: [{ nativeType: 'CABARN02', x: 18, y: 13, health: 1, foundation: [2, 2] }] });
  deploy(engine);
  const barn = engine.entities.find(e => e.type === 'neutral_cabarn02')!;
  assert.equal(engine.canPlace(0, 'power_plant', 18, 13), false);
  const tank = engine.spawnEntity('apocalypse', 0, 21.5, 13.5);
  advance(engine, 4);
  assert.equal(barn.hp, barn.maxHp, 'neutral civilians are not auto-acquired as enemies');
  engine.commandAttack([tank.id], barn.id); advance(engine, 20);
  assert.equal(engine.getEntity(barn.id), undefined);
});

test('neutral buildings and captured technology do not prevent victory', () => {
  const engine = game({ neutralStructures: [{ nativeType: 'CAOILD', x: 24, y: 20, health: 1, foundation: [2, 2] }] });
  engine.surrender(1);
  assert.equal(engine.status, 'victory');
  assert.ok(engine.entities.some(e => e.owner === -1));
});

test('CPU engineers capture neutral oil on a map without ore', () => {
  const map = battlefield(); map.cells = Array(64 * 64).fill('land');
  const engine = game({ map, startingCredits: 10000,
    players: [{ id: 0, name: 'Player', country: 'america', team: 0 }, { id: 1, name: 'CPU', country: 'russia', team: 0, ai: true, difficulty: 'medium' }],
    neutralStructures: [{ nativeType: 'CAOILD', x: 46, y: 47, health: 1, foundation: [2, 2] }, { nativeType: 'CAOILD', x: 44, y: 52, health: 1, foundation: [2, 2] }],
  });
  engine.deploy(engine.entities.filter(e => e.owner === 0).map(e => e.id));
  advance(engine, 100);
  assert.ok(engine.entities.some(e => e.owner === 1 && e.type === 'neutral_caoild'));
});

test('waypoints execute in order and an ordinary order replaces the remaining route', () => {
  const engine=game();const unit=engine.spawnEntity('grizzly',0,25.5,25.5)!;
  engine.commandMove([unit.id],29.5,25.5,false,true);
  engine.commandMove([unit.id],29.5,30.5,false,true);
  engine.commandMove([unit.id],34.5,30.5,false,true);
  assert.equal(unit.waypoints?.length,2);
  for(let i=0;i<300&&unit.waypoints?.length===2;i++)engine.step(.1);
  assert.equal(unit.waypoints?.length,1);
  assert.ok(Math.abs(unit.x-29.5)<.5&&Math.abs(unit.y-25.5)<1,'first corner reached before moving to the second');
  assert.deepEqual(unit.order,{kind:'move',x:29.5,y:30.5});
  engine.commandMove([unit.id],25.5,25.5);
  assert.deepEqual(unit.waypoints,[]);
  advance(engine,15);assert.equal(unit.order.kind,'idle');
  assert.ok(Math.hypot(unit.x-25.5,unit.y-25.5)<.5);
});

test('stop cancels a planned route and harvesters can complete a multi-stop route', () => {
  const engine=game();const unit=engine.spawnEntity('grizzly',0,25.5,25.5)!;
  engine.commandMove([unit.id],29.5,25.5,false,true);engine.commandMove([unit.id],29.5,30.5,false,true);
  engine.commandStop([unit.id]);advance(engine,1);
  assert.deepEqual(unit.waypoints,[]);assert.equal(unit.order.kind,'idle');assert.equal(unit.x,25.5);
  const miner=engine.spawnEntity('chrono_miner',0,35.5,30.5)!;
  engine.commandMove([miner.id],38.5,30.5,false,true);engine.commandMove([miner.id],38.5,34.5,false,true);
  for(let i=0;i<500&&miner.order.kind!=='idle';i++)engine.step(.1);
  assert.equal(miner.order.kind,'idle');assert.ok(Math.hypot(miner.x-38.5,miner.y-34.5)<.6);
});
