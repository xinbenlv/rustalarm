import type { Sprite } from './assets';
import type { Entity } from './game/types';

export function unitIsMoving(entity: Entity, time: number) {return entity.path.length>0&&(entity.lastMovedAt==null||time-entity.lastMovedAt<.12);}

/** Convert world XY heading once, independently of action/frame timing.
 * Original SHP: frame 0 faces screen north; world +X projects southeast (frame 5).
 * Converted VXL and HD atlases are already baked in world XY order.
 */
export function spriteFacing(sprite:Sprite,angle:number){
  const count=sprite.facings??(sprite.sequences?8:sprite.frames);
  if(count<=1)return 0;
  const convention=sprite.facingConvention??(sprite.sequences&&sprite.originalFile?.toLowerCase().endsWith('.shp')?'ra2-shp':'world-xy');
  const turns=angle/(Math.PI*2),index=Math.round((convention==='ra2-shp'?5/8-turns:turns)*count);
  return ((index%count)+count)%count;
}

/** Event-relative animation timing prevents shots/hits starting halfway through a clip. */
export function spriteAnimation(sprite: Sprite, entity: Entity, time: number, swimming = false) {
  const direction=spriteFacing(sprite,entity.angle);
  if (!sprite.sequences) {const action=sprite.hdMotion?(time-(entity.lastHit??-Infinity)<.3?'hit':time-entity.lastShot<.3?'fireup':unitIsMoving(entity,time)?'walk':'ready'):'ready';return {action,frame:direction};}
  if (!sprite.animationFps || sprite.animationClock==='source') {
    const action=swimming ? (time-entity.lastShot<.5?'wetattack':entity.path.length?'swim':'tread') : entity.deployed?'deployed':time-entity.lastShot<.5?'fireup':entity.path.length?'walk':'ready';
    const sequence=sprite.sequences[action]??sprite.sequences.ready??[0,1,1];
    return {action,frame:sequence[0]+direction*sequence[2]+Math.floor(time*12)%sequence[1]};
  }
  const fps = sprite.animationFps;
  const hit = time - (entity.lastHit ?? -Infinity), shot = time - entity.lastShot;
  let action = entity.deployed ? 'deployed' : unitIsMoving(entity,time) ? 'walk' : 'ready';
  let elapsed = time + entity.id * .073;
  if (shot >= 0 && shot < (sprite.sequences.fireup?.[1] ?? 6) / fps) {action = 'fireup'; elapsed = shot;}
  if (sprite.sequences.hit && hit >= 0 && hit < sprite.sequences.hit[1] / fps) {action = 'hit'; elapsed = hit;}
  const sequence = sprite.sequences[action] ?? sprite.sequences.ready ?? [0, 1, 1];
  const frame = sequence[0] + direction * sequence[2] + Math.floor(elapsed * fps) % sequence[1];
  return {action, frame: Math.max(0, Math.min(sprite.frames - 1, frame))};
}
