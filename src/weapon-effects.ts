import type { Effect, Point } from './game/types';
import type { Assets } from './assets';

export function projectileFrame(from: Point, to: Point, facings = 32): number {
  const angle = Math.atan2(-(to.x - from.x), -(to.y - from.y));
  return (Math.round(angle / (Math.PI * 2) * facings) + facings) % facings;
}

/** 所有视图共用武器形状。调用方提供已经投影的发射点和目标点。 */
export function drawWeaponShot(ctx: CanvasRenderingContext2D, effect: Effect, from: Point, to: Point, scale = 1, assets?: Assets) {
  const elapsed = effect.age - (effect.delay ?? 0);
  if (elapsed < 0) return;
  const t = Math.min(1, elapsed / (effect.duration - (effect.delay ?? 0))), weapon = effect.weapon;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 1.5 * scale;
  const line = (a: Point, b: Point) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
  const at = (u: number): Point => ({ x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u - Math.sin(u * Math.PI) * (effect.arc ?? 0) * scale });
  if (weapon === 'tesla' || weapon === 'prism' || weapon === 'chrono' || weapon === 'radiation') {
    ctx.globalAlpha = effect.prismSupport ? .8 : 1 - t * .7;
    ctx.strokeStyle = weapon === 'prism' ? effect.color ?? '#ff6a63' : weapon === 'radiation' ? '#b0ff35' : '#b4e9ff';
    ctx.lineWidth = (effect.beamWidth ?? 2) * scale;
    if (weapon === 'tesla') {
      ctx.beginPath(); ctx.moveTo(from.x, from.y);
      for (let i = 1; i <= 8; i++) { const p = at(i / 8); ctx.lineTo(p.x + (i === 8 ? 0 : Math.sin(i * 13 + effect.id) * 6 * scale), p.y); }
      ctx.stroke();
    } else {
      if (weapon === 'prism') { ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 5 * scale; }
      line(from, to); ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = .7 * scale; line(from, to);
    }
  } else if (weapon === 'melee' || weapon === 'explosive' || weapon === 'flak') {
    ctx.strokeStyle = weapon === 'flak' ? '#767575' : '#ffd581'; ctx.globalAlpha = 1 - t;
    const radius = (weapon === 'flak' ? 5 + t * 12 : 3 + t * 7) * scale;
    ctx.beginPath(); ctx.arc(to.x, to.y, radius, 0, Math.PI * 2); ctx.stroke();
  } else if (weapon === 'sonic') {
    const p = at(t); ctx.strokeStyle = '#65ddf5'; ctx.globalAlpha = 1 - t * .5;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(p.x, p.y, (4 + i * 4) * scale, (2 + i * 2) * scale, Math.atan2(to.y-from.y,to.x-from.x), 0, Math.PI * 2); ctx.stroke(); }
  } else if (weapon === 'carrier') {
    const u = t < .5 ? t * 2 : (1 - t) * 2;
    for (let i = 0; i < (effect.burst ?? 3); i++) {
      const p = at(u), offset = (i - 1) * 10 * scale;
      ctx.save(); ctx.translate(p.x + offset, p.y - Math.sin(u * Math.PI) * 28 * scale);
      ctx.rotate(Math.atan2(to.y-from.y,to.x-from.x) + (t > .5 ? Math.PI : 0));
      ctx.fillStyle = effect.color ?? '#d1d6dc'; ctx.beginPath(); ctx.moveTo(8*scale,0); ctx.lineTo(-5*scale,-5*scale); ctx.lineTo(-2*scale,0); ctx.lineTo(-5*scale,5*scale); ctx.closePath(); ctx.fill(); ctx.restore();
      if (t > .4 && t < .5) { ctx.strokeStyle = '#ffdc6b'; line({x:p.x+offset,y:p.y-10*scale},to); }
    }
  } else {
    for (let i = 0; i < (effect.burst ?? 1); i++) {
      const p = at(t), tail = at(Math.max(0, t - .14)), offset = i * 4 * scale;
      p.x += offset; tail.x += offset;
      if (weapon === 'missile' && effect.projectileSprite && assets) {
        for (let n = 1; n <= 4 && t > n * .018; n++) {
          const smoke = at(t - n * .018);
          ctx.globalAlpha = (1 - n / 5) * .4; ctx.fillStyle = '#a5a5a5';
          ctx.beginPath(); ctx.arc(smoke.x + offset, smoke.y, (1 + n * .35) * scale, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        const direction = t > 0 ? tail : from, tip = t > 0 ? p : to;
        if (assets.draw(ctx, effect.projectileSprite, p.x, p.y, projectileFrame(direction, tip), scale)) continue;
      }
      ctx.strokeStyle = weapon === 'torpedo' ? '#b9efed' : '#ffd16d';
      if (weapon !== 'bomb') line(tail, p);
      if (weapon === 'missile' || weapon === 'bomb' || weapon === 'shell' || weapon === 'torpedo') {
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(Math.atan2(p.y-tail.y,p.x-tail.x));
        ctx.fillStyle = weapon === 'bomb' ? '#454a54' : '#dae1dd'; ctx.strokeStyle = '#242730'; ctx.lineWidth = scale;
        ctx.beginPath(); ctx.moveTo(5*scale,0); ctx.lineTo(-3*scale,-2*scale); ctx.lineTo(-5*scale,-4*scale); ctx.lineTo(-5*scale,4*scale); ctx.lineTo(-3*scale,2*scale); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }
  }
  ctx.restore();
}
