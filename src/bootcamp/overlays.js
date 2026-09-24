import { drawWeaponShot } from '../weapon-effects';
// Gameplay feedback projected through the active 3D camera, using existing effects and placement state.
export function drawWorldOverlays(view,layer,marker){
  const {ctx,game}=view,project=(x,y,h=0)=>layer.rig.project(x,y,view,true,h);
  const cell=(x,y,fill)=>{
    const points=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([dx,dy])=>project(x+dx,y+dy,.015));
    ctx.fillStyle=fill;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();
  };
  for(const effect of game.effects){
    if(!game.visible(view.localId,effect.x,effect.y))continue;
    const t=effect.age/effect.duration,p=project(effect.x,effect.y,.25);
    if(effect.kind==='shot'&&effect.toX!=null&&effect.toY!=null){
      const source=project(effect.x,effect.y,(effect.fromHeight??12)/30),target=project(effect.toX,effect.toY,(effect.toHeight??6)/30);
      drawWeaponShot(ctx,effect,source,target,view.zoom,view.assets);
    }else if(effect.kind==='explosion'||effect.kind==='nuke'){
      const impact=project(effect.x,effect.y,(effect.fromHeight??0)/30);
      const name=effect.kind==='nuke'?'twlt100':'twlt050',sprite=view.assets.sprite(name);
      if(sprite)view.assets.draw(ctx,name,impact.x,impact.y,Math.min(sprite.frames-1,Math.floor(t*sprite.frames)),view.zoom);
    }else if(effect.kind==='text'&&effect.text){ctx.font='bold 12px Tahoma';ctx.fillStyle=effect.color||'#ffeba6';ctx.fillText(effect.text,p.x,p.y-t*24);}
    else if(effect.kind==='deploy'||effect.kind==='hit'){
      ctx.strokeStyle=effect.color||'#e9bc63';ctx.globalAlpha=1-t;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1,t*18*view.zoom),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
    }
  }
  if(view.placement&&view.mouse.inside){
    const p=view.screenToTile(view.mouse.x,view.mouse.y),bounds=game.getPlacementBounds(view.placement.id,p.x,p.y),valid=game.canPlace(view.localId,view.placement.id,p.x,p.y);
    for(let y=bounds.y;y<bounds.y+bounds.height;y++)for(let x=bounds.x;x<bounds.x+bounds.width;x++)cell(x,y,valid?'#78e67590':'#f0403890');
  }
  if(marker){
    const p=project(marker.x,marker.y,.03);ctx.strokeStyle=marker.attack?'#fa6253':'#76ee63';ctx.globalAlpha=1-marker.age;ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(p.x,p.y,10+marker.age*16,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  }
}
