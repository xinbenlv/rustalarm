import { CATALOG, CATEGORIES, COUNTRIES } from './data';
import { bootcampTypes } from '../bootcamp/catalog.js';
import { copySaveData, type EngineSnapshot } from './snapshot';
import type { Definition, Entity, PlayerState } from './types';

export function requireSave(condition: unknown): asserts condition {
  if (!condition) throw new Error('存档数据无效。');
}
export function record(value: unknown): asserts value is Record<string, any> {
  requireSave(value !== null && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value));
}
export function finite(value: unknown, min = -1e15, max = 1e15): asserts value is number {
  requireSave(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max);
}
export function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): asserts value is number {
  finite(value, min, max); requireSave(Number.isSafeInteger(value));
}
export function list(value: unknown, max = 100000): asserts value is any[] {
  requireSave(Array.isArray(value) && value.length <= max);
}
export function textValue(value: unknown, max = 2000): asserts value is string {
  requireSave(typeof value === 'string' && value.length <= max);
}
function bool(value: unknown) { requireSave(typeof value === 'boolean'); }
export function point(value: unknown) { record(value); finite(value.x, -4096, 4096); finite(value.y, -4096, 4096); }
function numbers(value: unknown, length: number, max: number, whole = false): number[] {
  requireSave(Array.isArray(value) || ArrayBuffer.isView(value));
  const result = Array.from(value as ArrayLike<number>);
  requireSave(result.length === length);
  for (const n of result) { finite(n, 0, max); if (whole) integer(n, 0, max); }
  return result;
}
/** Reject executable values, unsafe keys, non-finite numbers and excessive nesting. */
export function checkSaveTree(value: unknown, depth = 0, budget = { remaining: 5000000 }): void {
  requireSave(depth <= 30 && --budget.remaining >= 0);
  if (value === undefined || value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') { finite(value); return; }
  if (typeof value === 'string') { textValue(value, 100000); return; }
  requireSave(typeof value === 'object');
  if (ArrayBuffer.isView(value)) { for (const n of Array.from(value as unknown as ArrayLike<number>)) finite(n); return; }
  requireSave(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  for (const [key, item] of Object.entries(value)) {
    requireSave(!['__proto__', 'prototype', 'constructor'].includes(key));
    checkSaveTree(item, depth + 1, budget);
  }
}

export function validateGameMap(value: unknown): void {
  record(value); integer(value.width, 1, 512); integer(value.height, 1, 512);
  list(value.cells, 512 * 512); requireSave(value.cells.length === value.width * value.height);
  for (const cell of value.cells) requireSave(['land','water','ore','gem','cliff','road','snow','bridge','void'].includes(cell));
  list(value.spawns, 8); for (const spawn of value.spawns) point(spawn);
  if (value.theater !== undefined) requireSave(['temperate','snow','urban'].includes(value.theater));
  for (const key of ['id','name']) if (value[key] !== undefined) textValue(value[key]);
}

function validateDefinition(d: Definition) {
  record(d); requireSave(/^neutral_[a-z0-9_]+$/.test(d.id));
  requireSave(d.neutral === true && d.kind === 'building' && d.category === 'structure' && d.faction === 'both');
  for (const key of ['name','nameEn','description'] as const) textValue(d[key]);
  for (const key of ['sprite','cameo'] as const) { textValue(d[key], 80); requireSave(/^[a-z0-9_-]+$/i.test(d[key])); }
  for (const key of ['cost','buildTime','hp','sight'] as const) finite(d[key], 0, 1e8);
  requireSave(d.hp > 0); list(d.size, 2); requireSave(d.size.length === 2);
  for (const size of d.size) integer(size, 1, 64);
  for (const key of ['power','income','incomeInterval','range','damage','cooldown'] as const) if (d[key] !== undefined) finite(d[key]);
  for (const key of ['capturable','unsellable'] as const) if (d[key] !== undefined) bool(d[key]);
}

function validatePlayer(p: PlayerState, cells: number, known: (type: string) => Definition | undefined) {
  record(p); integer(p.id, -1, 7); integer(p.team, -1, 100); textValue(p.name);
  requireSave(COUNTRIES.some(c => c.id === p.country)); requireSave(['allied','soviet'].includes(p.faction));
  if (p.ai !== undefined) bool(p.ai);
  if (p.difficulty !== undefined) requireSave(['easy','medium','hard'].includes(p.difficulty));
  if (p.color !== undefined) { textValue(p.color, 40); requireSave(/^#[a-f0-9]{3,8}$/i.test(p.color)); }
  for (const key of ['credits','powerProduced','powerConsumed','kills','losses','buildingsBuilt','unitsBuilt','supportCooldown'] as const) finite(p[key], 0, Number.MAX_SAFE_INTEGER);
  finite(p.aiTimer); finite(p.aiAttackTimer); bool(p.defeated); point(p.spawn);
  p.fog = new Uint8Array(numbers(p.fog, cells, 1, true));
  p.explored = new Uint8Array(numbers(p.explored, cells, 1, true));
  record(p.queues);
  for (const category of CATEGORIES) {
    list(p.queues[category], 1000);
    for (const item of p.queues[category]) {
      record(item); requireSave(known(item.type)?.category === category);
      finite(item.progress, 0); finite(item.duration, .000001); finite(item.paid, 0); bool(item.ready);
    }
  }
  record(p.abilityCooldowns);
  for (const [key, remaining] of Object.entries(p.abilityCooldowns)) {
    requireSave(['paradrop','chronosphere','lightning','ironCurtain','nuke'].includes(key)); finite(remaining, 0);
  }
}

function validateEntity(e: Entity, owners: Set<number>, known: (type: string) => Definition | undefined) {
  record(e); integer(e.id, 1); requireSave(owners.has(e.owner));
  const definition = known(e.type); requireSave(definition && definition.kind === e.kind);
  point(e);
  if (e.rallyPoint !== undefined) point(e.rallyPoint);
  if (e.primaryFactory !== undefined) bool(e.primaryFactory);
  if (e.homeAirfieldId !== undefined) integer(e.homeAirfieldId, 1);
  if (e.aircraftPadIndex !== undefined) integer(e.aircraftPadIndex, 0, 3);
  if (e.ammo !== undefined) integer(e.ammo, 0, 1);
  if (e.reloadRemaining !== undefined) finite(e.reloadRemaining, 0, 18);
  if (e.flightHeight !== undefined) finite(e.flightHeight, 0, 150);
  if (e.flightSpeed !== undefined) finite(e.flightSpeed, 0, 20);
  if (e.prismCharge !== undefined) {
    record(e.prismCharge); integer(e.prismCharge.targetId, 1); finite(e.prismCharge.fireAt, 0);
    list(e.prismCharge.supportIds, 8); for (const id of e.prismCharge.supportIds) integer(id, 1);
  }
  if (e.unloadAfterLanding !== undefined) bool(e.unloadAfterLanding);
  if (e.chronoReadyAt !== undefined) finite(e.chronoReadyAt, 0);
  for (const key of ['hp','maxHp','angle','cooldown','cargo','veteran','kills','lastShot','spawnedAt','harvestTimer','repathTimer'] as const) finite(e[key]);
  requireSave(e.maxHp > 0 && e.hp <= e.maxHp); bool(e.repairing);
  for (const key of ['path','waypoints'] as const) {
    if (key === 'waypoints' && e[key] === undefined) continue;
    list(e[key], 262144); for (const p of e[key]!) point(p);
  }
  record(e.order);
  const kind = e.order.kind;
  requireSave(['idle','move','attackMove','attack','harvest','return','capture','load','demolish','repairUnit'].includes(kind));
  if (['move','attackMove','harvest'].includes(kind)) point(e.order);
  if (['attack','return','capture','load','demolish','repairUnit'].includes(kind)) integer((e.order as {targetId:number}).targetId, 1);
  for (const key of ['targetId','transportedBy','controlledBy','controlledId'] as const) if (e[key] !== undefined) integer(e[key], 1);
  if (e.originalOwner !== undefined) requireSave(owners.has(e.originalOwner));
  if (e.passengers !== undefined) { list(e.passengers, 100); for (const id of e.passengers) integer(id, 1); }
  for (const key of ['deployed','holdFire'] as const) if (e[key] !== undefined) bool(e[key]);
  for (const key of ['lastHit','lastMovedAt','invulnerableUntil','radiationUntil','ifvMode','turretIndex','mapStructureIndex'] as const) if (e[key] !== undefined) finite(e[key]);
  if (e.weaponMode !== undefined) textValue(e.weaponMode, 100);
  if (e.bomb) { record(e.bomb); finite(e.bomb.detonatesAt); finite(e.bomb.damage, 0); integer(e.bomb.sourceId, 1); requireSave(owners.has(e.bomb.owner)); }
}

export function validateEngineSnapshot(value: unknown): EngineSnapshot {
  checkSaveTree(value); record(value);
  const s = copySaveData(value) as EngineSnapshot;
  validateGameMap(s.map); const cells = s.map.width * s.map.height;
  requireSave(['skirmish','bootcamp'].includes(s.mode));
  list(s.neutralDefinitions, 1000); const definitions = new Map<string, Definition>();
  for (const d of s.neutralDefinitions) { validateDefinition(d); requireSave(!definitions.has(d.id)); definitions.set(d.id, d); }
  const known = (type: string) => typeof type === 'string' && type.startsWith('neutral_') ? definitions.get(type) : Object.hasOwn(CATALOG, type) ? CATALOG[type] : undefined;
  list(s.players, 8); requireSave(s.players.length >= 1);
  const owners = new Set([-1]);
  for (const p of s.players) { validatePlayer(p, cells, known); requireSave(p.id >= 0 && !owners.has(p.id)); owners.add(p.id); }
  validatePlayer(s.neutralPlayer, cells, known); requireSave(s.neutralPlayer.id === -1);
  requireSave(s.players.some(p => p.id === s.localPlayerId));
  for (const field of ['fogOfWar','superweapons','shortGame','paused'] as const) bool(s[field]);
  finite(s.time, 0); finite(s.speed, .25, 4);
  requireSave(['playing','victory','defeat'].includes(s.status));
  requireSave(s.winnerTeam === null || s.players.some(p => p.team === s.winnerTeam)); textValue(s.lastMessage);
  s.ore = new Float32Array(numbers(s.ore, cells, 1e10));
  for (const key of ['nextId','nextEffect','nextEvent'] as const) integer(s[key], 1);
  integer(s.randomState, -2147483648, Number.MAX_SAFE_INTEGER);
  for (const key of ['visibilityTimer','economyTimer'] as const) finite(s[key]);
  record(s.alarmAt);
  for (const key of ['base','miner'] as const) if (s.alarmAt[key] !== null) finite(s.alarmAt[key], 0, s.time);
  for (const key of ['debugRevealPlayers','instantProductionPlayers','debugAdjustedCredits'] as const) {
    list(s[key], 8); requireSave(new Set(s[key]).size === s[key].length);
    for (const id of s[key]) requireSave(owners.has(id));
  }
  list(s.entities); list(s.spatialRetired); const entities = new Map<number, Entity>();
  for (const e of [...s.entities, ...s.spatialRetired]) {
    validateEntity(e, owners, known); requireSave(!entities.has(e.id) && e.id < s.nextId); entities.set(e.id, e);
    for (const key of ['targetId','transportedBy','controlledBy','controlledId'] as const) if (e[key] !== undefined) integer(e[key], 1, s.nextId - 1);
    if ('targetId' in e.order) integer(e.order.targetId, 1, s.nextId - 1);
    if (e.bomb) integer(e.bomb.sourceId, 1, s.nextId - 1);
    if (s.mode === 'bootcamp') requireSave(bootcampTypes.has(e.type));
  }
  const active = new Map(s.entities.map(e => [e.id, e]));
  for (const e of s.entities) {
    if (e.transportedBy !== undefined) requireSave(active.get(e.transportedBy)?.passengers?.includes(e.id));
    for (const id of e.passengers ?? []) requireSave(active.get(id)?.transportedBy === e.id);
  }
  list(s.spatial, cells); const buckets = new Set<number>();
  for (const entry of s.spatial) {
    list(entry, 2); requireSave(entry.length === 2); const [key, ids] = entry;
    integer(key, 0, cells); requireSave(!buckets.has(key)); buckets.add(key); list(ids);
    requireSave(new Set(ids).size === ids.length);
    for (const id of ids) requireSave(entities.has(id));
  }
  list(s.effects); list(s.events, 1000);
  for (const effect of s.effects) {
    record(effect); integer(effect.id, 1, s.nextEffect - 1); point(effect); finite(effect.age, 0); finite(effect.duration, .000001);
    requireSave(['shot','explosion','text','deploy','radiation','nuke','hit'].includes(effect.kind));
    if (effect.text !== undefined) textValue(effect.text);
    for (const key of ['toX','toY','radius'] as const) if (effect[key] !== undefined) finite(effect[key]);
    for (const key of ['sourceId','targetId'] as const) if (effect[key] !== undefined) integer(effect[key], 1, s.nextId - 1);
    if (effect.weapon !== undefined) requireSave(['bullet','shell','missile','tesla','flame','radiation','explosive','bomb','torpedo','sonic','prism','flak','melee','chrono','carrier'].includes(effect.weapon));
    if (effect.color !== undefined) textValue(effect.color, 80);
    for (const key of ['fromHeight','toHeight','arc'] as const) if (effect[key] !== undefined) finite(effect[key], 0, 200);
    if (effect.burst !== undefined) integer(effect.burst, 1, 3);
    if (effect.beamWidth !== undefined) finite(effect.beamWidth, .1, 10);
    if (effect.prismSupport !== undefined) bool(effect.prismSupport);
    if (effect.projectileSprite !== undefined) requireSave(effect.projectileSprite === 'dragon');
    if (effect.delay !== undefined) finite(effect.delay, 0, effect.duration - .000001);
    if (effect.impact !== undefined) {
      record(effect.impact); finite(effect.impact.damage, 0); requireSave(owners.has(effect.impact.owner));
      finite(effect.impact.splash, 0, 20); finite(effect.impact.at, 0, effect.duration);
      finite(effect.toX); finite(effect.toY);
    }
  }
  for (const event of s.events) {
    record(event); integer(event.id, 1, s.nextEvent - 1); finite(event.time, 0); textValue(event.text);
    requireSave(['info','warning','combat','complete'].includes(event.kind));
    if (event.owner !== undefined) requireSave(owners.has(event.owner));
  }
  return s;
}
