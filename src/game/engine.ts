// Simulation owns all gameplay. Bootcamp changes are gated by mode; renderer switches never create an engine.
// This pre-existing monolithic class exceeds the normal file limit; splitting its private simulation state is outside this integration.
import { bootcampTypes, BOOTCAMP_CREDITS } from '../bootcamp/catalog.js';
import { CATALOG, CATEGORIES, countryById, getDefinition, PLAYER_COLORS } from './data';
import { findPath } from './pathfinding';
import type { Definition, Effect, Entity, GameEvent, GameMap, GameOptions, Order, PlayerState, Point, ProductionCategory, Terrain } from './types';

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const isTransport = (type: string) => !!CATALOG[type]?.transportCapacity;
const abilities: Record<string, { name: string; building?: string; duration: number }> = {
  paradrop: { name: '空降部队', building: 'airforce_command', duration: 90 },
  chronosphere: { name: '超时空传送', building: 'chronosphere', duration: 180 },
  lightning: { name: '闪电风暴', building: 'weather_control', duration: 240 },
  ironCurtain: { name: '铁幕装置', building: 'iron_curtain', duration: 180 },
  nuke: { name: '核弹攻击', building: 'nuclear_silo', duration: 240 },
};

/** Deterministic tile-space skirmish simulation, independent of rendering and DOM. */
export class GameEngine {
  readonly mode: 'skirmish' | 'bootcamp';
  get bootcamp(): boolean { return this.mode === 'bootcamp'; }
  readonly map: GameMap;
  readonly players: PlayerState[];
  readonly localPlayerId: number;
  readonly fogOfWar: boolean;
  readonly superweapons: boolean;
  readonly shortGame: boolean;
  entities: Entity[] = [];
  effects: Effect[] = [];
  events: GameEvent[] = [];
  time = 0;
  paused = false;
  speed = 1;
  status: 'playing' | 'victory' | 'defeat' = 'playing';
  winnerTeam: number | null = null;
  lastMessage = '';
  private debugRevealPlayers = new Set<number>();
  private instantProductionPlayers = new Set<number>();
  private debugAdjustedCredits = new Set<number>();
  get debugRevealMap(): boolean { return this.getDebugMapReveal(this.localPlayerId); }
  set debugRevealMap(enabled: boolean) { this.setDebugMapReveal(enabled); }
  get debugInstantProduction(): boolean { return this.getDebugInstantProduction(this.localPlayerId); }
  ore: Float32Array;
  private blocked: Uint8Array;
  private nextId = 1;
  private nextEffect = 1;
  private nextEvent = 1;
  private randomState: number;
  private visibilityTimer = 0;
  private economyTimer = 0;
  private alarmAt = -20;
  private entityMap = new Map<number, Entity>();
  private spatial = new Map<number, Entity[]>();
  private neutralPlayer: PlayerState;

  constructor(options: GameOptions) {
    this.mode = options.mode ?? 'skirmish';
    this.map = { ...options.map, cells: [...options.map.cells] };
    this.localPlayerId = options.localPlayerId ?? options.players.find(p => !p.ai)?.id ?? 0;
    if (this.bootcamp) this.instantProductionPlayers.add(this.localPlayerId);
    this.fogOfWar = options.fogOfWar ?? true;
    this.superweapons = options.superweapons ?? true;
    this.shortGame = options.shortGame ?? true;
    this.randomState = options.seed ?? 1941;
    this.blocked = new Uint8Array(this.map.width * this.map.height);
    this.ore = new Float32Array(this.blocked.length);
    for (let i = 0; i < this.ore.length; i++) this.ore[i] = this.map.cells[i] === 'gem' ? 8000 : this.map.cells[i] === 'ore' ? 5000 : 0;
    this.players = options.players.map((p, index) => {
      const source = this.map.spawns[index % Math.max(1, this.map.spawns.length)] ?? { x: 12 + index * 25, y: 12 + index * 25 };
      return {
        ...p, team: p.team ?? 0, color: p.color ?? PLAYER_COLORS[index % PLAYER_COLORS.length], faction: countryById(p.country).faction,
        credits: options.startingCredits ?? 10000, powerProduced: 0, powerConsumed: 0, defeated: false,
        queues: { structure: [], defense: [], infantry: [], vehicle: [], aircraft: [], naval: [] },
        kills: 0, losses: 0, buildingsBuilt: 0, unitsBuilt: 0, fog: new Uint8Array(this.blocked.length), explored: new Uint8Array(this.blocked.length),
        supportCooldown: 0, abilityCooldowns: {}, spawn: { ...source }, aiTimer: 1 + index * .2, aiAttackTimer: 45 + index * 6,
      };
    });
    this.neutralPlayer = {
      id: -1, name: '中立', country: 'america', team: -1, faction: 'allied', color: '#b6b4a5', credits: 0,
      powerProduced: 0, powerConsumed: 0, defeated: false,
      queues: { structure: [], defense: [], infantry: [], vehicle: [], aircraft: [], naval: [] },
      kills: 0, losses: 0, buildingsBuilt: 0, unitsBuilt: 0, fog: new Uint8Array(this.blocked.length), explored: new Uint8Array(this.blocked.length),
      supportCooldown: 0, abilityCooldowns: {}, spawn: { x: 0, y: 0 }, aiTimer: 0, aiAttackTimer: 0,
    };
    for (const [index, item] of (this.bootcamp ? [] : options.neutralStructures ?? []).entries()) {
      const native = item.nativeType.toLowerCase(), id = `neutral_${native}`;
      const techNames: Record<string, string> = { caoild: '科技钻油井', cahosp: '市民医院', caoutp: '科技前哨站', caairp: '科技机场' };
      const hp = native === 'caoild' ? 1000 : native === 'caoutp' ? 2000 : 800;
      CATALOG[id] = {
        id, name: item.name ?? techNames[native] ?? '民用建筑', nameEn: native.toUpperCase(), kind: 'building', faction: 'both', category: 'structure',
        cost: 0, buildTime: 1, hp, sprite: item.sprite ?? native, cameo: native, size: item.foundation, sight: 6, armor: 'building',
        neutral: true, capturable: !!techNames[native], unsellable: true, power: 0,
        income: native === 'caoild' ? 20 : undefined, incomeInterval: native === 'caoild' ? 100 / 15 : undefined,
        description: native === 'caoild' ? '工程师占领后获得 $1000，并持续产出资金。' : native === 'cahosp' ? '占领后持续治疗己方步兵。' : native === 'caoutp' ? '占领后修复附近己方车辆。' : native === 'caairp' ? '占领后提供空降部队。' : '战场上的原始民用建筑。',
      };
      const e = this.spawnEntity(id, -1, item.x, item.y);
      e.hp = hp * clamp(item.health > 1 ? item.health / 256 : item.health, .01, 1);
      e.mapStructureIndex = index;
    }
    for (const player of this.players) {
      if (this.bootcamp) { this.initializeBootcamp(player, options.startingUnits ?? 4); continue; }
      const mcvType = player.faction === 'allied' ? 'allied_mcv' : 'soviet_mcv';
      const mcvDef = getDefinition(mcvType);
      const position = this.findDeployPosition(player.spawn, getDefinition(mcvDef.deploysTo!), undefined, 18) ?? this.nearestPassable(player.spawn, mcvDef);
      player.spawn = position;
      this.spawnEntity(mcvType, player.id, position.x, position.y);
      const count = options.startingUnits ?? 4;
      for (let i = 0; i < count; i++) {
        const type = i < Math.ceil(count / 2) ? (player.faction === 'allied' ? 'grizzly' : 'rhino') : (player.faction === 'allied' ? 'gi' : 'conscript');
        const angle = i / Math.max(1, count) * Math.PI * 2;
        const pos = this.nearestPassable({ x: position.x + Math.cos(angle) * 4, y: position.y + Math.sin(angle) * 4 }, getDefinition(type));
        this.spawnEntity(type, player.id, pos.x, pos.y);
      }
    }
    this.updatePower();
    this.updateFog();
    this.rebuildSpatial();
  }

  private initializeBootcamp(player: PlayerState, count: number) {
    if (player.id === this.localPlayerId) player.credits = BOOTCAMP_CREDITS;
    const yard = getDefinition('construction_yard');
    const position = this.findDeployPosition(player.spawn, yard, undefined, 24);
    if (position) {
      const b = this.getPlacementBounds(yard.id, position.x, position.y);
      this.spawnEntity(yard.id, player.id, b.centerX, b.centerY);
      player.spawn = {x:b.centerX, y:b.centerY};
    }
    // Every opponent remains a real target even when starting units is set to zero.
    const roster = ['rhino', 'conscript', 'tanya', 'apocalypse', 'rocketeer', 'war_miner', 'destroyer', 'giant_squid'];
    for (let i = 0; i < Math.max(1, count); i++) {
      const type = roster[i % roster.length], point = this.trainingSpawn(player.id, getDefinition(type));
      if (point) this.spawnEntity(type, player.id, point.x, point.y);
    }
  }
  /** A producer-free training exit, respecting map bounds, occupancy and land/sea/air. */
  private trainingSpawn(playerId: number, def: Definition): Point | undefined {
    const origin = this.getPlayer(playerId)!.spawn;
    if (def.naval && !this.map.cells.includes('water')) return undefined;
    const ox=Math.floor(origin.x),oy=Math.floor(origin.y);
    // Search outward so routine sidebar affordability checks do not scan the entire map.
    for (let radius=0; radius<=Math.max(this.map.width,this.map.height); radius++) {
      let best: Point | undefined, score=Infinity;
      const consider=(x:number,y:number)=>{
        const point={x:x+.5,y:y+.5};
        if (!this.isPassable(point.x,point.y,def)) return;
        if (this.entities.some(e=>e.hp>0&&!e.transportedBy&&!!getDefinition(e.type).flying===!!def.flying&&distance(e,point)<1)) return;
        const d=distance(origin,point);if(d<score){best=point;score=d;}
      };
      for(let x=Math.max(0,ox-radius);x<=Math.min(this.map.width-1,ox+radius);x++) {
        consider(x,oy-radius);if(radius)consider(x,oy+radius);
      }
      for(let y=Math.max(0,oy-radius+1);y<=Math.min(this.map.height-1,oy+radius-1);y++) {
        consider(ox-radius,y);if(radius)consider(ox+radius,y);
      }
      if(best)return best;
    }
    return undefined;
  }

  private random() {
    let x = this.randomState | 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.randomState = x;
    return (x >>> 0) / 4294967296;
  }

  getPlayer(id = this.localPlayerId): PlayerState | undefined { return id === -1 ? this.neutralPlayer : this.players.find(p => p.id === id); }
  adjustDebugCredits(amount: number, playerId = this.localPlayerId): void {
    const player = this.getPlayer(playerId);
    if (!Number.isFinite(amount) || !player || player.defeated || this.status !== 'playing') return;
    this.debugAdjustedCredits.add(playerId);
    player.credits = clamp(player.credits + amount, 0, Number.MAX_SAFE_INTEGER);
  }
  grantDebugCredits(playerId = this.localPlayerId): void { this.adjustDebugCredits(10000, playerId); }
  deductDebugCredits(playerId = this.localPlayerId): void { this.adjustDebugCredits(-10000, playerId); }
  getDebugMapReveal(playerId: number): boolean { return this.debugRevealPlayers.has(playerId); }
  setDebugMapReveal(enabled: boolean, playerId = this.localPlayerId): void {
    if (enabled) this.debugRevealPlayers.add(playerId);
    else this.debugRevealPlayers.delete(playerId);
  }
  getDebugInstantProduction(playerId: number): boolean { return this.instantProductionPlayers.has(playerId); }
  setDebugInstantProduction(enabled: boolean, playerId = this.localPlayerId): void {
    if (enabled) this.instantProductionPlayers.add(playerId);
    else this.instantProductionPlayers.delete(playerId);
    const player = this.getPlayer(playerId);
    if (!enabled || !player || player.defeated || this.status !== 'playing') return;
    // Complete already-paid queues as well as future purchases. Buildings still need placement.
    const rounds = Math.max(...CATEGORIES.map(category => player.queues[category].length));
    for (let i = 0; i < rounds; i++) this.advanceProduction(player, 0);
  }
  getEntity(id: number): Entity | undefined { return this.entityMap.get(id); }
  isAllied(a: number, b: number): boolean {
    if (a === b) return true;
    const pa = this.getPlayer(a), pb = this.getPlayer(b);
    return !!(pa && pb && pa.team > 0 && pa.team === pb.team);
  }
  terrainAt(x: number, y: number): Terrain {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return 'void';
    return this.map.cells[ty * this.map.width + tx] ?? 'void';
  }
  visible(playerId: number, x: number, y: number): boolean {
    if (!this.fogOfWar || this.getDebugMapReveal(playerId)) return this.terrainAt(x, y) !== 'void';
    return !!this.getPlayer(playerId)?.fog[Math.floor(y) * this.map.width + Math.floor(x)];
  }
  explored(playerId: number, x: number, y: number): boolean {
    if (!this.fogOfWar || this.getDebugMapReveal(playerId)) return this.terrainAt(x, y) !== 'void';
    return !!this.getPlayer(playerId)?.explored[Math.floor(y) * this.map.width + Math.floor(x)];
  }
  isPowered(playerId: number): boolean {
    const p = this.getPlayer(playerId);
    return !!p && p.powerProduced >= p.powerConsumed;
  }
  ownEntities(playerId: number): Entity[] { return this.entities.filter(e => e.owner === playerId && e.hp > 0); }

  private has(playerId: number, requirement: string): boolean {
    const aliases: Record<string, string[]> = {
      yard: ['construction_yard', 'soviet_construction_yard'], power: ['power_plant', 'tesla_reactor', 'nuclear_reactor'],
      refinery: ['refinery', 'soviet_refinery'], barracks: ['barracks', 'soviet_barracks'], war_factory: ['war_factory', 'soviet_war_factory'],
      radar: ['airforce_command', 'radar'], tech: ['battle_lab', 'soviet_battle_lab'], depot: ['repair_depot', 'soviet_repair_depot'],
      naval: ['naval_yard', 'soviet_naval_yard'],
    };
    const types = aliases[requirement] ?? [requirement];
    return this.entities.some(e => e.hp > 0 && e.owner === playerId && types.includes(e.type));
  }

  getAvailable(playerId: number, category?: ProductionCategory): Definition[] {
    const p = this.getPlayer(playerId);
    if (!p || p.defeated) return [];
    return Object.values(CATALOG).filter(d => {
      if (category && category !== d.category) return false;
      if (d.neutral) return false;
      if (this.bootcamp) return bootcampTypes.has(d.id);
      if (d.id.includes('construction_yard')) return false;
      if (d.kind === 'building' && this.has(playerId, d.id)) return false;
      if (d.faction !== 'both' && d.faction !== p.faction) return false;
      if (d.country && d.country !== p.country) return false;
      if (!this.superweapons && ['chronosphere', 'weather_control', 'iron_curtain', 'nuclear_silo'].includes(d.id)) return false;
      return (d.prerequisites ?? []).every(r => this.has(playerId, r));
    });
  }

  getBuildReason(playerId: number, type: string): string {
    const p = this.getPlayer(playerId), def = CATALOG[type];
    if (!p || !def || p.defeated || this.status !== 'playing') return '无法生产';
    if (this.bootcamp && !bootcampTypes.has(type)) return '训练营尚无此型号的 3D 模型';
    if (!this.bootcamp && def.kind === 'building' && this.has(playerId, type)) return '该建筑已建造';
    if (!this.getAvailable(playerId).some(d => d.id === type)) return '需要前置建筑';
    if (this.bootcamp && def.kind === 'unit' && !this.trainingSpawn(playerId, def)) return '没有适合该单位的空闲地形';
    if (!this.bootcamp && p.credits < def.cost) return '资金不足';
    const queue = p.queues[def.category];
    if (queue.length >= (def.kind === 'building' ? 1 : 12)) return '生产队列已满';
    return '';
  }
  canBuild(playerId: number, type: string): boolean { return this.getBuildReason(playerId, type) === ''; }
  build(playerId: number, type: string): boolean {
    const reason = this.getBuildReason(playerId, type);
    if (reason) { this.lastMessage = reason; return false; }
    const p = this.getPlayer(playerId)!, d = getDefinition(type);
    const free = this.bootcamp && playerId === this.localPlayerId;
    p.credits = free ? (this.debugAdjustedCredits.has(playerId) ? p.credits : BOOTCAMP_CREDITS) : p.credits - d.cost;
    p.queues[d.category].push({ type, progress: 0, duration: d.buildTime, ready: false, paid: free ? 0 : d.cost });
    this.lastMessage = `${d.name}：开始生产`;
    if (this.getDebugInstantProduction(playerId)) this.advanceProduction(p, 0);
    return true;
  }
  cancelBuild(playerId: number, category: ProductionCategory): boolean {
    const p = this.getPlayer(playerId), q = p?.queues[category];
    if (!p || !q?.length) return false;
    const item = q.pop()!;
    p.credits += item.paid;
    this.event('生产已取消，资金已退回。', playerId);
    return true;
  }

  /** Bounds use top-left integer tiles; world entities store footprint centers. */
  getPlacementBounds(type: string, x: number, y: number) {
    const [width, height] = getDefinition(type).size ?? [1, 1];
    const left = Math.floor(x - width / 2), top = Math.floor(y - height / 2);
    return { x: left, y: top, width, height, centerX: left + width / 2, centerY: top + height / 2 };
  }
  private footprintClear(def: Definition, x: number, y: number, ignoreId?: number): boolean {
    const b = this.getPlacementBounds(def.id, x, y);
    for (let ty = b.y; ty < b.y + b.height; ty++) for (let tx = b.x; tx < b.x + b.width; tx++) {
      const terrain = this.terrainAt(tx, ty);
      if (def.naval ? terrain !== 'water' : ['water', 'cliff', 'void', 'bridge'].includes(terrain)) return false;
      if (this.blocked[ty * this.map.width + tx]) return false;
    }
    return !this.entities.some(e => e.hp > 0 && e.id !== ignoreId && !e.transportedBy && e.kind === 'unit' && !getDefinition(e.type).flying && e.x >= b.x && e.x < b.x + b.width && e.y >= b.y && e.y < b.y + b.height);
  }
  getPlacementReason(playerId: number, type: string, x: number, y: number): string {
    const def = CATALOG[type];
    if (!def || def.kind !== 'building') return '选择要建造的建筑';
    if (this.bootcamp && !bootcampTypes.has(type)) return '训练营尚无此型号的 3D 模型';
    if (!this.footprintClear(def, x, y)) return def.naval ? '船坞需要空旷水面' : '此处无法建造';
    const bounds = this.getPlacementBounds(type, x, y);
    const center = { x: bounds.centerX, y: bounds.centerY };
    if (!this.bootcamp && !this.entities.some(e => {
      if (e.owner !== playerId || e.kind !== 'building' || e.hp <= 0) return false;
      const size = getDefinition(e.type).size ?? [1, 1];
      const dx = Math.max(0, Math.abs(e.x - center.x) - (size[0] + bounds.width) / 2);
      const dy = Math.max(0, Math.abs(e.y - center.y) - (size[1] + bounds.height) / 2);
      return Math.hypot(dx, dy) <= (def.naval ? 12 : 6);
    })) return '需要靠近己方建筑';
    if (!this.explored(playerId, center.x, center.y)) return '需要先探索这片区域';
    return '';
  }
  canPlace(playerId: number, type: string, x: number, y: number): boolean { return this.getPlacementReason(playerId, type, x, y) === ''; }
  place(playerId: number, type: string, x: number, y: number): boolean {
    const p = this.getPlayer(playerId), def = CATALOG[type];
    if (!p || !def || this.status !== 'playing') return false;
    const q = p.queues[def.category], item = q[0];
    if (!item || item.type !== type || !item.ready) { this.lastMessage = '建筑尚未就绪'; return false; }
    const reason = this.getPlacementReason(playerId, type, x, y);
    if (reason) { this.lastMessage = reason; return false; }
    const b = this.getPlacementBounds(type, x, y);
    q.shift();
    const entity = this.spawnEntity(type, playerId, b.centerX, b.centerY);
    p.buildingsBuilt++;
    this.onBuildingComplete(entity);
    return true;
  }

  spawnEntity(type: string, owner: number, x: number, y: number): Entity {
    if (this.bootcamp && !bootcampTypes.has(type)) throw new Error('Unsupported Bootcamp model: ' + type);
    const d = getDefinition(type);
    const e: Entity = {
      id: this.nextId++, type, kind: d.kind, owner, x, y, hp: d.hp, maxHp: d.hp, angle: Math.PI / 2,
      order: { kind: 'idle' }, path: [], cooldown: 0, cargo: 0, repairing: false, veteran: 0, kills: 0,
      lastShot: -10, spawnedAt: this.time, harvestTimer: 0, repathTimer: 0,
      passengers: isTransport(type) ? [] : undefined,
    };
    this.entities.push(e); this.entityMap.set(e.id, e);
    if (e.kind === 'building') { this.rebuildBlocked(); this.updatePower(); }
    if (d.harvest && (!this.bootcamp || owner === this.localPlayerId)) this.assignHarvest(e);
    return e;
  }
  private onBuildingComplete(e: Entity) {
    const p = this.getPlayer(e.owner)!;
    const d = getDefinition(e.type);
    this.effect({ kind: 'deploy', x: e.x, y: e.y, duration: 1, color: p.color, radius: 2 });
    this.event(`${d.name}建造完成。`, p.id, 'complete');
    if (e.type === 'refinery' || e.type === 'soviet_refinery') {
      const type = this.bootcamp ? 'war_miner' : p.faction === 'allied' ? 'chrono_miner' : 'war_miner';
      const pos = this.bootcamp ? this.trainingSpawn(e.owner, getDefinition(type)) : this.exitPosition(e, getDefinition(type));
      if (pos) this.spawnEntity(type, e.owner, pos.x, pos.y);
    }
    for (const [key, value] of Object.entries(abilities)) {
      if (value.building === e.type && (key !== 'paradrop' || p.country === 'america')) p.abilityCooldowns[key] = value.duration;
    }
    this.updateFog();
  }

  deploy(ids: number[]): number {
    let deployed = 0;
    for (const id of ids) {
      const e = this.getEntity(id);
      if (!e || e.hp <= 0 || e.transportedBy) continue;
      const d = getDefinition(e.type);
      if (d.deploysTo) {
        const target = getDefinition(d.deploysTo);
        const position = this.findDeployPosition(e, target, e.id, 3);
        if (!position) { this.lastMessage = '附近空间不足，请将基地车移动到开阔区域'; continue; }
        const b = this.getPlacementBounds(target.id, position.x, position.y);
        const healthRatio = e.hp / e.maxHp;
        e.type = target.id; e.kind = 'building'; e.x = b.centerX; e.y = b.centerY;
        e.maxHp = target.hp; e.hp = target.hp * healthRatio; e.order = { kind: 'idle' }; e.path = []; e.waypoints = [];
        this.rebuildBlocked(); this.updatePower();
        this.onBuildingComplete(e); deployed++;
      } else if (e.type === 'gi' || e.type === 'desolator') {
        e.deployed = !e.deployed; e.order = { kind: 'idle' }; e.path = []; e.waypoints = []; deployed++;
        if (e.type === 'desolator' && e.deployed) e.radiationUntil = this.time + 12;
      } else if (e.type === 'yuri' && e.cooldown <= 0) {
        this.psychicPulse(e, 250, 3); e.cooldown = 4; deployed++;
      } else if (e.type.includes('construction_yard')) {
        if (this.bootcamp) { this.lastMessage = '训练营尚无基地车的 3D 模型'; continue; }
        const target = getDefinition(e.type === 'construction_yard' ? 'allied_mcv' : 'soviet_mcv');
        const ratio = e.hp / e.maxHp;
        e.type = target.id; e.kind = 'unit'; e.maxHp = target.hp; e.hp = target.hp * ratio;
        e.order = { kind: 'idle' }; e.path = []; e.waypoints = [];
        this.rebuildBlocked(); this.updatePower(); this.updateFog(); deployed++;
        this.event('建造厂已收起为基地车。', e.owner);
      } else if (isTransport(e.type)) deployed += this.unload([e.id]);
    }
    return deployed;
  }
  private findDeployPosition(point: Point, def: Definition, ignoreId?: number, radius = 8): Point | undefined {
    for (let r = 0; r <= radius; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (r && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
      const x = Math.floor(point.x) + dx + .5, y = Math.floor(point.y) + dy + .5;
      if (this.footprintClear(def, x, y, ignoreId)) return { x, y };
    }
    return undefined;
  }

  setRallyPoint(ids: number[], x: number, y: number, owner: number): number {
    if (!Number.isFinite(x) || !Number.isFinite(y) || this.terrainAt(x, y) === 'void') return 0;
    let updated = 0;
    for (const id of ids) {
      const e = this.getEntity(id);
      if (!e || e.hp <= 0 || e.owner !== owner || e.kind !== 'building') continue;
      const producer = getDefinition(e.type).producer;
      if (!producer || producer === 'structure') continue;
      e.rallyPoint = { x, y };
      updated++;
    }
    return updated;
  }

  commandMove(ids: number[], x: number, y: number, attackMove = false, append = false): void {
    const movable = ids.map(id => this.getEntity(id)).filter((e): e is Entity => !!e && e.kind === 'unit' && !e.transportedBy);
    const columns = Math.ceil(Math.sqrt(movable.length));
    movable.forEach((e, index) => {
      const dx = movable.length > 1 ? (index % columns - (columns - 1) / 2) * 1.15 : 0;
      const dy = movable.length > 1 ? (Math.floor(index / columns) - (columns - 1) / 2) * 1.15 : 0;
      const dest = this.nearestPassable({ x: x + dx, y: y + dy }, getDefinition(e.type), 8);
      if(append&&(e.order.kind==='move'||e.order.kind==='attackMove')){(e.waypoints??=[]).push(dest);return;}
      e.deployed = false; e.targetId = undefined;
      this.setOrder(e, { kind: attackMove ? 'attackMove' : 'move', x: dest.x, y: dest.y });
      if (!append && getDefinition(e.type).harvest && (this.terrainAt(x, y) === 'ore' || this.terrainAt(x, y) === 'gem')) this.setOrder(e, { kind: 'harvest', x, y });
    });
  }
  commandAttackMove(ids: number[], x: number, y: number): void { this.commandMove(ids, x, y, true); }
  commandAttack(ids: number[], targetId: number): void {
    const target = this.getEntity(targetId);
    if (!target || target.hp <= 0) return;
    for (const id of ids) {
      const e = this.getEntity(id);
      if (!e || e.id === targetId || e.transportedBy) continue;
      if (this.isAllied(e.owner, target.owner) && isTransport(target.type)) { this.load([id], targetId); continue; }
      if (e.type === 'crazy_ivan' && !this.isAllied(e.owner, target.owner)) { this.setOrder(e, { kind: 'demolish', targetId }); continue; }
      if (e.type === 'ifv' && this.getUnitMode(e) === 'repair' && this.isAllied(e.owner, target.owner) && target.kind === 'unit') {
        this.setOrder(e, { kind: 'repairUnit', targetId }); continue;
      }
      if (e.type.includes('engineer') || e.type === 'spy') {
        if (target.kind === 'building' || (target.bomb && this.isAllied(e.owner, target.owner))) this.setOrder(e, { kind: 'capture', targetId });
        continue;
      }
      if (this.isAllied(e.owner, target.owner)) {
        if (getDefinition(e.type).harvest && target.type.includes('refinery')) this.setOrder(e, { kind: 'return', targetId });
        continue;
      }
      if ((getDefinition(e.type).damage ?? 0) <= 0) continue;
      e.deployed = false;
      this.setOrder(e, { kind: 'attack', targetId });
    }
  }
  commandStop(ids: number[]): void {
    for (const id of ids) { const e = this.getEntity(id); if (e) { this.setOrder(e, { kind: 'idle' }); e.targetId = undefined; } }
  }
  private setOrder(e: Entity, order: Order) { e.waypoints = []; e.order = order; e.path = []; e.repathTimer = 0; }

  load(ids: number[], transportId: number): number {
    const transport = this.getEntity(transportId);
    if (!transport || !isTransport(transport.type)) return 0;
    let count = 0;
    for (const id of ids) {
      const e = this.getEntity(id);
      if (!e || e.id === transport.id || e.kind !== 'unit' || getDefinition(e.type).flying || getDefinition(e.type).naval || !this.isAllied(e.owner, transport.owner)) continue;
      const def = getDefinition(e.type), transportDef = getDefinition(transport.type);
      if (transportDef.infantryOnly && def.category !== 'infantry') continue;
      if (this.passengerSpaceUsed(transport) + this.passengerSize(e) > (transportDef.transportCapacity ?? 0)) break;
      if (distance(e, transport) > 3) { this.setOrder(e, { kind: 'load', targetId: transportId }); this.lastMessage = '部队正在靠近运输载具'; continue; }
      transport.passengers ??= []; transport.passengers.push(id);
      if (e.controlledId) this.releaseMindControl(e);
      e.transportedBy = transport.id; e.order = { kind: 'idle' }; e.path = []; e.waypoints = []; count++;
      this.refreshIFV(transport);
    }
    return count;
  }
  unload(ids: number[]): number {
    let count = 0;
    for (const id of ids) {
      const transport = this.getEntity(id);
      if (!transport?.passengers?.length) continue;
      const remaining: number[] = [];
      for (const passenger of transport.passengers) {
        const e = this.getEntity(passenger); if (!e) continue;
        const pos = this.nearestPassable(transport, getDefinition(e.type), 4);
        if (!this.isPassable(pos.x, pos.y, getDefinition(e.type)) || distance(pos, transport) > 5) { remaining.push(passenger); continue; }
        e.transportedBy = undefined; e.x = pos.x + this.random() * .3; e.y = pos.y + this.random() * .3; count++;
      }
      transport.passengers = remaining;
      this.refreshIFV(transport);
      if (remaining.length) this.lastMessage = '需要靠近海岸才能卸载';
    }
    return count;
  }
  private passengerSize(e: Entity) { return getDefinition(e.type).category === 'infantry' ? 1 : 3; }
  private passengerSpaceUsed(e: Entity) { return (e.passengers ?? []).reduce((sum, id) => { const unit = this.getEntity(id); return sum + (unit ? this.passengerSize(unit) : 0); }, 0); }
  private refreshIFV(e: Entity) {
    if (e.type !== 'ifv') return;
    const occupant = this.getEntity(e.passengers?.[0] ?? -1);
    const modes: Record<string, number> = { allied_engineer: 1, soviet_engineer: 1, flak_trooper: 3, rocketeer: 3, tanya: 4, sniper: 5, tesla_trooper: 6, crazy_ivan: 7, yuri: 8, desolator: 9, chrono_legionnaire: 10, terrorist: 11 };
    e.ifvMode = occupant ? (modes[occupant.type] ?? 2) : 0;
    e.weaponMode = ['missile', 'repair', 'machinegun', 'flak', 'pistol', 'sniper', 'tesla', 'ivan', 'psychic', 'radiation', 'chrono', 'terrorist'][e.ifvMode];
    e.turretIndex = [0, 2, 1, 1, 1, 1, 3, 3, 3, 3, 3, 3][e.ifvMode];
    e.targetId = undefined; e.cooldown = Math.min(e.cooldown, .5);
  }
  getUnitMode(entityOrId: Entity | number): string {
    const e = typeof entityOrId === 'number' ? this.getEntity(entityOrId) : entityOrId;
    if (!e) return '';
    return e.type === 'ifv' ? (e.weaponMode ?? 'missile') : '';
  }
  /** Native IFV passenger weapon slots from original rules.ini. */
  getCombatDefinition(e: Entity): Definition {
    const base = getDefinition(e.type);
    if (e.type !== 'ifv' || !e.passengers?.length) return base;
    const common = { ...base, antiAir: false };
    switch (this.getUnitMode(e)) {
      case 'repair': return { ...common, damage: 0, range: 2, cooldown: 1 };
      case 'machinegun': return { ...common, damage: 20, range: 6, cooldown: .5, weapon: 'bullet' };
      case 'flak': return { ...common, damage: 25, range: 6, cooldown: .7, weapon: 'shell', antiAir: true };
      case 'pistol': return { ...common, damage: 85, range: 6, cooldown: .5, weapon: 'bullet' };
      case 'sniper': return { ...common, damage: 125, range: 14, cooldown: 2, weapon: 'bullet' };
      case 'tesla': return { ...common, damage: 60, range: 6, cooldown: 1.5, weapon: 'tesla' };
      case 'ivan': return { ...common, damage: 200, range: 1, cooldown: 1, weapon: 'explosive' };
      case 'psychic': return { ...common, damage: 200, range: 1.5, cooldown: 1.5, weapon: 'tesla' };
      case 'radiation': return { ...common, damage: 175, range: 7, cooldown: 1, weapon: 'radiation' };
      case 'chrono': return { ...common, damage: 140, range: 6, cooldown: 2.5, weapon: 'tesla' };
      case 'terrorist': return { ...common, damage: 250, range: 1.5, cooldown: 1, weapon: 'explosive' };
      default: return common;
    }
  }

  repair(entityId: number): boolean {
    const e = this.getEntity(entityId);
    if (!e || e.kind !== 'building' || e.hp <= 0) return false;
    e.repairing = !e.repairing;
    return true;
  }
  sell(entityId: number): boolean {
    const e = this.getEntity(entityId);
    if (!e || e.kind !== 'building' || e.hp <= 0 || this.status !== 'playing' || getDefinition(e.type).unsellable) return false;
    const p = this.getPlayer(e.owner)!;
    const refund = Math.round(getDefinition(e.type).cost * .5 * e.hp / e.maxHp);
    p.credits += refund;
    this.removeEntity(e, false);
    this.event(`建筑已出售，回收 $${refund}。`, e.owner);
    return true;
  }
  surrender(playerId = this.localPlayerId): void {
    const p = this.getPlayer(playerId); if (!p) return;
    for (const e of [...this.entities]) if (e.owner === playerId) this.removeEntity(e, false);
    p.defeated = true;
    this.event(`${p.name}已投降。`, playerId, 'warning');
    this.checkVictory(true);
  }

  getSupport(playerId: number): { id: string; name: string; remaining: number; total: number; ready: boolean }[] {
    const p = this.getPlayer(playerId); if (!p || this.bootcamp) return [];
    return Object.entries(abilities).filter(([id, a]) => id === 'paradrop' ? (this.has(playerId, 'neutral_caairp') || (this.has(playerId, a.building!) && p.country === 'america')) : this.has(playerId, a.building!))
      .map(([id, a]) => ({ id, name: a.name, remaining: p.abilityCooldowns[id] ?? a.duration, total: a.duration, ready: (p.abilityCooldowns[id] ?? a.duration) <= 0 && this.isPowered(playerId) }));
  }
  support(playerId: number, kind: string, x: number, y: number, ids: number[] = []): boolean {
    const ability = this.getSupport(playerId).find(a => a.id === kind), p = this.getPlayer(playerId);
    if (!ability?.ready || !p || this.status !== 'playing') { this.lastMessage = '支援尚未就绪'; return false; }
    if (this.terrainAt(x, y) === 'void') return false;
    if (kind === 'paradrop') {
      for (let i = 0; i < 8; i++) {
        const pos = this.nearestPassable({ x: x + i % 3 - 1, y: y + Math.floor(i / 3) - 1 }, getDefinition('gi'));
        this.spawnEntity('gi', playerId, pos.x, pos.y);
      }
      this.effect({ kind: 'deploy', x, y, duration: 2, radius: 4, color: p.color });
    } else if (kind === 'chronosphere') {
      const selected = ids.length ? ids.map(id => this.getEntity(id)).filter((e): e is Entity => !!e) : this.ownEntities(playerId).filter(e => e.kind === 'unit' && distance(e, p.spawn) < 14);
      selected.filter(e => e.owner === playerId && e.kind === 'unit' && !getDefinition(e.type).flying && !e.transportedBy).slice(0, 9).forEach((e, i) => {
        const pos = this.nearestPassable({ x: x + i % 3, y: y + Math.floor(i / 3) }, getDefinition(e.type));
        e.x = pos.x; e.y = pos.y; this.setOrder(e, { kind: 'idle' });
      });
      this.effect({ kind: 'deploy', x, y, duration: 2, radius: 5, color: '#66eaff' });
    } else if (kind === 'ironCurtain') {
      this.ownEntities(playerId).filter(e => e.kind === 'unit' && getDefinition(e.type).armor !== 'none' && distance(e, { x, y }) <= 5).forEach(e => e.invulnerableUntil = this.time + 20);
      this.effect({ kind: 'deploy', x, y, duration: 2, radius: 5, color: '#ff3434' });
    } else {
      const radius = kind === 'nuke' ? 12 : 10, damage = kind === 'nuke' ? 1800 : 1350;
      this.effect({ kind: 'nuke', x, y, duration: 3.5, radius, color: kind === 'nuke' ? '#ffd24a' : '#99ddff' });
      for (const e of [...this.entities]) {
        const dist = distance(e, { x, y });
        if (dist < radius) this.damage(e, damage * (1 - dist / (radius * 1.3)), playerId);
      }
    }
    p.abilityCooldowns[kind] = abilities[kind].duration;
    this.event(`${p.name}：${ability.name}已启动！`, playerId, 'combat');
    return true;
  }

  /** dt is wall-clock seconds. Large calls are sub-stepped to keep movement/combat stable. */
  step(dt: number): void {
    if (this.paused || this.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    let remaining = Math.min(dt, 5) * clamp(this.speed, .25, 4);
    while (remaining > .00001 && this.status === 'playing') {
      const delta = Math.min(.1, remaining); remaining -= delta;
      this.tick(delta);
    }
  }
  private tick(dt: number) {
    this.time += dt;
    if (this.bootcamp && !this.debugAdjustedCredits.has(this.localPlayerId)) this.getPlayer()!.credits = BOOTCAMP_CREDITS;
    this.visibilityTimer -= dt; this.economyTimer -= dt;
    if (this.visibilityTimer <= 0) { this.visibilityTimer = .4; this.updateFog(); this.rebuildSpatial(); }
    if (this.economyTimer <= 0) { this.economyTimer = 1; this.updatePower(); this.checkVictory(); }
    for (const p of this.players) {
      if (p.defeated) continue;
      this.advanceProduction(p, dt);
      if (this.isPowered(p.id)) for (const key of Object.keys(p.abilityCooldowns)) p.abilityCooldowns[key] = Math.max(0, p.abilityCooldowns[key] - dt);
      const support = this.getSupport(p.id);
      p.supportCooldown = support.length ? Math.min(...support.map(a => a.remaining)) : 0;
      if (p.ai && !this.bootcamp) { p.aiTimer -= dt; p.aiAttackTimer -= dt; if (p.aiTimer <= 0) { p.aiTimer = p.difficulty === 'easy' ? 4 : p.difficulty === 'hard' ? 1.4 : 2.5; this.runAI(p); } }
    }
    for (const e of [...this.entities]) {
      if (e.hp <= 0) continue;
      if (this.bootcamp && e.owner !== this.localPlayerId) continue;
      if (e.bomb && e.bomb.detonatesAt <= this.time) this.detonateBomb(e);
      if (e.hp <= 0) continue;
      if (e.transportedBy) { const transport = this.getEntity(e.transportedBy); if (transport) { e.x = transport.x; e.y = transport.y; } continue; }
      e.cooldown = Math.max(0, e.cooldown - dt); e.repathTimer = Math.max(0, e.repathTimer - dt);
      const previousX=e.x,previousY=e.y;
      if (e.kind === 'building') this.updateBuilding(e, dt);
      else this.updateUnit(e, dt);
      if(e.x!==previousX||e.y!==previousY)e.lastMovedAt=this.time;
    }
    this.separateUnits(dt);
    for (const effect of this.effects) effect.age += dt;
    this.effects = this.effects.filter(e => e.age < e.duration);
  }

  private advanceProduction(p: PlayerState, dt: number) {
    for (const category of CATEGORIES) {
      const item = p.queues[category][0]; if (!item || item.ready) continue;
      const d = getDefinition(item.type);
      const producer = d.kind === 'building' ? this.has(p.id, 'yard') : this.entities.some(e => e.owner === p.id && getDefinition(e.type).producer === category);
      if (!producer && !this.bootcamp) continue;
      if (this.bootcamp && !bootcampTypes.has(item.type)) { p.queues[category].shift(); continue; }
      const producers = Math.min(3, this.entities.filter(e => e.owner === p.id && getDefinition(e.type).producer === category).length);
      const powered = this.isPowered(p.id) ? 1 : .35;
      const difficulty = !p.ai ? 1 : p.difficulty === 'easy' ? .75 : p.difficulty === 'hard' ? 1.15 : 1;
      item.progress = this.getDebugInstantProduction(p.id) ? 1
        : Math.min(1, item.progress + dt / item.duration * powered * difficulty * (1 + Math.max(0, producers - 1) * .2));
      if (item.progress < 1) continue;
      if (d.kind === 'building') { item.ready = true; this.event(`${d.name}已就绪，请选择放置位置。`, p.id, 'complete'); }
      else {
        const factory = this.entities.find(e => e.owner === p.id && getDefinition(e.type).producer === category);
        if (!factory && !this.bootcamp) continue;
        const pos = this.bootcamp ? this.trainingSpawn(p.id, d) : this.exitPosition(factory!, d);
        if (!pos) continue;
        const e = this.spawnEntity(d.id, p.id, pos.x, pos.y);
        p.queues[category].shift(); p.unitsBuilt++;
        const rallyPoint = factory?.rallyPoint ?? (factory && !d.harvest && !this.bootcamp ? { x: factory.x + 4, y: factory.y + 5 } : undefined);
        if (rallyPoint) {
          const rally = this.nearestPassable(rallyPoint, d);
          this.setOrder(e, { kind: 'move', x: rally.x, y: rally.y });
        }
        this.event(`${d.name}训练完成。`, p.id, 'complete');
      }
    }
  }
  private updateBuilding(e: Entity, dt: number) {
    const d = getDefinition(e.type), p = this.getPlayer(e.owner)!;
    if (e.owner < 0) return;
    if (d.income) {
      e.harvestTimer += dt;
      while (e.harvestTimer >= (d.incomeInterval ?? 1)) { e.harvestTimer -= d.incomeInterval ?? 1; p.credits += d.income; }
    }
    if (e.type === 'neutral_cahosp') for (const unit of this.entities) {
      if (unit.owner === e.owner && getDefinition(unit.type).category === 'infantry') unit.hp = Math.min(unit.maxHp, unit.hp + 3 * dt);
    }
    if (e.repairing && e.hp < e.maxHp && p.credits > 0) {
      const amount = Math.min(e.maxHp - e.hp, e.maxHp * .025 * dt, p.credits / (d.cost / e.maxHp * .5));
      e.hp += amount; p.credits -= amount * d.cost / e.maxHp * .5;
    }
    if (e.hp >= e.maxHp) e.repairing = false;
    if (e.type.includes('repair_depot') || e.type === 'neutral_caoutp') for (const unit of this.nearby(e.x, e.y, 5)) {
      if (unit.owner === e.owner && unit.kind === 'unit' && getDefinition(unit.type).armor === 'heavy' && distance(unit, e) < 5) unit.hp = Math.min(unit.maxHp, unit.hp + 20 * dt);
    }
    if (d.damage && ((d.power ?? 0) >= 0 || this.isPowered(e.owner))) this.combat(e, dt);
  }
  private finishMove(e:Entity) {
    const next=e.waypoints?.shift();e.order=next?{kind:'move',...next}:{kind:'idle'};e.path=[];e.repathTimer=0;
  }
  private updateUnit(e: Entity, dt: number) {
    const d = getDefinition(e.type);
    if (e.type === 'apocalypse' && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + 3 * dt);
    if (e.type === 'desolator' && e.deployed) {
      e.harvestTimer += dt;
      if (e.harvestTimer >= 1) {
        e.harvestTimer = 0;
        this.effect({ kind: 'radiation', x: e.x, y: e.y, duration: 1.5, radius: 4, color: '#80ff44' });
        for (const target of this.nearby(e.x, e.y, 4)) if (target.kind === 'unit' && !getDefinition(target.type).flying && !this.isAllied(e.owner, target.owner) && distance(e, target) < 4) this.damage(target, 45, e.owner, e);
      }
    }
    if (e.order.kind === 'load') {
      const transport = this.getEntity(e.order.targetId);
      if (!transport || this.passengerSpaceUsed(transport) + this.passengerSize(e) > (getDefinition(transport.type).transportCapacity ?? 0)) this.setOrder(e, { kind: 'idle' });
      else if (distance(e, transport) <= 3) this.load([e.id], transport.id);
      else this.moveToward(e, transport, dt);
      return;
    }
    if (d.harvest) { this.updateHarvester(e, dt); if (d.damage) this.combat(e, dt, false); return; }
    if (e.order.kind === 'demolish') { this.updateDemolition(e, dt); return; }
    if (e.order.kind === 'capture') { this.updateCapture(e, dt); return; }
    if (e.type === 'ifv' && this.getUnitMode(e) === 'repair' && e.order.kind !== 'move' && e.order.kind !== 'attackMove') { this.updateRepairIFV(e, dt); return; }
    let fighting = false;
    if (e.order.kind !== 'move' && !e.type.includes('engineer') && e.type !== 'spy') fighting = this.combat(e, dt);
    if (fighting && e.order.kind !== 'move') return;
    if (e.order.kind === 'move' || e.order.kind === 'attackMove') {
      const goal = { x: e.order.x, y: e.order.y };
      this.moveToward(e, goal, dt);
      if (distance(e, goal) < .4) this.finishMove(e);
    }
  }
  private updateCapture(e: Entity, dt: number) {
    if (e.order.kind !== 'capture') return;
    const target = this.getEntity(e.order.targetId);
    if (!target || target.hp <= 0) { this.setOrder(e, { kind: 'idle' }); return; }
    const def = getDefinition(target.type), size = def.size ?? [0, 0];
    if (def.neutral && !def.capturable) { this.setOrder(e, { kind: 'idle' }); this.lastMessage = '这座民用建筑无法占领'; return; }
    const edgeDistance = Math.hypot(Math.max(0, Math.abs(e.x - target.x) - size[0] / 2), Math.max(0, Math.abs(e.y - target.y) - size[1] / 2));
    if (edgeDistance > 1.5) { this.moveToward(e, target, dt); return; }
    const p = this.getPlayer(e.owner)!;
    if (target.bomb && e.type.includes('engineer') && this.isAllied(e.owner, target.owner)) {
      target.bomb = undefined; this.setOrder(e, { kind: 'idle' });
      this.event('工程师已拆除定时炸弹。', e.owner, 'complete');
      return;
    }
    if (e.type === 'spy') {
      if (this.isAllied(e.owner, target.owner)) { this.setOrder(e, { kind: 'idle' }); return; }
      const victim = this.getPlayer(target.owner)!;
      const theft = Math.min(victim.credits, 2000); victim.credits -= theft; p.credits += theft;
      this.event(`间谍渗透成功，获取 $${Math.floor(theft)}。`, e.owner, 'complete');
    } else if (this.isAllied(e.owner, target.owner)) {
      target.hp = target.maxHp;
      this.event('工程师已修复建筑。', e.owner, 'complete');
    } else {
      if (target.owner < 0 && def.income) p.credits += 1000;
      target.owner = e.owner; target.hp = Math.max(target.hp, target.maxHp * .5);
      if (target.type === 'neutral_caairp') p.abilityCooldowns.paradrop = abilities.paradrop.duration;
      for (const [key, value] of Object.entries(abilities)) if (value.building === target.type && (key !== 'paradrop' || p.country === 'america')) p.abilityCooldowns[key] = value.duration;
      this.event(`已占领${def.name}。`, e.owner, 'complete');
    }
    this.removeEntity(e, false); this.updatePower(); this.updateFog();
  }

  private updateDemolition(e: Entity, dt: number) {
    if (e.order.kind !== 'demolish') return;
    const target = this.getEntity(e.order.targetId);
    if (!target || target.hp <= 0 || target.bomb || this.isAllied(e.owner, target.owner) || getDefinition(target.type).flying) { this.setOrder(e, { kind: 'idle' }); return; }
    const size = getDefinition(target.type).size ?? [0, 0];
    const edgeDistance = Math.hypot(Math.max(0, Math.abs(e.x - target.x) - size[0] / 2), Math.max(0, Math.abs(e.y - target.y) - size[1] / 2));
    if (edgeDistance > 1.5) { this.moveToward(e, target, dt); return; }
    if (e.cooldown > 0) return;
    target.bomb = { detonatesAt: this.time + 30, owner: e.owner, sourceId: e.id, damage: 400 };
    e.cooldown = 3.3; e.lastShot = this.time;
    this.effect({ kind: 'text', x: target.x, y: target.y, duration: 3, text: '⏱ 30', color: '#ff7755' });
    this.event('疯狂伊文：定时炸弹已安放。', e.owner, 'combat');
    this.setOrder(e, { kind: 'idle' });
  }
  private detonateBomb(target: Entity) {
    const bomb = target.bomb; if (!bomb) return;
    target.bomb = undefined;
    const position = { x: target.x, y: target.y };
    this.effect({ kind: 'explosion', ...position, duration: 1.4, radius: 3, color: '#ffb32c' });
    const source = this.getEntity(bomb.sourceId);
    if (target.hp > 0) this.damage(target, bomb.damage, bomb.owner, source);
    for (const other of [...this.entities]) {
      const dist = distance(position, other);
      if (other.id !== target.id && dist < 2.5) this.damage(other, bomb.damage * .6 * (1 - dist / 3.5), bomb.owner, source);
    }
  }
  private updateRepairIFV(e: Entity, dt: number) {
    let target = e.order.kind === 'repairUnit' ? this.getEntity(e.order.targetId) : undefined;
    const repairable = (other: Entity) => other.id !== e.id && this.isAllied(e.owner, other.owner) && other.kind === 'unit' && getDefinition(other.type).armor !== 'none' && !getDefinition(other.type).flying && other.hp > 0 && other.hp < other.maxHp;
    if (target && !repairable(target)) { this.setOrder(e, { kind: 'idle' }); target = undefined; }
    if (!target) target = this.nearby(e.x, e.y, 5).filter(repairable).sort((a, b) => distance(e, a) - distance(e, b))[0];
    if (!target) return;
    if (distance(e, target) > 2.2) { if (e.order.kind === 'repairUnit') this.moveToward(e, target, dt); return; }
    target.hp = Math.min(target.maxHp, target.hp + 35 * dt);
    e.angle = Math.atan2(target.y - e.y, target.x - e.x);
    if (e.cooldown <= 0) {
      e.cooldown = 1; e.lastShot = this.time;
      this.effect({ kind: 'shot', x: e.x, y: e.y, toX: target.x, toY: target.y, duration: .3, weapon: 'tesla', color: '#80efb0' });
    }
  }
  private mindControl(controller: Entity, target: Entity) {
    if (!this.canAttack(controller, target)) return;
    this.releaseMindControl(controller);
    if (target.controlledBy) { const previous = this.getEntity(target.controlledBy); if (previous) this.releaseMindControl(previous); }
    target.originalOwner = target.owner; target.owner = controller.owner; target.controlledBy = controller.id;
    controller.controlledId = target.id; controller.order = { kind: 'idle' }; controller.path = []; controller.targetId = undefined;
    this.setOrder(target, { kind: 'idle' }); target.targetId = undefined;
    this.effect({ kind: 'shot', x: controller.x, y: controller.y, toX: target.x, toY: target.y, duration: 1, weapon: 'tesla', color: '#dd88ff' });
    this.event(`尤里已控制${getDefinition(target.type).name}。`, controller.owner, 'combat');
    this.updateFog();
  }
  private releaseMindControl(controller: Entity) {
    const target = this.getEntity(controller.controlledId ?? -1);
    controller.controlledId = undefined;
    if (!target || target.controlledBy !== controller.id) return;
    if (target.originalOwner !== undefined) target.owner = target.originalOwner;
    target.originalOwner = undefined; target.controlledBy = undefined;
    this.setOrder(target, { kind: 'idle' }); target.targetId = undefined;
  }
  private psychicPulse(e: Entity, damage: number, radius: number) {
    this.effect({ kind: 'deploy', x: e.x, y: e.y, duration: 1, radius, color: '#e091ff' });
    e.lastShot = this.time;
    for (const other of [...this.entities]) {
      const d = getDefinition(other.type);
      if (other.kind === 'unit' && d.category === 'infantry' && !d.flying && !d.mindControlImmune && !this.isAllied(e.owner, other.owner) && distance(e, other) < radius) this.damage(other, damage, e.owner, e);
    }
  }

  private canAttack(attacker: Entity, target: Entity): boolean {
    const d = this.getCombatDefinition(attacker), t = getDefinition(target.type);
    if (target.hp <= 0 || target.transportedBy || this.isAllied(attacker.owner, target.owner) || !d.damage) return false;
    if (target.owner < 0 && !(attacker.order.kind === 'attack' && attacker.order.targetId === target.id)) return false;
    if (t.flying && !d.antiAir) return false;
    if (!t.flying && d.canAttackGround === false) return false;
    if ((attacker.type.includes('dog') || attacker.type === 'sniper') && target.kind === 'building') return false;
    if (attacker.type.includes('dog') && t.armor !== 'none') return false;
    if (['submarine', 'dolphin', 'giant_squid'].includes(attacker.type) && !t.naval) return false;
    if (attacker.type === 'yuri' && (target.kind !== 'unit' || t.flying || t.harvest || t.mindControlImmune || target.type === 'terror_drone' || (target.invulnerableUntil ?? 0) > this.time)) return false;
    if (attacker.type === 'crazy_ivan' && target.bomb) return false;
    return true;
  }
  private combat(e: Entity, dt: number, chase = true): boolean {
    if (this.bootcamp && e.owner !== this.localPlayerId) return false;
    if (e.holdFire && e.order.kind !== 'attack') return false;
    const d = this.getCombatDefinition(e);
    if (!d.damage) return false;
    if (e.type === 'yuri' && e.controlledId && e.order.kind !== 'attack') return false;
    let target = e.order.kind === 'attack' ? this.getEntity(e.order.targetId) : e.targetId ? this.getEntity(e.targetId) : undefined;
    if (target && (!this.canAttack(e, target) || !this.visible(e.owner, target.x, target.y))) target = undefined;
    const range = (d.range ?? 0) + (e.type === 'gi' && e.deployed ? 2 : 0) + (e.veteran >= 2 ? .7 : 0);
    if (target && e.order.kind !== 'attack' && distance(e, target) > range + 3) target = undefined;
    if (!target && e.order.kind !== 'attack') {
      let best = Infinity;
      for (const candidate of this.nearby(e.x, e.y, Math.max(d.sight, range) + 2)) {
        if (!this.canAttack(e, candidate) || !this.visible(e.owner, candidate.x, candidate.y)) continue;
        const dist = distance(e, candidate);
        if (dist > (e.kind === 'building' ? range + 1 : d.sight)) continue;
        const score = dist + (candidate.kind === 'building' ? 2 : 0);
        if (score < best) { best = score; target = candidate; }
      }
    }
    if (!target) {
      e.targetId = undefined;
      if (e.order.kind === 'attack') {
        const wanted = this.getEntity(e.order.targetId);
        if (!wanted || wanted.hp <= 0) this.setOrder(e, { kind: 'idle' });
        else if (chase && e.kind === 'unit' && !e.deployed) this.moveToward(e, wanted, dt);
      }
      return e.order.kind === 'attack';
    }
    e.targetId = target.id;
    const targetRadius = target.kind === 'building' ? Math.min(...(getDefinition(target.type).size ?? [1, 1])) / 2 : .3;
    if (distance(e, target) > range + targetRadius) {
      if (chase && e.kind === 'unit' && !e.deployed) this.moveToward(e, target, dt);
      return chase;
    }
    e.angle = Math.atan2(target.y - e.y, target.x - e.x);
    if (e.cooldown > 0) return true;
    e.cooldown = (d.cooldown ?? 1) * (e.veteran >= 2 ? .8 : 1);
    e.lastShot = this.time;
    if (e.type === 'yuri') { this.mindControl(e, target); return true; }
    if (e.type === 'crazy_ivan') { this.setOrder(e, { kind: 'demolish', targetId: target.id }); return true; }
    if (e.type === 'ifv' && this.getUnitMode(e) === 'psychic') { this.psychicPulse(e, 200, 3); return true; }
    let damage = d.damage * (1 + e.veteran * .2) * (e.type === 'gi' && e.deployed ? 1.7 : 1);
    const armor = getDefinition(target.type).armor;
    if (d.weapon === 'bullet') damage *= armor === 'heavy' ? .25 : armor === 'building' ? .35 : 1;
    if (d.weapon === 'shell') damage *= armor === 'none' ? .6 : 1;
    if (e.type === 'tank_destroyer') damage *= armor === 'heavy' ? 1.65 : .25;
    if (e.type === 'sniper' || (e.type === 'ifv' && this.getUnitMode(e) === 'sniper')) damage *= armor === 'none' ? 1 : .08;
    if (e.type === 'tanya' && target.kind === 'building') damage *= 3;
    if (e.type === 'terror_drone') damage *= armor === 'heavy' ? 1.7 : 1;
    if (e.type === 'terrorist' || e.type === 'demolition_truck' || (e.type === 'ifv' && ['ivan', 'terrorist'].includes(this.getUnitMode(e)))) {
      const radius = e.type === 'demolition_truck' ? 7 : e.type === 'ifv' ? 4 : 3;
      this.effect({ kind: 'explosion', x: e.x, y: e.y, duration: 1.5, radius, color: '#ffde49' });
      for (const other of [...this.entities]) if (other.id !== e.id && distance(e, other) < radius) this.damage(other, damage * (1 - distance(e, other) / (radius * 1.4)), e.owner, e);
      this.removeEntity(e, false);
      return true;
    }
    this.effect({ kind: 'shot', sourceId: e.id, targetId: target.id, x: e.x, y: e.y, toX: target.x, toY: target.y, duration: d.weapon === 'tesla' ? .22 : .3, weapon: d.weapon, color: this.getPlayer(e.owner)?.color });
    this.damage(target, damage, e.owner, e);
    if ((d.weapon === 'radiation' || e.type === 'prism_tank' || e.type === 'v3' || e.type === 'grand_cannon') && target.hp > 0) {
      for (const other of this.nearby(target.x, target.y, 2)) if (other.id !== target.id && other.id !== e.id && !this.isAllied(e.owner, other.owner) && distance(other, target) < 2) this.damage(other, damage * .35, e.owner, e);
    }
    return true;
  }
  protected damage(target: Entity, amount: number, attackerOwner: number, attacker?: Entity) {
    if (target.hp <= 0 || (target.invulnerableUntil ?? 0) > this.time) return;
    target.hp -= amount;
    if (amount > 0) {
      target.lastHit = this.time;
      this.effect({kind: 'hit', x: target.x, y: target.y, targetId: target.id, sourceId: attacker?.id, duration: .4, weapon: attacker ? this.getCombatDefinition(attacker).weapon : undefined});
    }
    if (target.owner === this.localPlayerId && this.time - this.alarmAt > 10) {
      this.alarmAt = this.time; this.event(target.kind === 'building' ? '警告：我方基地正在遭受攻击！' : '我方部队正在遭受攻击！', target.owner, 'warning');
    }
    if (target.hp <= 0) {
      const killer = this.getPlayer(attackerOwner); if (killer && !this.isAllied(attackerOwner, target.owner)) killer.kills++;
      if (attacker && !this.isAllied(attacker.owner, target.owner)) { attacker.kills++; attacker.veteran = attacker.kills >= 8 ? 2 : attacker.kills >= 3 ? 1 : 0; }
      this.removeEntity(target, true);
    }
  }
  private removeEntity(e: Entity, destroyed: boolean) {
    if (!this.entityMap.has(e.id)) return;
    if (e.controlledId) this.releaseMindControl(e);
    if (e.controlledBy) {
      const controller = this.getEntity(e.controlledBy); if (controller?.controlledId === e.id) controller.controlledId = undefined;
    }
    if (destroyed) {
      this.effect({ kind: 'explosion', x: e.x, y: e.y, duration: e.kind === 'building' ? 1.5 : .65, radius: e.kind === 'building' ? 3 : 1 });
      const p = this.getPlayer(e.owner); if (p) p.losses++;
    }
    e.hp = 0;
    this.entityMap.delete(e.id); this.entities = this.entities.filter(other => other.id !== e.id);
    if (e.transportedBy) { const transport = this.getEntity(e.transportedBy); if (transport) { transport.passengers = transport.passengers?.filter(id => id !== e.id); this.refreshIFV(transport); } }
    for (const id of e.passengers ?? []) { const passenger = this.getEntity(id); if (passenger) this.removeEntity(passenger, destroyed); }
    if (e.kind === 'building') { this.rebuildBlocked(); this.updatePower(); }
    if (destroyed && e.bomb) this.detonateBomb(e);
    if (destroyed && e.type === 'nuclear_reactor') {
      this.effect({ kind: 'nuke', x: e.x, y: e.y, duration: 2, radius: 7 });
      for (const other of [...this.entities]) if (distance(e, other) < 7) this.damage(other, 650 * (1 - distance(e, other) / 9), e.owner);
    }
  }

  private isPassable(x: number, y: number, def: Definition): boolean {
    const tx = Math.floor(x), ty = Math.floor(y), terrain = this.terrainAt(tx, ty);
    if (terrain === 'void') return false;
    if (def.flying) return true;
    if (terrain === 'cliff') return false;
    if (def.amphibious) return !this.blocked[ty * this.map.width + tx];
    if (def.naval ? terrain !== 'water' : terrain === 'water') return false;
    return !this.blocked[ty * this.map.width + tx];
  }
  private nearestPassable(point: Point, def: Definition, radius = 18): Point {
    let best: Point | undefined, bestDistance = Infinity;
    for (let r = 0; r <= radius; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (r && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const p = { x: Math.floor(point.x) + dx + .5, y: Math.floor(point.y) + dy + .5 };
        if (!this.isPassable(p.x, p.y, def)) continue;
        const dist = distance(p, point);
        if (dist < bestDistance) { bestDistance = dist; best = p; }
      }
      if (best) return best;
    }
    return { x: clamp(point.x, .5, this.map.width - .5), y: clamp(point.y, .5, this.map.height - .5) };
  }
  private moveToward(e: Entity, goal: Point, dt: number) {
    const d = getDefinition(e.type); if (e.deployed) return;
    if (d.flying) {
      const dist = distance(e, goal);
      if (dist < .05) return;
      const move = Math.min(dist, (d.speed ?? 2) * dt);
      e.angle = Math.atan2(goal.y - e.y, goal.x - e.x);
      e.x += Math.cos(e.angle) * move; e.y += Math.sin(e.angle) * move;
      return;
    }
    if (!e.path.length && e.repathTimer <= 0) {
      e.path = findPath(this.map.width, this.map.height, e, goal, (x, y) => this.isPassable(x, y, d));
      e.repathTimer = e.path.length ? 1.5 : 3;
    }
    if (!e.path.length) return;
    let remaining = (d.speed ?? 2) * dt * (e.hp < e.maxHp * .3 ? .8 : 1);
    while (remaining > 0 && e.path.length) {
      const next = e.path[0];
      if (!this.isPassable(next.x, next.y, d)) { e.path = []; e.repathTimer = .1; break; }
      const dist = distance(e, next);
      e.angle = Math.atan2(next.y - e.y, next.x - e.x);
      if (dist <= remaining) { e.x = next.x; e.y = next.y; e.path.shift(); remaining -= dist; }
      else { e.x += Math.cos(e.angle) * remaining; e.y += Math.sin(e.angle) * remaining; remaining = 0; }
    }
  }
  private exitPosition(factory: Entity, unit: Definition): Point {
    const size = getDefinition(factory.type).size ?? [2, 2];
    return this.nearestPassable({ x: factory.x + size[0] / 2 + 1, y: factory.y + size[1] / 2 + 1 }, unit, 18);
  }

  private assignHarvest(e: Entity) {
    const d = getDefinition(e.type);
    if ((e.cargo ?? 0) >= (d.capacity ?? 700)) { this.assignReturn(e); return; }
    let best: Point | undefined, score = Infinity;
    const radius = 65, ex = Math.floor(e.x), ey = Math.floor(e.y);
    for (let y = Math.max(0, ey - radius); y < Math.min(this.map.height, ey + radius); y++) for (let x = Math.max(0, ex - radius); x < Math.min(this.map.width, ex + radius); x++) {
      const i = y * this.map.width + x;
      if (this.ore[i] <= 0 || !this.isPassable(x, y, d)) continue;
      const dist = Math.hypot(x - ex, y - ey) * (this.terrainAt(x, y) === 'gem' ? .8 : 1);
      if (dist < score) { score = dist; best = { x: x + .5, y: y + .5 }; }
    }
    if (best) this.setOrder(e, { kind: 'harvest', ...best });
    else if (e.cargo > 0) this.assignReturn(e);
    else this.setOrder(e, { kind: 'idle' });
  }
  private assignReturn(e: Entity) {
    let refinery: Entity | undefined, closest = Infinity;
    for (const other of this.entities) {
      if (other.owner !== e.owner || !other.type.includes('refinery')) continue;
      const dist = distance(e, other); if (dist < closest) { closest = dist; refinery = other; }
    }
    if (refinery) this.setOrder(e, { kind: 'return', targetId: refinery.id });
    else this.setOrder(e, { kind: 'idle' });
  }
  private updateHarvester(e: Entity, dt: number) {
    const d = getDefinition(e.type);
    if (e.order.kind === 'idle') { e.harvestTimer += dt; if (e.harvestTimer > 3) { e.harvestTimer = 0; this.assignHarvest(e); } return; }
    if (e.order.kind === 'move') { this.moveToward(e, e.order, dt); if (distance(e, e.order) < .5) this.finishMove(e); return; }
    if (e.order.kind === 'harvest') {
      const goal = { x: e.order.x, y: e.order.y };
      if (distance(e, goal) > 1) { this.moveToward(e, goal, dt); return; }
      const index = Math.floor(goal.y) * this.map.width + Math.floor(goal.x);
      if (this.ore[index] <= 0) { this.assignHarvest(e); return; }
      const amount = Math.min(this.ore[index], (d.capacity ?? 700) - e.cargo, (this.terrainAt(goal.x, goal.y) === 'gem' ? 200 : 110) * dt);
      this.ore[index] -= amount; e.cargo += amount;
      if (e.cargo >= (d.capacity ?? 700) - .1) this.assignReturn(e);
      return;
    }
    if (e.order.kind === 'return') {
      const target = this.getEntity(e.order.targetId);
      if (!target) { this.assignReturn(e); return; }
      const footprint = getDefinition(target.type).size ?? [3, 3];
      const edgeDistance = Math.hypot(Math.max(0, Math.abs(e.x - target.x) - footprint[0] / 2), Math.max(0, Math.abs(e.y - target.y) - footprint[1] / 2));
      if (edgeDistance > 2) {
        // Allied miners chronoshift home with a full load, retaining normal outward travel.
        if (e.type === 'chrono_miner') { const pos = this.exitPosition(target, d); e.x = pos.x; e.y = pos.y; }
        else { this.moveToward(e, target, dt); return; }
      }
      const p = this.getPlayer(e.owner)!;
      const value = Math.round(e.cargo * (this.has(e.owner, 'ore_purifier') ? 1.25 : 1));
      p.credits += value; e.cargo = 0;
      this.effect({ kind: 'text', x: target.x, y: target.y, duration: 1.8, text: `+$${value}`, color: '#ffe45b' });
      this.assignHarvest(e);
    }
  }

  private rebuildBlocked() {
    this.blocked.fill(0);
    for (const e of this.entities) {
      if (e.kind !== 'building' || e.hp <= 0) continue;
      const b = this.getPlacementBounds(e.type, e.x, e.y);
      for (let y = b.y; y < b.y + b.height; y++) for (let x = b.x; x < b.x + b.width; x++) if (x >= 0 && y >= 0 && x < this.map.width && y < this.map.height) this.blocked[y * this.map.width + x] = 1;
    }
  }
  private updatePower() {
    for (const p of this.players) { p.powerProduced = 0; p.powerConsumed = 0; }
    for (const e of this.entities) {
      if (e.kind !== 'building' || e.hp <= 0) continue;
      const p = this.getPlayer(e.owner); if (!p) continue;
      const power = getDefinition(e.type).power ?? 0;
      if (power > 0) p.powerProduced += Math.round(power * e.hp / e.maxHp);
      else p.powerConsumed -= power;
    }
  }
  private updateFog() {
    for (const p of this.players) p.fog.fill(this.fogOfWar ? 0 : 1);
    for (const e of this.entities) {
      if (e.hp <= 0 || e.transportedBy) continue;
      const radius = getDefinition(e.type).sight + (e.kind === 'building' ? 2 : 0);
      for (const p of this.players) {
        if (!this.isAllied(p.id, e.owner)) continue;
        for (let y = Math.max(0, Math.floor(e.y - radius)); y <= Math.min(this.map.height - 1, Math.ceil(e.y + radius)); y++) {
          for (let x = Math.max(0, Math.floor(e.x - radius)); x <= Math.min(this.map.width - 1, Math.ceil(e.x + radius)); x++) {
            if ((x - e.x) ** 2 + (y - e.y) ** 2 > radius ** 2) continue;
            const i = y * this.map.width + x; p.fog[i] = 1; p.explored[i] = 1;
          }
        }
      }
    }
    if (!this.fogOfWar) for (const p of this.players) p.explored.fill(1);
  }
  private rebuildSpatial() {
    this.spatial.clear();
    const columns = Math.ceil(this.map.width / 8);
    for (const e of this.entities) {
      if (e.hp <= 0 || e.transportedBy) continue;
      const key = Math.floor(e.y / 8) * columns + Math.floor(e.x / 8);
      const bucket = this.spatial.get(key); if (bucket) bucket.push(e); else this.spatial.set(key, [e]);
    }
  }
  private separateUnits(dt: number) {
    for (const e of this.entities) {
      if (e.kind !== 'unit' || e.transportedBy) continue;
      const d = getDefinition(e.type);
      for (const other of this.nearby(e.x, e.y, 2)) {
        if (other.id <= e.id || other.kind !== 'unit' || other.hp <= 0 || other.transportedBy) continue;
        const od = getDefinition(other.type);
        if (!!d.flying !== !!od.flying) continue;
        const radius = (d.armor === 'none' ? .3 : .55) + (od.armor === 'none' ? .3 : .55);
        const dist = distance(e, other);
        if (dist >= radius) continue;
        const angle = dist > .001 ? Math.atan2(e.y - other.y, e.x - other.x) : (e.id * 2.39996);
        const push = Math.min(radius - dist, dt * 1.6) * .5;
        const dx = Math.cos(angle) * push, dy = Math.sin(angle) * push;
        if (!e.deployed && this.isPassable(e.x + dx, e.y + dy, d)) { e.x += dx; e.y += dy; }
        if (!other.deployed && this.isPassable(other.x - dx, other.y - dy, od)) { other.x -= dx; other.y -= dy; }
      }
    }
  }
  private nearby(x: number, y: number, radius: number): Entity[] {
    const result: Entity[] = [], columns = Math.ceil(this.map.width / 8), rows = Math.ceil(this.map.height / 8);
    for (let cy = Math.max(0, Math.floor((y - radius) / 8)); cy <= Math.min(rows - 1, Math.floor((y + radius) / 8)); cy++) {
      for (let cx = Math.max(0, Math.floor((x - radius) / 8)); cx <= Math.min(columns - 1, Math.floor((x + radius) / 8)); cx++) result.push(...(this.spatial.get(cy * columns + cx) ?? []));
    }
    return result;
  }
  private checkVictory(force = false) {
    if (this.bootcamp && !force) return;
    if ((!force && this.time < 2) || this.status !== 'playing') return;
    for (const p of this.players) {
      if (p.defeated) continue;
      if (!this.entities.some(e => e.owner === p.id && e.hp > 0 && !getDefinition(e.type).neutral && (!this.shortGame || e.kind === 'building' || getDefinition(e.type).deploysTo))) {
        p.defeated = true;
        for (const category of CATEGORIES) p.queues[category] = [];
        for (const e of [...this.entities]) if (e.owner === p.id) this.removeEntity(e, false);
        this.event(`${p.name}被击败。`, p.id, 'warning');
      }
    }
    const local = this.getPlayer(this.localPlayerId);
    if (local?.defeated) { this.status = 'defeat'; this.event('任务失败。', this.localPlayerId, 'warning'); return; }
    const enemies = this.players.filter(p => !this.isAllied(this.localPlayerId, p.id));
    if (enemies.length && enemies.every(p => p.defeated)) {
      this.status = 'victory'; this.winnerTeam = local?.team || this.localPlayerId;
      this.event('任务完成。战场属于你！', this.localPlayerId, 'complete');
    }
  }

  private runAI(p: PlayerState) {
    const own = this.ownEntities(p.id);
    const mcvs = own.filter(e => getDefinition(e.type).deploysTo);
    if (mcvs.length && !this.has(p.id, 'yard')) this.deploy(mcvs.map(e => e.id));
    for (const category of ['structure', 'defense'] as ProductionCategory[]) {
      const ready = p.queues[category][0];
      if (ready?.ready) {
        const site = this.findAIPlacement(p.id, ready.type);
        if (site) this.place(p.id, ready.type, site.x, site.y);
        else if (this.time > 100 && getDefinition(ready.type).naval) this.cancelBuild(p.id, category);
      }
    }
    const allied = p.faction === 'allied';
    const desired = [allied ? 'power_plant' : 'tesla_reactor', allied ? 'refinery' : 'soviet_refinery', allied ? 'barracks' : 'soviet_barracks', allied ? 'war_factory' : 'soviet_war_factory', allied ? 'airforce_command' : 'radar', allied ? 'battle_lab' : 'soviet_battle_lab'];
    if (!p.queues.structure.length) {
      if (p.powerProduced < p.powerConsumed + 40 && this.has(p.id, 'yard')) this.build(p.id, allied ? 'power_plant' : this.has(p.id, 'tech') ? 'nuclear_reactor' : 'tesla_reactor');
      else {
        const next = desired.find(type => !this.has(p.id, type));
        if (next) this.build(p.id, next);
        else if (own.filter(e => e.type.includes('refinery')).length < 2) this.build(p.id, allied ? 'refinery' : 'soviet_refinery');
        else if (this.time > 120 && !this.has(p.id, 'naval') && this.findAIPlacement(p.id, allied ? 'naval_yard' : 'soviet_naval_yard')) this.build(p.id, allied ? 'naval_yard' : 'soviet_naval_yard');
        else if (this.superweapons && this.time > 220 && !this.has(p.id, allied ? 'weather_control' : 'nuclear_silo')) this.build(p.id, allied ? 'weather_control' : 'nuclear_silo');
      }
    }
    if (!p.queues.defense.length && this.time > 50 && own.filter(e => getDefinition(e.type).category === 'defense').length < (p.difficulty === 'hard' ? 6 : 3)) {
      const choices = this.getAvailable(p.id, 'defense').filter(d => d.cost < p.credits / 2);
      if (choices.length) this.build(p.id, choices[Math.floor(this.random() * choices.length)].id);
    }
    const armyCap = p.difficulty === 'easy' ? 22 : p.difficulty === 'hard' ? 60 : 40;
    const techObjectives = this.entities.filter(e => e.owner !== p.id && (e.owner < 0 || !this.isAllied(e.owner, p.id)) && getDefinition(e.type).capturable).sort((a, b) => distance(a, p.spawn) - distance(b, p.spawn));
    const engineers = own.filter(e => e.type.includes('engineer'));
    if (techObjectives.length && this.has(p.id, 'barracks')) {
      if (!engineers.length && !p.queues.infantry.some(item => item.type.includes('engineer')) && distance(techObjectives[0], p.spawn) < 70) this.build(p.id, allied ? 'allied_engineer' : 'soviet_engineer');
      for (const engineer of engineers) if (engineer.order.kind !== 'capture') this.setOrder(engineer, { kind: 'capture', targetId: techObjectives[0].id });
    }
    if (own.filter(e => e.kind === 'unit').length < armyCap) {
      if (p.queues.vehicle.length < 2 && this.has(p.id, 'war_factory')) {
        const harvesters = own.filter(e => getDefinition(e.type).harvest).length;
        if (harvesters < 2) this.build(p.id, allied ? 'chrono_miner' : 'war_miner');
        else {
          const choices = this.getAvailable(p.id, 'vehicle').filter(d => !d.harvest && !d.deploysTo && !['demolition_truck'].includes(d.id));
          // Aircraft are essential on island maps; late Soviet AI builds Kirovs regularly.
          const choice = !allied && this.has(p.id, 'tech') && this.random() < .4 ? CATALOG.kirov : choices[Math.floor(this.random() * choices.length)];
          if (choice) this.build(p.id, choice.id);
        }
      }
      if (p.queues.infantry.length < 2 && p.credits > 600) {
        const choices = this.getAvailable(p.id, 'infantry').filter(d => !!d.damage && !d.id.includes('dog') && d.id !== 'terrorist');
        if (choices.length) this.build(p.id, choices[Math.floor(this.random() * choices.length)].id);
      }
      if (allied && !p.queues.aircraft.length && p.credits > 1800) this.build(p.id, p.country === 'korea' ? 'black_eagle' : 'harrier');
      if (!p.queues.naval.length && this.has(p.id, 'naval') && p.credits > 1500) this.build(p.id, allied ? (this.has(p.id, 'tech') ? 'carrier' : 'destroyer') : (this.has(p.id, 'tech') ? 'dreadnought' : 'submarine'));
    }
    const damaged = own.filter(e => e.kind === 'building' && e.hp < e.maxHp * .7);
    if (p.credits > 400) for (const e of damaged) e.repairing = true;
    if (p.aiAttackTimer <= 0) {
      p.aiAttackTimer = p.difficulty === 'easy' ? 50 : p.difficulty === 'hard' ? 24 : 36;
      const enemies = this.entities.filter(e => e.owner >= 0 && !this.isAllied(p.id, e.owner) && e.kind === 'building' && !getDefinition(e.type).neutral);
      enemies.sort((a, b) => distance(p.spawn, a) - distance(p.spawn, b));
      const target = enemies[0] ?? this.entities.find(e => e.owner >= 0 && !this.isAllied(p.id, e.owner));
      if (target) {
        const attackers = own.filter(e => e.kind === 'unit' && !!getDefinition(e.type).damage && !getDefinition(e.type).harvest && !getDefinition(e.type).deploysTo);
        if (attackers.length >= 3) this.commandAttackMove(attackers.map(e => e.id), target.x, target.y);
        for (const ability of this.getSupport(p.id)) if (ability.ready && ['nuke', 'lightning', 'paradrop'].includes(ability.id)) this.support(p.id, ability.id, target.x, target.y);
      }
    }
    // A damaged economy recovers through selling luxury defenses, not hidden income.
    if (p.credits < 150 && !own.some(e => getDefinition(e.type).harvest) && this.has(p.id, 'war_factory')) {
      const excess = own.find(e => getDefinition(e.type).category === 'defense' && getDefinition(e.type).cost >= 1000);
      if (excess) this.sell(excess.id);
    }
  }
  private findAIPlacement(playerId: number, type: string): Point | undefined {
    const buildings = this.ownEntities(playerId).filter(e => e.kind === 'building');
    const seedAngle = this.random() * Math.PI * 2;
    for (const base of buildings) {
      for (let radius = 4; radius <= 17; radius += 2) for (let i = 0; i < 16; i++) {
        const angle = seedAngle + i / 16 * Math.PI * 2;
        const p = { x: base.x + Math.cos(angle) * radius, y: base.y + Math.sin(angle) * radius };
        if (this.canPlace(playerId, type, p.x, p.y)) return p;
      }
    }
    return undefined;
  }

  private effect(effect: Omit<Effect, 'id' | 'age'>) { this.effects.push({ ...effect, id: this.nextEffect++, age: 0 }); }
  private event(text: string, owner?: number, kind: GameEvent['kind'] = 'info') {
    this.lastMessage = text;
    this.events.push({ id: this.nextEvent++, time: this.time, text, owner, kind });
    if (this.events.length > 80) this.events.shift();
  }
}
