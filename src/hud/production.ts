/** Production cards retain engine availability, queue and cancellation semantics. */
import type { Assets, Sprite } from '../assets';
import { CATALOG, type GameEngine, type ProductionCategory } from '../game';
import { productionItems } from './availability';
import { getLocale, localizeElement, t } from '../i18n';
import { clockFrame, setSprite } from './skin';
import { formatCountdown } from '../game/support';

const escape = (value:unknown) => String(value).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]!));
const supportStatus = (ability: ReturnType<GameEngine['getSupport']>[number]) =>
  ability.paused ? t('电力不足') : ability.ready ? t('就绪') : formatCountdown(ability.remaining);
interface ProductionView {
  game:GameEngine; assets:Assets; category:ProductionCategory; clock:Sprite;
  onBuild(id:string):void; onReady(id:string):void; onCancel(category:ProductionCategory):void; onSupport(id:string):void;
}
export function renderProduction(view:ProductionView, previous:string):string {
  const {game,assets,category,clock}=view,p=game.players[0];
  const list=document.querySelector<HTMLElement>('#build-list')!;
  if(list.querySelector('.build-item:active'))return previous;
  const detail=document.querySelector<HTMLElement>('#build-detail')!;
  const visible=productionItems(game,category);
  const supports=category==='defense'?game.getSupport(0):[];
  const signature=getLocale()+category+visible.map(d=>`${d.id}:${game.canBuild(0,d.id)}:${p.queues[d.category].map(q=>q.type+q.ready).join(',')}`).join('|')+
    supports.map(a=>`${a.id}:${a.cameo}`).join('|');
  if(signature!==previous) {
    const focused=(document.activeElement as HTMLElement)?.dataset.build;
    const focusedSupport=(document.activeElement as HTMLElement)?.dataset.support;
    const scroll=list.scrollTop;
    detail.hidden=true;
    const buildingCards=visible.map(d=>{
      const items=p.queues[d.category].filter(q=>q.type===d.id),ready=items.some(q=>q.ready);
      const can=game.canBuild(0,d.id)||ready||(items.length>0&&d.category!=='aircraft'&&d.buildLimit===undefined);
      const key=d.cameo.replace(/icon$/,''),entry=assets.manifest.cameos?.[key]||assets.manifest.cameos?.[d.sprite];
      const url=typeof entry==='string'?entry:entry?.src;
      return `<button class="build-item ${can?'':'locked'} ${items.length?'queued':''}" data-testid="build-item" data-build="${d.id}" aria-label="${escape(t(d.name))}, $${d.cost}${ready?', '+t('就绪'):''}" aria-disabled="${!can}" aria-describedby="build-detail" title="${escape(t(d.name))} — $${d.cost}\n${escape(t(d.description))}\n${escape(t(game.getBuildReason(0,d.id)))}">${url?`<img src="${url}" alt="" draggable="false"/>`:`<span class="placeholder-cameo">${escape(t(d.name))}</span>`}<span class="progress-mask" hidden></span>${items.length>1?`<span class="queue-count">${items.length}</span>`:''}${ready?`<span class="ready-text">${t('就绪')}</span>`:''}<span class="item-name">${escape(t(d.name))}</span></button>`;
    }).join('');
    const supportCards=supports.map(a=>{
      const entry=assets.manifest.cameos?.[a.cameo];
      const url=typeof entry==='string'?entry:entry?.src;
      const status=supportStatus(a);
      return `<button class="build-item support-item" data-testid="support-item" data-support="${a.id}" aria-label="${escape(t(a.name))}, ${escape(status)}" aria-disabled="${!a.ready}" title="${escape(t(a.name))} — ${escape(status)}">${url?`<img src="${url}" alt="" draggable="false"/>`:`<span class="placeholder-cameo">${escape(t(a.name))}</span>`}<span class="progress-mask" hidden></span><span class="ready-text" hidden></span><span class="item-name">${escape(t(a.name))}</span></button>`;
    }).join('');
    list.innerHTML=supportCards+buildingCards;
    list.querySelectorAll<HTMLButtonElement>('[data-build]').forEach(el=>{
      const id=el.dataset.build!,d=CATALOG[id];
      el.onclick=()=>{if(p.queues[d.category].some(q=>q.type===id&&q.ready))view.onReady(id);else if(game.canBuild(0,id))view.onBuild(id);};
      el.oncontextmenu=e=>{e.preventDefault();view.onCancel(d.category);};
      const show=()=>{detail.innerHTML=`<strong>${escape(t(d.name))} · $${d.cost}</strong><p>${escape(t(d.description))}</p><p>${escape(t(game.getBuildReason(0,id)))}</p>`;detail.hidden=false;};
      el.onmouseenter=show;el.onfocus=show;
      el.onmouseleave=()=>{detail.hidden=true;};el.onblur=()=>{detail.hidden=true;};
    });
    list.querySelectorAll<HTMLButtonElement>('[data-support]').forEach(el=>{
      const current=()=>game.getSupport(0).find(a=>a.id===el.dataset.support);
      el.onclick=()=>{const ability=current();if(ability?.ready)view.onSupport(ability.id);};
      const show=()=>{const ability=current();if(!ability)return;detail.innerHTML=`<strong>${escape(t(ability.name))}</strong><p>${escape(supportStatus(ability))}</p>`;detail.hidden=false;};
      el.onmouseenter=show;el.onfocus=show;
      el.onmouseleave=()=>{detail.hidden=true;};el.onblur=()=>{detail.hidden=true;};
    });
    list.scrollTop=scroll;
    if(focused)list.querySelector<HTMLButtonElement>(`[data-build="${focused}"]`)?.focus({preventScroll:true});
    if(focusedSupport)list.querySelector<HTMLButtonElement>(`[data-support="${focusedSupport}"]`)?.focus({preventScroll:true});
    localizeElement(list);
  }
  list.querySelectorAll<HTMLElement>('[data-build]').forEach(el=>{
    const d=CATALOG[el.dataset.build!],first=p.queues[d.category][0];
    const mask=el.querySelector<HTMLElement>('.progress-mask')!;
    mask.hidden=first?.type!==d.id||first.ready;
    if(!mask.hidden){const frame=clockFrame(first.progress,clock.frames);setSprite(mask,clock,frame);mask.dataset.frame=String(frame);}
  });
  list.querySelectorAll<HTMLElement>('[data-support]').forEach(el=>{
    const ability=supports.find(a=>a.id===el.dataset.support)!;
    const status=supportStatus(ability),label=`${t(ability.name)} — ${status}`;
    const ready=el.querySelector<HTMLElement>('.ready-text')!;
    ready.hidden = !ability.ready && !ability.paused;
    if(ready.textContent!==status)ready.textContent=status;
    const mask=el.querySelector<HTMLElement>('.progress-mask')!;
    mask.hidden=ability.remaining<=0;
    if(!mask.hidden){const frame=clockFrame(1-ability.remaining/ability.total,clock.frames);setSprite(mask,clock,frame);mask.dataset.frame=String(frame);}
    el.setAttribute('aria-disabled',String(!ability.ready));
    el.setAttribute('aria-label',`${t(ability.name)}, ${status}`);
    el.title=label;
  });
  return signature;
}
