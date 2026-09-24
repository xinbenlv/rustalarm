import { drawWeaponShot } from './weapon-effects';
import {unitIsMoving} from './sprite-animation';
import type { Entity, Effect, Point } from './game/types';
import type { GameEngine } from './game/engine';
import type { Assets } from './assets';

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const g=ctx.createRadialGradient(x,y,0,x,y,radius);g.addColorStop(0,'#fff7d5');g.addColorStop(.25,color);g.addColorStop(1,'transparent');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
}
/** Resolution-independent effects drawn inside the engine's world transform. */
export function drawHDCombatEffect(ctx: CanvasRenderingContext2D, effect: Effect, p: Point, game: GameEngine, project: (x:number,y:number)=>Point, assets?: Assets): boolean {
  if(!['shot','hit','explosion','nuke'].includes(effect.kind))return false;
  const t=Math.min(1,effect.age/effect.duration);ctx.save();
  if(effect.kind==='shot'&&effect.toX!=null&&effect.toY!=null){
    const q=project(effect.toX,effect.toY);
    drawWeaponShot(ctx,effect,{x:p.x,y:p.y-(effect.fromHeight??12)},{x:q.x,y:q.y-(effect.toHeight??6)},1,assets);
  }else if(effect.kind==='hit'){
    ctx.globalAlpha=1-t;glow(ctx,p.x,p.y-14,5+t*13,'#ffc35c');
    for(let i=0;i<7;i++){const a=i*2.399+effect.id;const r=3+t*(12+i*2);ctx.strokeStyle=i%2?'#fff1a4':'#e9914c';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(p.x+Math.cos(a)*r*.55,p.y-14+Math.sin(a)*r*.4);ctx.lineTo(p.x+Math.cos(a)*r,p.y-14+Math.sin(a)*r*.7+t*t*10);ctx.stroke();}
  }else{
    p = { x: p.x, y: p.y - (effect.fromHeight ?? 0) };
    const radius=effect.kind==='nuke'?140:effect.radius&&effect.radius>1?65:26;
    ctx.globalAlpha=1-t;glow(ctx,p.x,p.y-12,Math.max(2,radius*Math.sin(Math.min(1,t*2)*Math.PI/2)),'#f17b25');
    ctx.strokeStyle='#ffd094';ctx.lineWidth=2*(1-t);ctx.beginPath();ctx.ellipse(p.x,p.y,radius*t*1.5,radius*t*.65,0,0,Math.PI*2);ctx.stroke();
    for(let i=0;i<10;i++){const a=i*2.4+effect.id,dist=radius*t*(.4+i*.08);ctx.globalAlpha=(1-t)*.65;ctx.fillStyle=i%3?'#46433c':'#ffb342';ctx.beginPath();ctx.arc(p.x+Math.cos(a)*dist,p.y-12+Math.sin(a)*dist*.45-t*25,2+t*(4+i%3),0,Math.PI*2);ctx.fill();}
  }
  ctx.restore();return true;
}

export function drawHDGroundMotion(ctx: CanvasRenderingContext2D, e: Entity, p: Point, time: number) {
  ctx.save();
  if(unitIsMoving(e,time)&&e.kind==='unit'){
    const infantry=e.type==='tanya';
    for(let i=0;i<(infantry?3:6);i++){
      const age=(time*(infantry?2:1.3)+i/6+e.id*.17)%1;
      const trail=age*(infantry?10:23),side=i%2?1:-1;
      ctx.globalAlpha=(1-age)*.24;ctx.fillStyle='#c9b68a';ctx.beginPath();
      ctx.ellipse(p.x-Math.cos(e.angle)*trail+side*(infantry?2:10),p.y-Math.sin(e.angle)*trail*.5-age*4,1+age*(infantry?2:7),1+age*3,0,0,Math.PI*2);ctx.fill();
    }
  }
  if(e.repairing){
    ctx.strokeStyle='#9df3b2';ctx.globalAlpha=.6;ctx.lineWidth=1.4;const phase=(time*1.3)%1;
    ctx.beginPath();ctx.ellipse(p.x,p.y,25+phase*22,12+phase*11,0,0,Math.PI*2);ctx.stroke();
    for(let i=0;i<3;i++){const y=p.y-15-((time*18+i*15)%55),x=p.x+(i-1)*18;ctx.beginPath();ctx.moveTo(x-3,y);ctx.lineTo(x+3,y);ctx.moveTo(x,y-3);ctx.lineTo(x,y+3);ctx.stroke();}
  }
  ctx.restore();
}
