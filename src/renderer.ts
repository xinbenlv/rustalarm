import { drawWeaponShot } from './weapon-effects';
import { EntityTooltip } from './hud/entity-tooltip';
import { aircraftIsDocked } from './game/aircraft';
// Shared battlefield input; each renderer supplies its own world projection without replacing simulation.
import type {ModelLayer} from './bootcamp/model-layer.js';
import { t } from './i18n';
import { spriteAnimation, spriteFacing, unitIsMoving } from './sprite-animation';
import { drawHDCombatEffect, drawHDGroundMotion } from './hd-effects';
import type { GameEngine, Entity, Definition, GameMap, Point } from './game';
import { getDefinition, PLAYER_COLORS } from './game';
import { spriteFrame, type Assets, type Sprite } from './assets';
import { projectTile, TerrainPainter, unprojectPoint } from './terrain-painter';
import { compileCustomTerrain, type ResolvedTerrainCell } from './custom-terrain';
import { nativeTerrainCatalog } from './maps';
import { drawTrainingHighland } from './bootcamp/native-highland';

export type RenderMap = GameMap & {
  resolvedTerrain?: readonly ResolvedTerrainCell[];
  groundBase?: {tileId:number;subTile:number;theater:string};
  layout?: 'rectangular';
  tiles?: { x: number; y: number; tileId: number; subTile: number; theater?: string; elevation?: number; z?: number; overlay?: number; overlayFrame?: number }[];
  tileIds?: Int32Array | number[]; elevations?: Uint8Array | number[]; radarColors?: Uint32Array | number[];
  terrainObjects?: { x: number; y: number; type: string }[];
  structures?: {x:number;y:number;type:string;health?:number}[];
  environmentProps?: {id:string;x:number;y:number;rotation?:number}[];
};
export interface RendererHooks { onSelection(ids: number[]): void; onCommand(kind?: 'move'|'attack'|'deploy'): void; onPlace(x: number, y: number): boolean; onEntityClick(entity: Entity): boolean; onNotice(text: string): void }
export interface WorldRect { minX: number; maxX: number; minY: number; maxY: number }
export class BattlefieldRenderer {
  modelLayer?: ModelLayer;
  ctx: CanvasRenderingContext2D;
  readonly nativeTerrain: readonly ResolvedTerrainCell[];
  camera = { x: 0, y: 0 }; zoom = 1;
  selection = new Set<number>();
  keys = new Set<string>();
  mouse = { x: -1, y: -1, inside: false };
  hoverEntity?: Entity;
  placement?: Definition;
  attackMove = false;
  planningMode = false;
  private tooltip:EntityTooltip;
  tool: 'select' | 'repair' | 'sell' | 'support' = 'select';
  width = 0; height = 0;
  private terrainPainter: TerrainPainter;
  private tinted = new Map<string, HTMLCanvasElement>();
  private tileLookup = new Map<number, NonNullable<RenderMap['tiles']>[number]>();
  private startDrag?: { x: number; y: number; cameraX: number; cameraY: number; button: number; orbit?:{yaw:number;pitch:number} };
  private dragRect?: { x: number; y: number; w: number; h: number };
  private moving = false;
  private observers: ResizeObserver;
  private cleanup: (() => void)[] = [];
  private orderMarker?: { x: number; y: number; age: number; attack: boolean };
  private displayedSprites = new Map<number, {x: number;y: number;w: number;h: number}>();
  private miniCtx?: CanvasRenderingContext2D;
  private miniBase?: HTMLCanvasElement;
  private miniScale = 1;
  private miniOrigin = { x: 0, y: 0 };
  private worldBounds: WorldRect;
  private time = 0;
  edgeScroll = true;
  scrollSpeed = 1;
  hdEffects = false;
  // Optional authored preview presentation; absent in normal games.
  comparisonEntities: Entity[] = [];
  entityPresentation?: (entity:Entity) => {sprite?:Sprite;frame?:number;action?:string;animationPhase?:number;label?:string;height?:number;swimming?:boolean;lean?:number}|undefined;
  worldGround?: (ctx:CanvasRenderingContext2D) => void;
  constructor(public canvas: HTMLCanvasElement, public game: GameEngine, public map: RenderMap, public assets: Assets, private hooks: RendererHooks, public localId = 0) {
    this.terrainPainter = new TerrainPainter(assets);
    // Native maps may contain missing tile IDs; only editor documents need compilation.
    this.nativeTerrain = map.resolvedTerrain ?? (map.layout === 'rectangular'
      ? compileCustomTerrain({ width: map.width, height: map.height, theater: map.theater ?? 'temperate', cells: map.cells }, nativeTerrainCatalog())
      : []);
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    for (const tile of map.tiles || []) this.tileLookup.set(tile.y * map.width + tile.x, tile);
    this.worldBounds = this.calculateBounds();
    this.observers = new ResizeObserver(() => this.resize()); this.observers.observe(canvas);
    this.tooltip=new EntityTooltip(canvas);
    this.resize(); this.bind(); this.home();
  }
  private listen<K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (event: HTMLElementEventMap[K]) => void) {
    el.addEventListener(type, fn as EventListener); this.cleanup.push(() => el.removeEventListener(type, fn as EventListener));
  }
  private bind() {
    this.listen(this.canvas, 'contextmenu', e => e.preventDefault());
    this.listen(this.canvas, 'pointerdown', e => {
      this.tooltip.reset();
      this.canvas.focus(); this.canvas.setPointerCapture(e.pointerId);
      const p = this.eventPosition(e); this.startDrag = { ...p, cameraX: this.camera.x, cameraY: this.camera.y, button: e.button }; this.moving = false;
      if(e.button===0&&e.altKey&&this.modelLayer){this.startDrag.orbit={yaw:this.modelLayer.rig.yaw,pitch:this.modelLayer.rig.pitch};e.preventDefault();}
      if (e.button === 1) e.preventDefault();
    });
    this.listen(this.canvas, 'pointermove', e => {
      this.tooltip.reset();
      const p = this.eventPosition(e); this.mouse = { ...p, inside: true };
      if (this.startDrag) {
        const d = this.startDrag, dx = p.x - d.x, dy = p.y - d.y;
        if (Math.hypot(dx, dy) > 5) this.moving = true;
        if(d.orbit&&this.modelLayer){this.modelLayer.rig.orbit(d.orbit.yaw-dx*.006,d.orbit.pitch+dy*.004);}
        else if (d.button === 1 || (d.button === 0 && this.keys.has(' '))) {
          if(this.modelLayer)this.modelLayer.pan(-dx,-dy,this,{x:d.cameraX,y:d.cameraY});
          else{this.camera.x = d.cameraX - dx / this.zoom; this.camera.y = d.cameraY - dy / this.zoom;}
          this.clampCamera();
        } else if (d.button === 0 && !this.placement && this.tool === 'select' && !this.attackMove && this.moving) {
          this.dragRect = { x: Math.min(d.x, p.x), y: Math.min(d.y, p.y), w: Math.abs(dx), h: Math.abs(dy) };
        }
      }
      this.hoverEntity = this.pick(p.x, p.y);
    });
    this.listen(this.canvas, 'pointerleave', () => { this.mouse.inside = false; this.hoverEntity = undefined; });
    this.listen(this.canvas, 'pointerup', e => {
      const p = this.eventPosition(e), d = this.startDrag;
      if (!d) return;
      if (d.button === 0 && !d.orbit && !this.keys.has(' ')) {
        if (this.dragRect) {
          const r = this.dragRect;
          const ids = this.game.entities.filter(v => v.owner === this.localId && v.kind === 'unit' && !v.transportedBy && v.hp > 0).filter(v => {
            const s = this.toScreen(v.x, v.y); return s.x >= r.x && s.x <= r.x + r.w && s.y >= r.y && s.y <= r.y + r.h;
          }).map(v => v.id);
          if (!e.shiftKey) this.selection.clear(); for (const id of ids) this.selection.add(id); this.hooks.onSelection([...this.selection]);
        } else if (!this.moving) this.leftClick(p.x, p.y, e.shiftKey);
      } else if (d.button === 2 && !this.moving) this.rightClick(p.x, p.y);
      this.startDrag = undefined; this.dragRect = undefined;
      if(this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    });
    this.listen(this.canvas, 'dblclick', e => {
      if (this.tool !== 'select' || this.placement) return;
      const p = this.eventPosition(e), entity = this.pick(p.x, p.y);
      if (entity?.owner === this.localId) {
        const def = getDefinition(entity.type);
        if (def.deploysTo) { this.game.deploy([entity.id]); this.hooks.onCommand('deploy'); }
        else if (this.game.setPrimaryFactory(entity.id)) {
          this.selection = new Set([entity.id]); this.hooks.onSelection([...this.selection]); this.hooks.onCommand('move');
        }
        else {
          this.selection = new Set(this.game.entities.filter(v => v.owner === this.localId && v.type === entity.type && this.onScreen(v.x, v.y)).map(v => v.id));
          this.hooks.onSelection([...this.selection]);
        }
      }
    });
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false }); this.cleanup.push(() => this.canvas.removeEventListener('wheel', this.onWheel));
  }
  private onWheel = (e: WheelEvent) => {
    e.preventDefault(); const p = this.eventPosition(e);
    if(this.modelLayer){this.modelLayer.zoomAt(p.x,p.y,e.deltaY>0?.9:1.1,this);this.clampCamera();return;}
    const before = this.screenToWorld(p.x, p.y);
    this.zoom = Math.max(.45, Math.min(1.7, this.zoom * (e.deltaY > 0 ? .9 : 1.1)));
    const after = this.screenToWorld(p.x, p.y);
    this.camera.x += before.x - after.x; this.camera.y += before.y - after.y; this.clampCamera();
  };
  private eventPosition(e: MouseEvent) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  resize() {
    const rect = this.canvas.getBoundingClientRect(); this.width = rect.width; this.height = rect.height;
    const dpr = Math.min(devicePixelRatio || 1, 2); this.canvas.width = Math.round(this.width * dpr); this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.ctx.imageSmoothingEnabled = false;
  }
  destroy() { this.tooltip.destroy(); this.observers.disconnect(); for (const f of this.cleanup) f(); this.terrainPainter.clear(); this.tinted.clear(); }
  home() {
    const owned = this.game.entities.find(e => e.owner === this.localId && e.type.includes('construction_yard')) || this.game.entities.find(e => e.owner === this.localId && e.type.includes('mcv'));
    const p = owned || this.game.players.find(p => p.id === this.localId)?.spawn || this.map.spawns[0];
    if (p) this.center(p.x, p.y);
  }
  center(x: number, y: number) { const p = this.project(x, y); this.camera.x = p.x; this.camera.y = p.y; this.clampCamera(); }
  setSelection(ids: number[]) { this.selection = new Set(ids); this.hooks.onSelection(ids); }
  project(x: number, y: number): Point { return projectTile(x, y); }
  unproject(x: number, y: number): Point { return unprojectPoint(x, y); }
  screenToWorld(x: number, y: number): Point { return { x: (x - this.width / 2) / this.zoom + this.camera.x, y: (y - this.height / 2) / this.zoom + this.camera.y }; }
  screenToTile(x: number, y: number): Point {
    if(this.modelLayer)return this.modelLayer.screenToTile(x,y,this);
    const world = this.screenToWorld(x, y); let front:Point|undefined;
    for(let z=0;z<=15;z++){const raw=this.unproject(world.x,world.y+z*15);const p={x:Math.round(raw.x),y:Math.round(raw.y)};if(p.x<0||p.y<0||p.x>=this.map.width||p.y>=this.map.height||this.map.cells[p.y*this.map.width+p.x]==='void'||this.elevation(p.x,p.y)!==z)continue;const center=this.project(p.x,p.y);if(Math.abs(world.x-center.x)/30+Math.abs(world.y-(center.y-z*15))/15<=1.01&&(!front||p.x+p.y>front.x+front.y))front=p;}
    const fallback=this.unproject(world.x,world.y);return front||{x:Math.round(fallback.x),y:Math.round(fallback.y)};
  }
  toScreen(x: number, y: number, elevation = true): Point {
    if(this.modelLayer)return this.modelLayer.toScreen(x,y,this,elevation);
    const p = this.project(x, y); if (elevation) p.y -= this.elevation(x, y) * 15;
    return { x: (p.x - this.camera.x) * this.zoom + this.width / 2, y: (p.y - this.camera.y) * this.zoom + this.height / 2 };
  }
  elevation(x: number, y: number): number { if(x<0||y<0||x>=this.map.width||y>=this.map.height)return 0;const idx = Math.round(y) * this.map.width + Math.round(x); return this.map.elevations?.[idx] || this.tileLookup.get(idx)?.elevation || this.tileLookup.get(idx)?.z || 0; }
  private onScreen(x: number, y: number) { const p = this.toScreen(x, y); return p.x > -120 && p.x < this.width + 120 && p.y > -120 && p.y < this.height + 180; }
  private calculateBounds(): WorldRect {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let y = 0; y < this.map.height; y++) for (let x = 0; x < this.map.width; x++) {
      if (this.map.cells[y * this.map.width + x] === 'void') continue;
      const p = this.project(x, y); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    return { minX, maxX, minY, maxY };
  }
  private clampCamera() {
    if(this.modelLayer){const p=this.unproject(this.camera.x,this.camera.y),q=this.project(Math.max(0,Math.min(this.map.width-1,p.x)),Math.max(0,Math.min(this.map.height-1,p.y)));Object.assign(this.camera,q);return;}
    const b = this.worldBounds,hx=this.width/(2*this.zoom),hy=this.height/(2*this.zoom);const clamp=(v:number,lo:number,hi:number)=>lo>hi?(lo+hi)/2:Math.max(lo,Math.min(hi,v));this.camera.x=clamp(this.camera.x,b.minX+hx-30,b.maxX-hx+30);this.camera.y=clamp(this.camera.y,b.minY+hy-80,b.maxY-hy+30);
  }
  private leftClick(x: number, y: number, shift: boolean) {
    const p = this.screenToTile(x, y);
    if (this.placement || this.tool === 'support') { this.hooks.onPlace(p.x, p.y); return; }
    if (this.attackMove) { this.game.commandMove([...this.selection], p.x, p.y, true); this.marker(p, true); this.attackMove = false; this.hooks.onCommand('attack'); return; }
    const entity = this.pick(x, y);
    if (entity && this.hooks.onEntityClick(entity)) return;
    if (!shift) this.selection.clear();
    if (entity && entity.owner === this.localId) {
      if (shift && this.selection.has(entity.id)) this.selection.delete(entity.id); else this.selection.add(entity.id);
    }
    this.hooks.onSelection([...this.selection]);
  }
  private rightClick(x: number, y: number) {
    if (this.placement || this.tool !== 'select' || this.attackMove) {
      this.placement = undefined; this.tool = 'select'; this.attackMove = false; this.hooks.onNotice('已取消'); return;
    }
    const p = this.screenToTile(x, y), entity = this.pick(x, y);
    if (!this.selection.size) return;
    if (this.game.setRallyPoint([...this.selection].filter(id => this.game.getEntity(id)?.owner === this.localId), p.x, p.y)) {
      this.marker(p, false); this.hooks.onCommand('move'); return;
    }
    if (entity) {
      this.game.commandAttack([...this.selection], entity.id); this.marker({ x: entity.x, y: entity.y }, true);
    } else { this.game.commandMove([...this.selection], p.x, p.y, false, this.planningMode); this.marker(p, false); }
    const enemy=entity && this.game.players.find(v=>v.id===entity.owner)?.team!==this.game.players.find(v=>v.id===this.localId)?.team;
    this.hooks.onCommand(enemy?'attack':'move');
  }
  marker(p: Point, attack: boolean) { this.orderMarker = { ...p, age: 0, attack }; }
  pick(x: number, y: number): Entity | undefined {
    if (this.modelLayer) return this.modelLayer.pick(x, y, this);
    let nearest: Entity | undefined, building: Entity | undefined, nearestDistance = Infinity;
    for (let i = this.game.entities.length - 1; i >= 0; i--) {
      const e = this.game.entities[i]; if (e.hp <= 0 || e.transportedBy || !this.game.visible(this.localId, e.x, e.y)) continue;
      const p = this.toScreen(e.x, e.y), def = getDefinition(e.type);p.y-=(this.entityPresentation?.(e)?.height||0)*this.zoom;
      const box = this.displayedSprites.get(e.id);
      if (e.kind === 'building' && box && x > box.x + box.w * .15 && x < box.x + box.w * .85 && y > box.y + box.h * .3 && y < box.y + box.h * .92) building ??= e;
      const r = (def.category === 'infantry' ? 11 : def.naval ? 28 : 20) * this.zoom;
      const dx = x - p.x, dy = y - (p.y - (def.flying ? this.flyingHeight(e, def) * this.zoom : 5));
      if (e.kind === 'building' && !box && Math.abs(dx) < r && Math.abs(dy) < r) building ??= e;
      if (e.kind === 'unit' && Math.abs(dx) < r && Math.abs(dy) < r && dx * dx + dy * dy < nearestDistance) {
        nearest = e; nearestDistance = dx * dx + dy * dy;
      }
    }
    return nearest ?? building;
  }
  update(dt: number) {
    this.time += dt;
    if (this.orderMarker) { this.orderMarker.age += dt; if (this.orderMarker.age > .85) this.orderMarker = undefined; }
    let dx = 0, dy = 0;
    if (this.keys.has('arrowleft') || this.keys.has('a-pan')) dx--;
    if (this.keys.has('arrowright')) dx++;
    if (this.keys.has('arrowup') || this.keys.has('w')) dy--;
    if (this.keys.has('arrowdown')) dy++;
    if (this.edgeScroll && this.mouse.inside && !this.startDrag) {
      if (this.mouse.x < 12) dx--; if (this.mouse.x > this.width - 12) dx++;
      if (this.mouse.y < 12) dy--; if (this.mouse.y > this.height - 12) dy++;
    }
    if(this.modelLayer){if(dx||dy)this.modelLayer.pan(dx*dt*760*this.scrollSpeed,dy*dt*600*this.scrollSpeed,this);}
    else{this.camera.x += dx * dt * 760 * this.scrollSpeed / this.zoom; this.camera.y += dy * dt * 600 * this.scrollSpeed / this.zoom;}
    if(dx || dy) this.clampCamera();
    for (const id of this.selection) if (!this.game.entities.some(e => e.id === id && e.hp > 0)) this.selection.delete(id);
    this.draw();
  }
  draw() {
    this.tooltip.update(this,!!this.startDrag);
    const ctx = this.ctx; ctx.fillStyle = '#060b0b'; ctx.fillRect(0, 0, this.width, this.height);
    if(this.modelLayer){this.modelLayer.draw(this,this.orderMarker);this.drawRoutes();this.drawDragRect();return;}
    const corners = [[-180, -180], [this.width + 180, -180], [-180, this.height + 330], [this.width + 180, this.height + 330]].map(([x, y]) => { const p = this.screenToWorld(x, y); return this.unproject(p.x, p.y); });
    const x1 = Math.max(0, Math.floor(Math.min(...corners.map(p => p.x)))), x2 = Math.min(this.map.width - 1, Math.ceil(Math.max(...corners.map(p => p.x))));
    const y1 = Math.max(0, Math.floor(Math.min(...corners.map(p => p.y)))), y2 = Math.min(this.map.height - 1, Math.ceil(Math.max(...corners.map(p => p.y))));
    ctx.save(); ctx.translate(this.width / 2, this.height / 2); ctx.scale(this.zoom, this.zoom); ctx.translate(-this.camera.x, -this.camera.y);
    if(this.map.groundBase)for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++){if(this.map.cells[y*this.map.width+x]==='void'||!this.game.explored(this.localId,x,y))continue;const p=this.project(x,y);this.terrainPainter.drawNativeTile(ctx,this.map.groundBase,this.map.groundBase.theater,p.x,p.y);}
    for (let sum = x1 + y1; sum <= x2 + y2; sum++) for (let x = x1; x <= x2; x++) {
      const y = sum - x; if (y < y1 || y > y2) continue;
      const idx = y * this.map.width + x, terrain = this.map.cells[idx]; if (!terrain || terrain === 'void') continue;
      const p = this.project(x, y); p.y -= this.elevation(x, y) * 15;
      if (!this.game.explored(this.localId, x, y)) { this.diamond(ctx, p.x, p.y, '#020706'); continue; }
      const tile = this.tileLookup.get(idx);
      const resolved = this.nativeTerrain[idx];
      if (drawTrainingHighland(ctx, this.map, resolved, this.terrainPainter, this.assets, x, y)) continue;
      const drawn = resolved ? this.terrainPainter.drawResolvedGround(ctx, resolved, p.x, p.y)
        : this.terrainPainter.drawNativeTile(ctx, tile, this.map.theater, p.x, p.y);
      if (!drawn) this.terrainPainter.drawGround(ctx, terrain, this.map.theater ?? '', x, y, p.x, p.y);
    }
    // Bridges span multiple cells. Paint their complete raw frames after all terrain.
    for (let sum = x1+y1; sum <= x2+y2; sum++) for(let x=x1;x<=x2;x++){
      const y=sum-x;if(y<y1||y>y2)continue;
      const idx=y*this.map.width+x,terrain=this.map.cells[idx],tile=this.tileLookup.get(idx);
      if(!terrain||terrain==='void'||!this.game.explored(this.localId,x,y))continue;
      const p=this.project(x,y);p.y-=this.elevation(x,y)*15;
      const resolved = this.nativeTerrain[idx];
      if (resolved) {
        const resource = terrain === 'ore' || terrain === 'gem';
        if (!resource || this.game.ore[idx] > 0) {
          const drawn = this.terrainPainter.drawResolvedResources(ctx, resolved, p.x, p.y);
          if (!drawn && resource) this.terrainPainter.drawResources(ctx, p.x, p.y, x, y, terrain === 'gem');
        }
        continue;
      }
      if(tile && tile.overlay != null && tile.overlay !== 255 && (terrain !== 'ore' && terrain !== 'gem' || this.game.ore[idx]>0)) {
        const overlay = this.assets.manifest.overlays?.[`${this.map.theater}:${tile.overlay}`];
        if(overlay) this.terrainPainter.drawOverlay(ctx,overlay,p.x,p.y,tile.overlayFrame || 0);
        else if(terrain==='ore' || terrain==='gem')this.terrainPainter.drawResources(ctx,p.x,p.y,x,y,terrain==='gem');
      } else if((terrain==='ore' || terrain==='gem') && this.game.ore[idx]>0) {
        // Editor maps describe resources directly, without original overlay artwork.
        this.terrainPainter.drawResources(ctx,p.x,p.y,x,y,terrain==='gem');
      }
    }
    this.worldGround?.(ctx);
    this.displayedSprites.clear();
    const objects: {sort:number;draw:()=>void}[]=[];
    for(const obj of [...this.map.terrainObjects || [],...this.map.structures || []]) {
      if(!this.onScreen(obj.x,obj.y) || !this.game.explored(this.localId,obj.x,obj.y)) continue;
      const sprite=this.assets.scenery[`${this.map.theater}:${obj.type.toLowerCase()}`] || this.assets.manifest.overlays?.[`${this.map.theater}-${obj.type.toLowerCase()}`];
      if(!sprite)continue;
      const [fw,fh]=sprite.foundation||[1,1],x=obj.x+(fw-1)/2,y=obj.y+(fh-1)/2;
      const p=this.project(x,y);p.y-=this.elevation(obj.x,obj.y)*15;
      objects.push({sort:x+y+fh*.3,draw:()=>this.terrainPainter.drawOverlay(ctx,sprite,p.x,p.y)});
    }
    for(const entity of (this.modelLayer ? [] : [...this.game.entities,...this.comparisonEntities])){if(entity.hp<=0||entity.transportedBy||!this.onScreen(entity.x,entity.y)||!(entity.kind==='building'?this.game.explored(this.localId,entity.x,entity.y):this.game.visible(this.localId,entity.x,entity.y)))continue;
      objects.push({sort:entity.x+entity.y+(getDefinition(entity.type).flying?12:0),draw:()=>this.drawEntity(ctx,entity)});
    }
    objects.sort((a,b)=>a.sort-b.sort);for(const obj of objects)obj.draw();
    for (const effect of this.game.effects) {
      if (!this.game.visible(this.localId, effect.x, effect.y)) continue;
      const p = this.project(effect.x, effect.y); p.y -= this.elevation(effect.x, effect.y) * 15;
      const t = effect.age / effect.duration;
      if (this.hdEffects && drawHDCombatEffect(ctx, effect, p, this.game, (x,y) => {const q=this.project(x,y);q.y-=this.elevation(x,y)*15;return q;}, this.assets)) continue;
      if (effect.kind === 'shot' && effect.toX != null && effect.toY != null) {
        const target = this.project(effect.toX, effect.toY); target.y -= this.elevation(effect.toX, effect.toY) * 15;
        drawWeaponShot(ctx, effect, { x: p.x, y: p.y - (effect.fromHeight ?? 12) }, { x: target.x, y: target.y - (effect.toHeight ?? 6) }, 1, this.assets);
      } else if (effect.kind === 'explosion' || effect.kind === 'nuke') {
        p.y -= effect.fromHeight ?? 0;
        const explosion=this.assets.sprite(effect.kind==='nuke'?'twlt100':'twlt050');if(explosion&&this.terrainPainter.drawOverlay(ctx,explosion,p.x,p.y,Math.min(explosion.frames-1,Math.floor(t*explosion.frames))))continue;
        const radius = effect.kind === 'nuke' ? 180 : 18;
        ctx.globalAlpha = Math.max(0, 1 - t); const grad = ctx.createRadialGradient(p.x,p.y-10,0,p.x,p.y-10,Math.max(1,radius*t));grad.addColorStop(0,'#fff7b4');grad.addColorStop(.4,'#ffd545');grad.addColorStop(.75,'#e55419');grad.addColorStop(1,'#342d23');
        ctx.fillStyle=grad;ctx.beginPath();ctx.arc(p.x,p.y-10,Math.max(1,radius*t),0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
      } else if(effect.kind==='radiation'){ctx.globalAlpha=.25*(1-t);ctx.fillStyle='#a4ed28';ctx.beginPath();ctx.ellipse(p.x,p.y,80,40,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
      else if(effect.kind==='text' && effect.text){ctx.font='bold 12px Tahoma';ctx.fillStyle=effect.color || '#ffeba6';ctx.fillText(effect.text,p.x,p.y-t*24);}
    }
    // Reapply explored-but-unseen shroud above actors and terrain.
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
      if(this.map.cells[y*this.map.width+x] === 'void')continue;
      if (this.game.explored(this.localId, x, y) && !this.game.visible(this.localId, x, y)) {
        const p = this.project(x, y); p.y -= this.elevation(x, y) * 15; this.diamond(ctx, p.x, p.y, '#000912a6');
      }
    }
    if (this.placement && this.mouse.inside) {
      const p = this.screenToTile(this.mouse.x, this.mouse.y); const valid = this.game.canPlace(this.localId, this.placement.id, p.x, p.y);
      const size = this.placement.size || [2, 2];const bounds=this.game.getPlacementBounds(this.placement.id,p.x,p.y);
      const sx = bounds.x, sy = bounds.y;
      for (let yy = sy; yy < sy + size[1]; yy++) for (let xx = sx; xx < sx + size[0]; xx++) {
        const q = this.project(xx, yy); q.y -= this.elevation(xx, yy) * 15; this.diamond(ctx, q.x, q.y, valid ? '#78e67580' : '#f0403880', '#182619');
      }
      const q=this.project(bounds.centerX-.5,bounds.centerY-.5);q.y-=this.elevation(bounds.centerX,bounds.centerY)*15;
      ctx.globalAlpha=.65;this.assets.draw(ctx,this.spriteKey(this.placement),q.x,q.y);ctx.globalAlpha=1;
    }
    if(this.orderMarker){const m=this.orderMarker,p=this.project(m.x,m.y);p.y-=this.elevation(m.x,m.y)*15;ctx.strokeStyle=m.attack?'#fa6253':'#76ee63';ctx.lineWidth=1;const r=10+m.age*16;ctx.globalAlpha=1-m.age;ctx.beginPath();ctx.ellipse(p.x,p.y,r,r*.5,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(p.x-5,p.y);ctx.lineTo(p.x+5,p.y);ctx.moveTo(p.x,p.y-3);ctx.lineTo(p.x,p.y+3);ctx.stroke();ctx.globalAlpha=1;}
    ctx.restore();
    this.drawRoutes();this.drawDragRect();
  }
  private drawRoutes() {
    const ctx=this.ctx;ctx.save();ctx.strokeStyle='#ffff00';ctx.fillStyle='#ffff00';ctx.lineWidth=1;ctx.font='11px Tahoma';ctx.setLineDash([4,4]);
    for(const entity of this.game.entities) {
      if(this.selection.has(entity.id)&&entity.owner===this.localId){
        const rally=this.game.getRallyPoint(entity);
        if(rally){
          const from=this.toScreen(entity.x,entity.y),flag=this.toScreen(rally.x,rally.y);
          if(entity.primaryFactory)ctx.fillText('★',from.x-5,from.y-10);
          ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(flag.x,flag.y);ctx.stroke();
          ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(flag.x,flag.y);ctx.lineTo(flag.x,flag.y-28);ctx.stroke();
          ctx.beginPath();ctx.moveTo(flag.x,flag.y-28);ctx.lineTo(flag.x+18,flag.y-23);ctx.lineTo(flag.x,flag.y-17);ctx.closePath();ctx.fill();
          ctx.setLineDash([4,4]);
        }
      }
      if(!this.selection.has(entity.id)||entity.owner!==this.localId||entity.hp<=0||(!this.planningMode&&!entity.waypoints?.length))continue;
      if(entity.order.kind!=='move'&&entity.order.kind!=='attackMove')continue;
      const points=[entity,entity.order,...entity.waypoints||[]].map(p=>this.toScreen(p.x,p.y));
      ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
      points.slice(1).forEach((p,i)=>{ctx.strokeRect(p.x-3,p.y-3,6,6);ctx.fillText(String(i+1),p.x+6,p.y-6);});
    }
    ctx.restore();
  }
  private drawDragRect(){const ctx=this.ctx;if(this.dragRect){const r=this.dragRect;ctx.fillStyle='#89df7312';ctx.fillRect(r.x,r.y,r.w,r.h);ctx.strokeStyle='#a0f184';ctx.lineWidth=1;ctx.strokeRect(r.x+.5,r.y+.5,r.w,r.h);}}
  private spriteKey(def: Definition) { const snow = `${def.sprite}-snow`; return this.map.theater?.toLowerCase() === 'snow' && this.assets.sprite(snow) ? snow : def.sprite; }
  private flyingHeight(e: Entity, def: Definition): number {
    if (!def.flying) return 0;
    if (e.flightHeight !== undefined) return e.flightHeight;
    if (def.category === 'aircraft' && aircraftIsDocked(e, this.game.entities)) return 0;
    return 45 + Math.sin(this.time * 3 + e.id) * 2;
  }
  private drawEntity(ctx: CanvasRenderingContext2D, e: Entity) {
    const def = getDefinition(e.type), p = this.project(e.x-(e.kind==='building'?.5:0), e.y-(e.kind==='building'?.5:0)); p.y -= this.elevation(e.x, e.y) * 15;
    const presentation=this.entityPresentation?.(e);p.y-=presentation?.height||0;
    const color = this.game.players.find(v => v.id === e.owner)?.color || PLAYER_COLORS[e.owner % PLAYER_COLORS.length] || '#898d86';
    const selected = this.selection.has(e.id), hovered = this.hoverEntity?.id === e.id;
    const flying = this.flyingHeight(e, def);
    const spriteKey = e.type==='ifv'&&e.turretIndex!=null?`fv-turret${e.turretIndex}`:this.spriteKey(def), sprite = presentation?.sprite || this.assets.sprite(spriteKey) || this.assets.scenery[`${this.map.theater}:${def.sprite.toLowerCase()}`];
    const shadowW = def.kind === 'building' ? 0 : def.category === 'infantry' ? 5 : def.naval ? 30 : 15;
    if(shadowW){ctx.fillStyle='#00100a44';ctx.beginPath();ctx.ellipse(p.x+flying*.2,p.y+3,shadowW,shadowW*.4,0,0,Math.PI*2);ctx.fill();}
    if(selected){ctx.strokeStyle='#91ef75';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(p.x,p.y,def.kind==='building'?(def.size?.[0]||2)*23:shadowW+3,def.kind==='building'?(def.size?.[1]||2)*11:8,0,0,Math.PI*2);ctx.stroke();}
    let rendered = false; let fw = 40, fh = 40, ax = 20, ay = 28;
    if (sprite) {
      const image = e.owner<0?this.assets.images.get(sprite.src):this.coloredSprite(sprite, color);
      if (image) {
        fw = sprite.frameWidth; fh = sprite.frameHeight; ax = sprite.anchorX; ay = sprite.anchorY;
        let frame = 0;
        if (e.type === 'prism_tower' && sprite.sequences) {
          const charge = e.prismCharge ?? this.game.entities.find(tower => tower.prismCharge?.supportIds.includes(e.id))?.prismCharge;
          const sequence = sprite.sequences[charge ? 'fireup' : 'ready'];
          if (sequence) {
            const phase = charge ? Math.max(0, 1 - (charge.fireAt - this.game.time) / (28 / 15)) : this.game.time % 1;
            frame = sequence[0] + (this.game.isPowered(e.owner) ? Math.min(sequence[1] - 1, Math.floor(phase * sequence[1])) : 0);
          }
        }
        const moving = sprite.hdMotion ? unitIsMoving(e,this.game.time) : e.path.length > 0;
        if ((def.kind === 'unit' || (sprite.facings ?? 1) > 1) && sprite.frames > 1) {
          if (sprite.sequences) { frame=spriteAnimation(sprite,e,this.game.time,!!def.amphibious && def.category === 'infantry' && this.game.terrainAt(e.x,e.y) === 'water').frame; }
          else frame = spriteFacing(sprite,e.angle);
        }
        if(presentation?.frame!=null)frame=presentation.frame;
        const sample=spriteFrame(sprite,frame);fw=sample.width;fh=sample.height;ax=sample.anchorX;ay=sample.anchorY;
        const density = Number.isFinite(sprite.pixelRatio) && sprite.pixelRatio! > 0 ? sprite.pixelRatio! : 1;
        // Sample the full-resolution frame, but keep world size, anchors and hit bounds logical.
        const sourceWidth = fw, sourceHeight = fh;
        fw /= density; fh /= density; ax /= density; ay /= density;
        const smoothing = ctx.imageSmoothingEnabled;
        if (density > 1) ctx.imageSmoothingEnabled = true;
        const hdMotion=this.hdEffects && sprite.hdMotion;
        if(hdMotion){
          drawHDGroundMotion(ctx,e,p,this.game.time);
          ctx.save();
          const shotAge=this.game.time-e.lastShot, hitAge=this.game.time-(e.lastHit??-Infinity);
          if(sprite.hdMotion==='vehicle'){
            const recoil=shotAge>=0&&shotAge<.24?Math.sin(shotAge/.24*Math.PI)*2.5:0;
            ctx.translate(-Math.cos(e.angle)*recoil, (moving?Math.sin(this.game.time*26+e.id)*.65:0)-Math.sin(e.angle)*recoil*.5);
          }
          if(hitAge>=0&&hitAge<.16)ctx.filter='brightness(1.7) saturate(.6)';
        }
        if(presentation?.lean){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(presentation.lean);ctx.translate(-p.x,-p.y);}
        ctx.drawImage(image,sample.x,sample.y,sourceWidth,sourceHeight,p.x-ax,p.y-ay-flying,fw,fh);
        if(presentation?.lean)ctx.restore();

        if(hdMotion)ctx.restore();
        ctx.imageSmoothingEnabled = smoothing; rendered = true;
        const screen = this.toScreen(e.x,e.y); this.displayedSprites.set(e.id,{x:screen.x-ax*this.zoom,y:screen.y-(ay+flying+(e.kind==='building'?15:0)+(presentation?.height||0))*this.zoom,w:fw*this.zoom,h:fh*this.zoom});
      }
    }
    if(!rendered){this.drawFallbackUnit(ctx,p.x,p.y-flying,e,def,color);}
    if(selected || hovered || e.hp < e.maxHp*.65){
      const barW = def.kind==='building'?Math.min(80,(def.size?.[0]||2)*25):def.category==='infantry'?18:32;
      const by = p.y - flying - (def.kind==='building'?ay*.65: def.category==='infantry'?27:32);
      ctx.fillStyle='#020702';ctx.fillRect(p.x-barW/2-1,by-1,barW+2,5);
      ctx.fillStyle=e.hp/e.maxHp>.5?'#78dd49':e.hp/e.maxHp>.25?'#f8d947':'#e84c30';ctx.fillRect(p.x-barW/2,by,barW*e.hp/e.maxHp,3);
      if(e.veteran>0){ctx.fillStyle='#f5e17c';ctx.font='bold 9px Tahoma';ctx.fillText('★'.repeat(Math.min(3,e.veteran)),p.x+barW/2+3,by+4);}
    }
    if(presentation?.label){ctx.save();ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillStyle=e.id<0?'#f4d391':'#c8f4d5';ctx.strokeStyle='#16241e';ctx.lineWidth=2;ctx.strokeText(presentation.label,p.x,p.y+16);ctx.fillText(presentation.label,p.x,p.y+16);ctx.restore();}
    if(e.controlledBy){const controller=this.game.entities.find(v=>v.id===e.controlledBy);if(controller&&this.onScreen(controller.x,controller.y)){const cp=this.project(controller.x,controller.y);cp.y-=this.elevation(controller.x,controller.y)*15;ctx.strokeStyle='#cd79f782';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cp.x,cp.y-15);ctx.lineTo(p.x,p.y-15);ctx.stroke();}}
    if(e.bomb){ctx.fillStyle='#ffbe70';ctx.font='bold 10px Consolas';ctx.textAlign='center';ctx.fillText(`● ${Math.max(0,Math.ceil(e.bomb.detonatesAt-this.game.time))}`,p.x,p.y-ay*.65-14);}
    if(e.repairing){ctx.fillStyle='#a8f686';ctx.font='bold 15px Tahoma';ctx.fillText('+',p.x-5,p.y-ay*.75-8);}
    if(e.invulnerableUntil && e.invulnerableUntil>this.game.time){ctx.strokeStyle='#f95046';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y-flying-12,24,24,0,0,Math.PI*2);ctx.stroke();}
    if(e.hp < e.maxHp*.4 && def.kind==='building'){const phase=(this.time*15+e.id)%25;ctx.globalAlpha=.4;ctx.fillStyle='#343432';ctx.beginPath();ctx.arc(p.x+5,p.y-ay*.5-phase,5+phase*.15,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
  }
  clearSpriteColors() { for(const canvas of this.tinted.values()){canvas.width=1;canvas.height=1;}this.tinted.clear(); }
  private coloredSprite(sprite: Sprite, color: string): CanvasImageSource | undefined {
    const original = this.assets.images.get(sprite.src);if(!original)return;
    const key=sprite.src+color;const existing=this.tinted.get(key);if(existing)return existing;
    const c=document.createElement('canvas');c.width=original.width;c.height=original.height;const ctx=c.getContext('2d')!;ctx.drawImage(original,0,0);
    const data=ctx.getImageData(0,0,c.width,c.height),d=data.data;
    const hex=color.replace('#','');const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
    const mask=sprite.remapMaskSrc && this.assets.images.get(sprite.remapMaskSrc);let maskData:Uint8ClampedArray|undefined;
    if(mask){const m=document.createElement('canvas');m.width=c.width;m.height=c.height;const mc=m.getContext('2d')!;mc.drawImage(mask,0,0);maskData=mc.getImageData(0,0,m.width,m.height).data;}
    for(let i=0;i<d.length;i+=4){if(maskData ? maskData[i+3]>0 : d[i+3] && d[i]>65 && d[i]>d[i+1]*1.6 && d[i]>d[i+2]*1.35 && d[i+1]<140){const l=maskData?maskData[i]/255:d[i]/255;d[i]=Math.min(255,r*l);d[i+1]=Math.min(255,g*l);d[i+2]=Math.min(255,b*l);}}
    ctx.putImageData(data,0,0);this.tinted.set(key,c);return c;
  }
  private drawFallbackUnit(ctx:CanvasRenderingContext2D,x:number,y:number,e:Entity,def:Definition,color:string){
    ctx.save();ctx.translate(x,y);ctx.strokeStyle='#15241c';ctx.lineWidth=1;
    if(def.category==='infantry'){ctx.fillStyle='#2c352a';ctx.fillRect(-3,-15,3,14);ctx.fillRect(1,-14,3,13);ctx.fillStyle=color;ctx.fillRect(-4,-22,8,11);ctx.fillStyle='#c1ad89';ctx.fillRect(-3,-27,6,5);ctx.fillStyle='#404e34';ctx.fillRect(-4,-29,8,4);}
    else if(def.kind==='building'){const w=(def.size?.[0]||2)*25;ctx.fillStyle='#535a4d';ctx.fillRect(-w,-45,w*2,45);ctx.fillStyle=color;ctx.fillRect(-w,-45,w*2,5);ctx.strokeRect(-w,-45,w*2,45);ctx.fillStyle='#c0c8a4';ctx.font='10px Tahoma';ctx.textAlign='center';ctx.fillText(t(def.name),0,-16);}
    else{ctx.scale(1,.65);ctx.rotate(e.angle+Math.PI/4);ctx.fillStyle='#242c26';ctx.fillRect(-17,-13,34,8);ctx.fillRect(-17,7,34,8);ctx.fillStyle='#85917a';ctx.fillRect(-16,-9,32,20);ctx.fillStyle=color;ctx.fillRect(-9,-7,17,15);ctx.fillStyle='#717b65';ctx.fillRect(0,-2,25,5);ctx.strokeRect(-16,-9,32,20);}
    ctx.restore();
  }
  private diamond(ctx:CanvasRenderingContext2D,x:number,y:number,fill:string,stroke?:string){ctx.beginPath();ctx.moveTo(x,y-15);ctx.lineTo(x+30,y);ctx.lineTo(x,y+15);ctx.lineTo(x-30,y);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.6;ctx.stroke();}}
  attachMinimap(canvas:HTMLCanvasElement){
    this.miniCtx=canvas.getContext('2d')!;canvas.width=400;canvas.height=280;
    const click=(e:MouseEvent)=>{const r=canvas.getBoundingClientRect();const x=(e.clientX-r.left)*canvas.width/r.width,y=(e.clientY-r.top)*canvas.height/r.height;const wx=(x-this.miniOrigin.x)/this.miniScale,wy=(y-this.miniOrigin.y)/this.miniScale;this.camera.x=wx;this.camera.y=wy;this.clampCamera();};
    canvas.addEventListener('click',click);this.cleanup.push(()=>canvas.removeEventListener('click',click));
    const rightClick=(e:MouseEvent)=>{e.preventDefault();e.stopPropagation();click(e);this.draw();this.drawMinimap();};
    canvas.addEventListener('contextmenu',rightClick);this.cleanup.push(()=>canvas.removeEventListener('contextmenu',rightClick));
    this.makeMinimapBase(canvas.width,canvas.height);
  }
  private makeMinimapBase(w:number,h:number){
    const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d')!;const b=this.worldBounds;
    this.miniScale=Math.min((w-10)/(b.maxX-b.minX+60),(h-14)/(b.maxY-b.minY+30));this.miniOrigin={x:(w-(b.minX+b.maxX)*this.miniScale)/2,y:(h-(b.minY+b.maxY)*this.miniScale)/2};
    const colors:Record<string,string>={water:'#153f57',snow:'#b9cbcf',land:this.map.theater==='snow'?'#b6c8c9':'#797c50',ore:'#c6a551',gem:'#aa7c9d',cliff:'#7f9396',road:'#778384',bridge:'#b3a185'};
    for(let y=0;y<this.map.height;y++)for(let x=0;x<this.map.width;x++){const t=this.map.cells[y*this.map.width+x];if(t==='void')continue;const p=this.project(x,y);const raw=this.map.radarColors?.[y*this.map.width+x];ctx.fillStyle=raw?`#${raw.toString(16).padStart(6,'0')}`:colors[t]||'#809383';ctx.fillRect(p.x*this.miniScale+this.miniOrigin.x-1,p.y*this.miniScale+this.miniOrigin.y-1,Math.max(2,60*this.miniScale),Math.max(1,30*this.miniScale));}
    this.miniBase=c;
  }
  drawMinimap(){
    const ctx=this.miniCtx;if(!ctx||!this.miniBase)return;const w=ctx.canvas.width,h=ctx.canvas.height;ctx.fillStyle='#07130e';ctx.fillRect(0,0,w,h);
    const player=this.game.players.find(v=>v.id===this.localId)!;const online=this.game.bootcamp||player.powerProduced>=player.powerConsumed&&this.game.entities.some(e=>e.owner===this.localId&&e.hp>0&&['radar','airforce_command'].includes(e.type));
    if(!online&&!this.game.debugRevealMap){const raw=this.assets.manifest.ui?.[`${player.faction==='soviet'?'sidec02':'sidec01'}-radar`] as Sprite|undefined;const img=raw&&this.assets.images.get(raw.src);if(raw&&img)ctx.drawImage(img,0,0,raw.frameWidth,raw.frameHeight,0,0,w,h);ctx.fillStyle='#061017ab';ctx.fillRect(0,h-31,w,31);ctx.fillStyle='#afbaa8';ctx.font='14px Tahoma';ctx.textAlign='center';ctx.fillText(t(player.powerConsumed>player.powerProduced?'电力不足':'雷达离线'),w/2,h-11);return;}
    ctx.drawImage(this.miniBase,0,0);
    for(let y=0;y<this.map.height;y++)for(let x=0;x<this.map.width;x++){if(!this.game.explored(this.localId,x,y)){const p=this.project(x,y);ctx.fillStyle='#020a08';ctx.fillRect(p.x*this.miniScale+this.miniOrigin.x-1,p.y*this.miniScale+this.miniOrigin.y-1,Math.max(2,60*this.miniScale),Math.max(1,30*this.miniScale));}}
    for(const e of this.game.entities){if(e.hp<=0||e.transportedBy||!this.game.visible(this.localId,e.x,e.y))continue;const p=this.project(e.x,e.y);ctx.fillStyle=this.game.players.find(v=>v.id===e.owner)?.color||PLAYER_COLORS[e.owner]||'#a6aaa0';const s=e.kind==='building'?5:3;ctx.fillRect(p.x*this.miniScale+this.miniOrigin.x-s/2,p.y*this.miniScale+this.miniOrigin.y-s/2,s,s);}
    ctx.strokeStyle='#dde7aa';ctx.lineWidth=1;
    if(this.modelLayer){ctx.beginPath();[[0,0],[this.width,0],[this.width,this.height],[0,this.height]].forEach(([x,y],i)=>{const point=this.screenToTile(x,y),p=this.project(point.x,point.y),px=p.x*this.miniScale+this.miniOrigin.x,py=p.y*this.miniScale+this.miniOrigin.y;i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.closePath();ctx.stroke();}
    else ctx.strokeRect((this.camera.x-this.width/(2*this.zoom))*this.miniScale+this.miniOrigin.x,(this.camera.y-this.height/(2*this.zoom))*this.miniScale+this.miniOrigin.y,this.width/this.zoom*this.miniScale,this.height/this.zoom*this.miniScale);
  }
}
