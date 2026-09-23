export type Terrain = 'land' | 'water' | 'ore' | 'gem' | 'cliff' | 'road' | 'snow' | 'bridge' | 'void';
export type Faction = 'allied' | 'soviet';
export type CountryId = 'america' | 'korea' | 'france' | 'germany' | 'britain' | 'russia' | 'iraq' | 'cuba' | 'libya';
export type ProductionCategory = 'structure' | 'defense' | 'infantry' | 'vehicle' | 'aircraft' | 'naval';
export type Difficulty = 'easy' | 'medium' | 'hard';
export interface Point { x: number; y: number }
export interface GameMap {
  width: number; height: number; spawns: Point[];
  cells: readonly Terrain[];
  id?: string; name?: string; theater?: string;
}
export interface Country {
  id: CountryId; name: string; nameEn: string; faction: Faction; flag: string; special: string; description: string;
}
export interface Definition {
  id: string; name: string; nameEn: string; kind: 'unit' | 'building'; faction: Faction | 'both';
  category: ProductionCategory; cost: number; buildTime: number; hp: number;
  sprite: string; cameo: string; size?: [number, number];
  prerequisites?: string[]; country?: CountryId;
  power?: number; sight: number; speed?: number; range?: number; damage?: number; cooldown?: number;
  armor?: 'none' | 'light' | 'heavy' | 'building';
  weapon?: 'bullet' | 'shell' | 'missile' | 'tesla' | 'flame' | 'radiation' | 'explosive';
  flying?: boolean; naval?: boolean; amphibious?: boolean; antiAir?: boolean; canAttackGround?: boolean;
  harvest?: boolean; capacity?: number; deploysTo?: string;
  transportCapacity?: number; infantryOnly?: boolean; mindControlImmune?: boolean;
  producer?: ProductionCategory; description: string;
  neutral?: boolean; capturable?: boolean; unsellable?: boolean;
  income?: number; incomeInterval?: number;
}
export type Order =
  | { kind: 'idle' }
  | { kind: 'move' | 'attackMove'; x: number; y: number }
  | { kind: 'attack'; targetId: number }
  | { kind: 'harvest'; x: number; y: number }
  | { kind: 'return'; targetId: number }
  | { kind: 'capture'; targetId: number }
  | { kind: 'load'; targetId: number }
  | { kind: 'demolish'; targetId: number }
  | { kind: 'repairUnit'; targetId: number };
export interface Entity {
  id: number; type: string; kind: 'unit' | 'building'; owner: number;
  x: number; y: number; hp: number; maxHp: number; angle: number;
  order: Order; path: Point[]; waypoints?: Point[]; cooldown: number; cargo: number;
  rallyPoint?: Point;
  repairing: boolean; veteran: number; kills: number;
  /** Rendering metadata: a shot occurred at this game time. */
  lastShot: number; spawnedAt: number;
  /** Visual timestamp of actual damage; optional hold-fire suppresses automatic acquisition only. */
  lastHit?: number; lastMovedAt?: number; holdFire?: boolean;
  harvestTimer: number; repathTimer: number; targetId?: number;
  invulnerableUntil?: number; radiationUntil?: number;
  deployed?: boolean; transportedBy?: number; passengers?: number[];
  controlledBy?: number; originalOwner?: number; controlledId?: number;
  weaponMode?: string;
  ifvMode?: number; turretIndex?: number;
  bomb?: { detonatesAt: number; owner: number; damage: number; sourceId: number };
  mapStructureIndex?: number;
}
export interface ProductionItem { type: string; progress: number; duration: number; ready: boolean; paid: number }
export interface PlayerConfig {
  id: number; name: string; country: CountryId; team: number;
  ai?: boolean; difficulty?: Difficulty; color?: string;
}
export interface PlayerState extends PlayerConfig {
  faction: Faction; credits: number; powerProduced: number; powerConsumed: number;
  defeated: boolean; queues: Record<ProductionCategory, ProductionItem[]>;
  kills: number; losses: number; buildingsBuilt: number; unitsBuilt: number;
  fog: Uint8Array; explored: Uint8Array; supportCooldown: number;
  abilityCooldowns: Record<string, number>;
  spawn: Point; aiTimer: number; aiAttackTimer: number;
}
export interface Effect {
  id: number; kind: 'shot' | 'explosion' | 'text' | 'deploy' | 'radiation' | 'nuke' | 'hit';
  x: number; y: number; toX?: number; toY?: number; age: number; duration: number;
  weapon?: Definition['weapon']; color?: string; text?: string; radius?: number;
  sourceId?: number; targetId?: number;
}
export interface GameEvent { id: number; time: number; text: string; owner?: number; kind: 'info' | 'warning' | 'combat' | 'complete' }
export interface GameOptions {
  mode?: 'skirmish' | 'bootcamp';
  map: GameMap; players: PlayerConfig[]; startingCredits?: number; seed?: number;
  localPlayerId?: number; startingUnits?: number; fogOfWar?: boolean; superweapons?: boolean;
  shortGame?: boolean;
  neutralStructures?: { nativeType: string; x: number; y: number; health: number; foundation: [number, number]; sprite?: string; name?: string }[];
}
