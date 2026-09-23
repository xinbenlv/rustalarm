// Main application lifecycle: mode selection, shared lobby and one simulation/render loop.
import './style.css';
import { mountBuildVersion } from './build-version';
import { APP_TITLE } from './project';
import { projectNotice, sourceCodeLink } from './project-notice';
import { mountRendererSwitch } from './bootcamp/switcher';
import { Sidebar, sidebarMarkup } from './hud/sidebar';
import { renderProduction } from './hud/production';
import { availableTabs } from './hud/availability';
import { loadMenuSkin } from './hud/menu-skin';
import { mountMenuVideo } from './hud/menu-video';
import { monitorMarkup, railHeader, showEntrySplash } from './hud/menu-shell';
import { mountCommandBar, updateCommandBar, selectType } from './hud/command-bar';
import { showOptions, applyScreenSize } from './hud/options';
import { layoutLobby } from './hud/lobby-layout';
import { openMapPicker } from './hud/map-picker';
import { mountDebugPanel } from './debug-panel';
import { appUrl } from './urls';
import { t, registerTranslations, localizeElement, languageControl, bindLanguageControl } from './i18n';
import { probeOriginalAssets, showAssetSetup, OriginalAssetsError } from './asset-setup';
import { Assets, SoundSystem } from './assets';
import { initializeMaps, listMaps, loadMap, registerImportedMap, isWithinPlayableArea, type MapData, type MapDefinition } from './maps';
import { customMapToMapData } from './custom-maps';
import {createTrainingMap,TRAINING_MAP_ID} from './bootcamp/training-map';
import { readSkirmishMap } from './map-files';
import { mountMapEditor } from './map-editor';
import { GameEngine, COUNTRIES, CATALOG, CATEGORY_NAMES, PLAYER_COLORS, countryById, getDefinition, type CountryId, type Difficulty, type PlayerConfig, type ProductionCategory, type Entity } from './game';
import { BattlefieldRenderer, type RenderMap } from './renderer';

const app = document.querySelector<HTMLDivElement>('#app')!;
mountBuildVersion();
document.title=APP_TITLE;
registerTranslations({
  '新兵训练营':'Bootcamp', '选择模式':'Choose a mode', '返回模式选择':'Choose mode',
  '准备原版素材':'Prepare original assets', 'Alt + 左键拖动（3D）':'Alt + Left Drag (3D)', '旋转三维视角。':'Orbit the 3D camera.',
  '训练营尚无此型号的 3D 模型':'This type has no verified Bootcamp 3D model',
  '没有适合该单位的空闲地形':'No free terrain suitable for this unit',
  '训练营尚无基地车的 3D 模型':'No MCV model is available in Bootcamp',
  '8 种已支持部队 + 建造厂':'8 supported unit types + construction yard',
  '结束训练':'End training', '退出到模式选择':'Return to mode selection',
  '地图编辑器':'Map editor', '上传地图':'Upload map', '编辑器地图':'Editor map', '已有素材训练场':'Existing asset training field',
  '上传地图文件':'Upload map file', '自定义地图文件超过 2 MB。':'Custom map files must be under 2 MB.',
  '地图文件超过 16 MB。':'Map files must be under 16 MB.',
  '上传 .ra2map / .map / .mpr':'Upload .ra2map / .map / .mpr',
  '地图已加入遭遇战。':'Map added to skirmish.',
});
for (const [name, file] of Object.entries({ 'menu-map':'mnscrnl', 'loading-art':'glsl' }))
  document.documentElement.style.setProperty(`--${name}`, `url("${appUrl(`/assets/ui/${file}.png`)}")`);
registerTranslations(Object.fromEntries(COUNTRIES.map(country => [country.name, country.nameEn])));
const nameCounts = new Map<string, number>();
for (const definition of Object.values(CATALOG)) nameCounts.set(definition.name, (nameCounts.get(definition.name) ?? 0) + 1);
registerTranslations(Object.fromEntries(Object.values(CATALOG).map(definition => [definition.name, nameCounts.get(definition.name)! > 1 ? definition.nameEn.replace(/^(Allied|Soviet) /, '') : definition.nameEn])));
function translateUI(root: ParentNode = app) { localizeElement(root); }
function bindLanguage() { bindLanguageControl(app, () => { buildSignature='';if(playing)updateUI(); }); }
const assets = new Assets();
const sound = new SoundSystem(assets);
sound.musicEnabled = true;
const bolts = '<i class="bolt tl"></i><i class="bolt tr"></i><i class="bolt bl"></i><i class="bolt br"></i>';
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]!));
const $ = <T extends HTMLElement = HTMLElement>(selector: string, parent: ParentNode = document): T => parent.querySelector(selector)!;
interface Slot { country: CountryId | 'random'; difficulty: Difficulty | 'closed' | 'human'; color: number; team: number; position: number }
const slots: Slot[] = Array.from({length:8},(_,i)=>({country:i===0?'america':i===1?'russia':'random',difficulty:i===0?'human':i===1?'medium':'closed',color:i,team:0,position:i===0?0:i===1?4:-1}));
let mode: 'skirmish' | 'bootcamp' = 'skirmish';
let loaded = false;
let sidebar: Sidebar | undefined;
let disposeSwitch: (()=>void) | undefined;
let selectedMapId = 'mp22s8';
let selectedMap: MapData;
let credits = 10000, startingUnits = 5, gameSpeed = 1, fog = true, superweapons = true, shortGame = true;
let game: GameEngine | undefined, renderer: BattlefieldRenderer | undefined;
let category: ProductionCategory = 'structure';
let playing = false, animation = 0, lastTick = 0, lastUI = 0, lastEvent = 0, lastComplete = 0;
let modalOpen = false, modalOwnsPause = false;
let modalReturnFocus:HTMLElement | undefined;
let supportMode: string | undefined;
let lastSoundEffect = 0;
let notices: {text:string;until:number;warn:boolean}[] = [];
let shownResult = false;
let buildSignature = '';
let disposeMenuVideo: (()=>void) | undefined;
let disposeEditor: (() => void) | undefined;
const groups = new Map<string, number[]>();

function renderModeSelect() {
  disposeMenuVideo?.();disposeMenuVideo=undefined;
  sidebar?.destroy();sidebar=undefined;
  disposeSwitch?.();disposeSwitch=undefined;disposeEditor?.();disposeEditor=undefined;
  playing=false;cancelAnimationFrame(animation);renderer?.destroy();renderer=undefined;game=undefined;
  app.innerHTML=`<main class="shell mode-screen" data-testid="mode-screen">${monitorMarkup}<aside class="command-rail">${railHeader('主菜单')}
    <nav class="mode-options" aria-label="选择模式"><button data-testid="mode-skirmish">遭遇战</button><button data-testid="mode-bootcamp">新兵训练营</button></nav>
    <div class="mode-tools"><button data-testid="mode-editor">地图编辑器</button><button data-testid="mode-assets">游戏素材</button><button id="menu-info">信息与制作人员</button></div>${languageControl()}<div class="rail-bottom"><button id="menu-fullscreen">全屏</button></div></aside><div class="menu-status" aria-hidden="true"></div></main>`;
  const menuRoot=$<HTMLElement>('.mode-screen');
  void loadMenuSkin().then(src=>{if(menuRoot.isConnected&&!entering)disposeMenuVideo=mountMenuVideo(menuRoot,src);});
  $('#menu-info').onclick=()=>{const root=showModal('信息与制作人员',`${sourceCodeLink()}${projectNotice()}`,'');root.querySelector('details')?.setAttribute('open','');};
  $('#menu-fullscreen').onclick=()=>void (document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()).catch(()=>toast('浏览器未能切换全屏。'));
  translateUI();bindLanguage();
  let entering=false;
  const enter=async(next:'skirmish'|'bootcamp',editor=false)=>{
    if(entering)return;entering=true;disposeMenuVideo?.();disposeMenuVideo=undefined;const previous=mode;mode=next;
    try{await prepareGame();if(loaded){
      if(next==='bootcamp'&&(previous!==next||selectedMapId==='mp22s8')){selectedMap=await loadMap(TRAINING_MAP_ID);selectedMapId=selectedMap.id;fog=false;slots[1].position=1;}
      else if(next==='skirmish'&&selectedMapId===TRAINING_MAP_ID){selectedMap=await loadMap('mp22s8');selectedMapId=selectedMap.id;fog=true;slots[1].position=4;}
      renderLobby();if(editor)openMapEditor();}}
    catch(error){renderModeSelect();toast(error instanceof Error?error.message:String(error));}
    finally{entering=false;}
  };
  $('[data-testid="mode-skirmish"]').onclick=()=>void enter('skirmish');
  $('[data-testid="mode-bootcamp"]').onclick=()=>void enter('bootcamp');
  $('[data-testid="mode-editor"]').onclick=()=>void enter('skirmish',true);
  $('[data-testid="mode-assets"]').onclick=()=>{disposeMenuVideo?.();disposeMenuVideo=undefined;showAssetSetup(app);addSetupBack();};
}
function addSetupBack(){const button=document.createElement('button');button.textContent=t('返回模式选择');button.className='setup-mode-back';button.onclick=renderModeSelect;app.prepend(button);}
async function prepareGame() {
  if(loaded)return;
  if(!await probeOriginalAssets()){showAssetSetup(app);addSetupBack();return;}
  await initializeMaps();
  registerImportedMap(createTrainingMap());
  registerTranslations(Object.fromEntries(listMaps().map(map => [map.name, map.nameEn])));
  app.innerHTML = `<div class="loading-screen"><div><h1 class="app-title">${APP_TITLE}</h1><p id="loading-label">正在读取原版战场资料</p><div class="loading-bar"><i id="loading-progress" style="width:5%"></i></div></div></div>`;
  translateUI();
  const mapPromise = loadMap(selectedMapId);
  await assets.load(progress => { const el = document.querySelector<HTMLElement>('#loading-progress');if(el)el.style.width=`${5+progress*90}%`; });
  selectedMap = await mapPromise;
  loaded = true;
  void loadMenuSkin();
}
function countryOptions(value: string, random = true) {
  return `${random?`<option value="random" ${value==='random'?'selected':''}>随机国家</option>`:''}${COUNTRIES.map(c=>`<option value="${c.id}" ${value===c.id?'selected':''}>${c.flag} ${c.name}</option>`).join('')}`;
}
function option(value: number | string, text: string, current: number | string) { return `<option value="${value}" ${value===current?'selected':''}>${text}</option>`; }
function renderLobby() {
  sidebar?.destroy();sidebar=undefined;
  disposeSwitch?.();disposeSwitch=undefined;
  disposeEditor?.();disposeEditor=undefined;
  playing = false; shownResult = false; cancelAnimationFrame(animation); renderer?.destroy();renderer=undefined;game=undefined;
  const def = listMaps().find(m=>m.id===selectedMapId)!;
  app.innerHTML = `<main class="shell">
    <header class="header"><div class="brand"><h1 class="app-title">${APP_TITLE}</h1><div class="brand-caption"><strong>${mode==='bootcamp'?'新兵训练营':'遭遇战'}</strong><span class="eyebrow">${mode.toUpperCase()}</span></div></div><div class="header-right"><button id="mode-back" data-testid="mode-back">返回模式选择</button>${languageControl()}<button id="sound-toggle" class="icon-button" title="音效">${sound.enabled?'♪':'♩'}</button><button id="help">操作说明</button></div></header>
    <div class="lobby"><section class="map-panel metal">${bolts}<div class="panel-title"><h2>战场情报</h2></div><div class="map-viewport"><canvas id="map-preview" aria-label="${escape(def.name)}"></canvas><i class="map-corner tl"></i><i class="map-corner tr"></i><i class="map-corner bl"></i><i class="map-corner br"></i></div><div class="map-info"><div><h3>${escape(def.name)}</h3><p>${def.players} 人</p></div><button id="choose-map">选择地图 ▸</button></div><div class="map-details"><div><label>战场规模</label><strong>${def.width} × ${def.height}</strong></div><div><label>作战地形</label><strong>${({snow:'雪地 · 海岛',temperate:'温带',urban:'城市'} as Record<string,string>)[def.theater] || def.theater}</strong></div><div><label>地图来源</label><strong>${selectedMap.id===TRAINING_MAP_ID?'已有素材训练场':def.official?'Westwood 原版':selectedMap.layout==='rectangular'?'编辑器地图':'本地导入'}</strong></div></div></section>
    <section class="settings-panel metal">${bolts}<div class="panel-title"><h2>作战部署</h2><span>${slots.filter(s=>s.difficulty!=='closed').length}</span></div><table class="player-table"><thead><tr><th></th><th>指挥官</th><th>国家</th><th>颜色</th><th>盟友</th><th>位置</th></tr></thead><tbody>${slots.map((slot,i)=>renderSlot(slot,i,def.players)).join('')}</tbody></table>
    <div class="lobby-options"><div class="field"><label for="credits">初始资金</label><select id="credits">${[5000,10000,20000,30000,50000].map(v=>option(v,`$ ${v.toLocaleString()}`,credits)).join('')}</select></div><div class="field"><label for="units">初始部队</label><select id="units">${[0,3,5,10].map(v=>option(v,`${v} 支部队 + 基地车`,startingUnits)).join('')}</select></div><div class="field"><label for="speed">游戏速度</label><select id="speed">${option(.75,'慢速',gameSpeed)}${option(1,'正常',gameSpeed)}${option(1.5,'快速',gameSpeed)}${option(2,'最快',gameSpeed)}</select></div></div><div class="checks"><label><input type="checkbox" id="fog" ${fog?'checked':''}/>战争迷雾</label><label><input type="checkbox" id="superweapons" ${superweapons?'checked':''}/>超级武器</label><label><input type="checkbox" id="short-game" ${shortGame?'checked':''}/>快速游戏</label><label><input type="checkbox" id="music" ${sound.musicEnabled?'checked':''}/>原版音乐</label></div>
    </section></div>
    <div class="map-sharing-bar"><div class="map-sharing-actions"><input id="lobby-map-file" type="file" accept=".ra2map,.json,.map,.mpr" hidden/><button id="upload-map">上传地图</button><button id="open-map-editor">地图编辑器</button></div></div>
    <div class="lobby-bottom"><button id="start" class="primary start-button">开始作战</button></div>${sourceCodeLink()}${projectNotice()}
  </main>`;
  layoutLobby($('main.shell'));
  translateUI();bindLanguage();
  drawMapPreview($('#map-preview'), selectedMap);
  $('#mode-back').onclick = renderModeSelect;
  if(mode==='bootcamp') {
    $<HTMLSelectElement>('#credits').replaceChildren(new Option('99,999,999','99999999'));
    $<HTMLSelectElement>('#units').replaceChildren(new Option('8 种已支持部队 + 建造厂','8'));
    $<HTMLInputElement>('#superweapons').checked=false;$<HTMLInputElement>('#short-game').checked=false;
    for(const id of ['credits','units','superweapons','short-game']) $<HTMLInputElement>('#'+id).disabled=true;
    translateUI();
  }
  $('#choose-map').onclick = openMapChooser;
  $('#open-map-editor').onclick = openMapEditor;
  $('#upload-map').onclick = () => $('#lobby-map-file').click();
  $('#lobby-map-file').onchange = e => void uploadLobbyMap((e.target as HTMLInputElement));
  $('#help').onclick = showHelp;
  $('#sound-toggle').onclick = () => {sound.enabled=!sound.enabled;$('#sound-toggle').textContent=sound.enabled?'♪':'♩';if(sound.enabled)sound.play('allied_establishingbattlefieldcontrol');};
  $('#start').onclick = startGame;
  $('#credits').onchange = e=>credits=Number((e.target as HTMLSelectElement).value);
  $('#units').onchange = e=>startingUnits=Number((e.target as HTMLSelectElement).value);
  $('#speed').onchange = e=>gameSpeed=Number((e.target as HTMLSelectElement).value);
  $('#fog').onchange = e=>fog=(e.target as HTMLInputElement).checked;
  $('#superweapons').onchange = e=>superweapons=(e.target as HTMLInputElement).checked;
  $('#short-game').onchange=e=>shortGame=(e.target as HTMLInputElement).checked;
  $('#music').onchange = e=>sound.setMusic((e.target as HTMLInputElement).checked);
  document.querySelectorAll<HTMLSelectElement>('[data-slot]').forEach(el=>el.onchange=()=>{
    const index=Number(el.dataset.slot),key=el.dataset.key as keyof Slot;
    const v = key==='color'||key==='team'||key==='position'?Number(el.value):el.value;
    Object.assign(slots[index],{[key]:v});renderLobby();
  });
}
function useLobbyMap(map: MapData) {
  selectedMapId=map.id;selectedMap=map;
  slots.forEach((slot,index)=>{if(index>=map.players)slot.difficulty='closed';if(slot.position>=map.players)slot.position=-1;});
  closeModal();renderLobby();
}
function openMapEditor() {
  closeModal();disposeEditor?.();
  app.replaceChildren();
  disposeEditor=mountMapEditor(app,{
    assets,
    onBack:renderLobby,
    onUse:document=>{const map=customMapToMapData(document);registerImportedMap(map);useLobbyMap(map);toast('地图已加入遭遇战。');},
  });
}
async function uploadLobbyMap(input:HTMLInputElement) {
  const file=input.files?.[0];if(!file)return;
  try {
    const map=await readSkirmishMap(file);
    if(!input.isConnected)return;
    registerImportedMap(map);useLobbyMap(map);toast(`已导入 ${map.name}`);
  } catch(error) {if(input.isConnected)toast(`导入失败：${error instanceof Error?error.message:String(error)}`);}
  finally {input.value='';}
}
function renderSlot(s:Slot,i:number,maxPlayers:number){
  const disabled=i>=maxPlayers;const closed=s.difficulty==='closed'||disabled;
  return `<tr class="${i===0?'human':closed?'closed-row':''}"><td>${String(i+1).padStart(2,'0')}</td><td>${i===0?'<span class="player-name">玩家</span>':`<select aria-label="玩家 ${i+1} 类型" data-slot="${i}" data-key="difficulty" ${disabled?'disabled':''}>${option('closed','— 关闭 —',closed?'closed':s.difficulty)}${option('easy','简单的电脑',s.difficulty)}${option('medium','中等的电脑',s.difficulty)}${option('hard','冷酷的电脑',s.difficulty)}</select>`}</td><td><select aria-label="玩家 ${i+1} 国家" data-slot="${i}" data-key="country" ${closed?'disabled':''}>${countryOptions(s.country,i!==0)}</select></td><td><select class="color-select" style="--player-color:${PLAYER_COLORS[s.color]}" aria-label="玩家 ${i+1} 颜色" data-slot="${i}" data-key="color" ${closed?'disabled':''}>${['金色','红色','蓝色','绿色','橙色','天蓝色','紫色','粉色'].map((v,k)=>option(k,v,s.color)).join('')}</select></td><td><select aria-label="玩家 ${i+1} 盟友" data-slot="${i}" data-key="team" ${closed?'disabled':''}>${option(0,'—',s.team)}${[1,2,3,4].map(v=>option(v,String.fromCharCode(64+v),s.team)).join('')}</select></td><td><select aria-label="玩家 ${i+1} 位置" data-slot="${i}" data-key="position" ${closed?'disabled':''}>${option(-1,'随机',s.position)}${Array.from({length:maxPlayers},(_,v)=>option(v,String(v+1),s.position)).join('')}</select></td></tr>`;
}
function drawMapPreview(canvas:HTMLCanvasElement,map:MapData){
  const rect=canvas.getBoundingClientRect();const w=Math.max(360,Math.round(rect.width*2)),h=Math.max(240,Math.round(rect.height*2));canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d')!;ctx.imageSmoothingEnabled=false;
  const draw=(source?:CanvasImageSource,iw=0,ih=0)=>{
    ctx.fillStyle='#071410';ctx.fillRect(0,0,w,h);
    // A native RA2 PreviewPack contains RGB pixels at the map's exact aspect ratio.
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const t of map.tiles){const x=t.x-t.y,y=(t.x+t.y)/2;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    const aspect=(maxX-minX+2)/(maxY-minY+1),dw=w*.88,dh=Math.min(h*.76,dw/aspect);const fw=Math.min(dw,dh*aspect),fh=fw/aspect,ox=(w-fw)/2,oy=(h-fh)/2;
    if(source)ctx.drawImage(source,0,0,iw,ih,ox,oy,fw,fh);
    else for(const t of map.tiles){const c=map.radarColors[t.y*map.width+t.x];ctx.fillStyle=`#${c.toString(16).padStart(6,'0')}`;ctx.fillRect(ox+(t.x-t.y-minX)/(maxX-minX+2)*fw,oy+((t.x+t.y)/2-minY)/(maxY-minY+1)*fh,Math.max(2,fw/(maxX-minX)*2),Math.max(2,fh/(maxY-minY)));}
    ctx.strokeStyle='#70835a6b';ctx.lineWidth=1;ctx.strokeRect(ox-1,oy-1,fw+2,fh+2);
    map.spawns.forEach((p,i)=>{const x=ox+(p.x-p.y-minX)/(maxX-minX+2)*fw,y=oy+((p.x+p.y)/2-minY)/(maxY-minY+1)*fh;const slot=slots.find(s=>s.position===i&&s.difficulty!=='closed');ctx.fillStyle=slot?PLAYER_COLORS[slot.color]:'#16251a';ctx.strokeStyle=slot?'#eee4a8':'#c4cda5';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=slot?'#14201a':'#e1e6b9';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 14px Tahoma';ctx.fillText(String(i+1),x,y+1);});
    ctx.fillStyle='#7d9d734c';ctx.font='11px Consolas';ctx.textAlign='left';ctx.fillText('N',w/2-4,25);ctx.beginPath();ctx.moveTo(w/2,34);ctx.lineTo(w/2,47);ctx.stroke();
  };
  if(map.previewData){const {width,height,rgb}=map.previewData;const c=document.createElement('canvas');c.width=width;c.height=height;const cctx=c.getContext('2d')!,data=cctx.createImageData(width,height);for(let i=0;i<rgb.length/3;i++){data.data[i*4]=rgb[i*3];data.data[i*4+1]=rgb[i*3+1];data.data[i*4+2]=rgb[i*3+2];data.data[i*4+3]=255;}cctx.putImageData(data,0,0);draw(c,width,height);}
  else if(map.preview){const image=new Image();image.onload=()=>draw(image,image.width,image.height);image.src=map.preview;draw();}else draw();
}
function showModal(title:string,body:string,actions:string,small=false){
  const focus=modalOpen?modalReturnFocus:document.activeElement as HTMLElement;
  closeModal();modalReturnFocus=focus;modalOpen=true;
  renderer?.keys.clear();
  if(game&&playing&&!game.paused){game.paused=true;modalOwnsPause=true;}
  const el=document.createElement('div');el.className='modal-shade';el.innerHTML=`<section class="modal metal ${small?'small':''}" role="dialog" aria-modal="true" aria-label="${escape(title)}">${bolts}<h2 class="modal-title">${title}<button class="icon-button" id="modal-x" aria-label="关闭">×</button></h2><div class="modal-body">${body}</div><div class="modal-actions">${actions}</div></section>`;document.body.append(el);$('#modal-x').onclick=closeModal;
  el.onkeydown=e=>{
    if(e.key!=='Tab')return;
    const controls=[...el.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary')].filter(n=>n.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  };
  translateUI(el);el.querySelector<HTMLButtonElement>('button')?.focus();return el;
}
function closeModal(){document.querySelector('.modal-shade')?.remove();modalOpen=false;if(modalReturnFocus?.isConnected)modalReturnFocus.focus({preventScroll:true});modalReturnFocus=undefined;if(game&&modalOwnsPause){game.paused=false;modalOwnsPause=false;}}
function openMapChooser(){
  openMapPicker({selected:selectedMap,modal:showModal,preview:drawMapPreview,
    choose:useLobbyMap,cancel:closeModal,upload:input=>void uploadLobbyMap(input)});
}
function showHelp(){
  showModal('作战操作',`<div class="help-grid"><kbd>左键 / 框选</kbd><span>选中己方单位；按住 Shift 增减选择。</span><kbd>右键</kbd><span>移动部队，点击敌军发动攻击；取消建筑放置。</span><kbd>生产建筑 + 右键</kbd><span>选中兵营、战车工厂等生产建筑，再右键点击地图设置出兵目的地。</span><kbd>双击基地车 / D</kbd><span>部署基地车。大兵与辐射工兵也可部署。</span><kbd>建造图标</kbd><span>点击开始生产，建筑就绪后点击图标并放置。</span><kbd>右击建造图标</kbd><span>取消该类生产队列中的一个项目。</span><kbd>方向键 / 鼠标边缘</kbd><span>移动视角。也可中键拖动或按住空格拖动。</span><kbd>滚轮</kbd><span>缩放战场。</span><kbd>Alt + 左键拖动（3D）</kbd><span>旋转三维视角。</span><kbd>H / 雷达点击</kbd><span>返回基地 / 快速移动视角。</span><kbd>A → 左键</kbd><span>攻击移动，沿途交战。</span><kbd>S / G</kbd><span>停止 / 警戒。</span><kbd>Ctrl + 1–9</kbd><span>建立编队，数字键选择编队。</span><kbd>Tab</kbd><span>切换建造分类。</span><kbd>Esc / P</kbd><span>取消当前命令 / 暂停与选项。</span></div>`,`<button id="help-close" class="primary">收到</button>`);$('#help-close').onclick=closeModal;
}
async function startGame(){
  try{
    if(selectedMap.specialMode==='unfinished'){toast(selectedMap.notes || '此文件是原包附带的未完成草稿，无法作为完整遭遇战启动。');return;}
    const active=slots.map((s,i)=>({...s,index:i})).filter((s,i)=>s.difficulty!=='closed'&&i<selectedMap.players);
    if(active.length<2){toast('至少需要一名电脑对手。');return;}
    const teams=new Set(active.map(s=>s.team||s.index+10));if(teams.size<2){toast('至少需要两个敌对阵营，请调整盟友。');return;}
    const assigned=new Set<number>();for(const s of active){if(s.position>=0){if(assigned.has(s.position)){toast('玩家的起始位置不能重复。');return;}assigned.add(s.position);}}
    const available=selectedMap.spawns.map((_,i)=>i).filter(i=>!assigned.has(i)).sort(()=>Math.random()-.5);
    const configs:PlayerConfig[]=active.map((s,i)=>({id:i,name:i===0?'玩家':`${s.difficulty==='hard'?'冷酷':s.difficulty==='easy'?'简单':'中等'}的电脑 ${i}`,country:s.country==='random'?COUNTRIES[Math.floor(Math.random()*COUNTRIES.length)].id:s.country,team:s.team||s.index+10,ai:i!==0,difficulty:s.difficulty==='human'||s.difficulty==='closed'?'medium':s.difficulty,color:PLAYER_COLORS[s.color]}));
    const map:RenderMap={...selectedMap,cells:selectedMap.cells.map((t,i)=>selectedMap.valid[i]&&isWithinPlayableArea(selectedMap,i%selectedMap.width,Math.floor(i/selectedMap.width))?t:'void'),spawns:active.map(s=>selectedMap.spawns[s.position>=0?s.position:available.shift()!]),terrainObjects:selectedMap.scenery,structures:[]};
    const neutralStructures=selectedMap.structures.filter(s=>isWithinPlayableArea(selectedMap,s.x,s.y)).map(s=>{const sprite=assets.scenery[`${selectedMap.theater}:${s.type.toLowerCase()}`];const foundation: [number,number]=sprite?.foundation||[1,1];return {nativeType:s.type,x:s.x+foundation[0]/2,y:s.y+foundation[1]/2,health:s.health,foundation};});
    game=new GameEngine({mode,map,players:configs,startingCredits:credits,startingUnits:mode==='bootcamp'?8:startingUnits,fogOfWar:fog,superweapons,shortGame,neutralStructures,localPlayerId:0,seed:Date.now()});game.speed=gameSpeed;
    category='structure';lastSoundEffect=0;buildSignature='';lastEvent=0;lastComplete=0;notices=[];groups.clear();supportMode=undefined;
    sound.setMusic(sound.musicEnabled);renderGame(map);playing=true;lastTick=performance.now();lastUI=0;shownResult=false;
    sound.play(`${configs[0].country==='russia'||countryById(configs[0].country).faction==='soviet'?'soviet':'allied'}_establishingbattlefieldcontrol`);
    const mcv=game.entities.find(e=>e.owner===0&&e.type.includes('mcv'));if(mcv)renderer!.setSelection([mcv.id]);
    if(selectedMap.notes)notice(selectedMap.notes);animation=requestAnimationFrame(frame);
  }catch(error){toast(`无法启动战场：${error instanceof Error?error.message:String(error)}`);console.error(error);}
}
function renderGame(map:RenderMap){
  const faction=game!.players[0].faction;
  app.innerHTML=`<main class="game-screen"><div class="game-body"><section class="battlefield" id="battlefield"><canvas id="battlefield-canvas" tabindex="0" aria-label="即时战略战场"></canvas><div class="hud-message" id="hud-message"></div><div class="battlefield-tools" id="battlefield-tools"></div><div class="selection-info" id="selection-info"></div></section>${sidebarMarkup}</div><footer class="game-bottom"><nav id="command-bar" aria-label="作战命令"></nav><span id="selection-label"></span><span id="battle-status"></span><span id="game-time">00:00</span></footer></main>`;
  applyScreenSize();
  sidebar=new Sidebar($('.ra2-sidebar'),assets,faction);
  renderer=new BattlefieldRenderer($('#battlefield-canvas'),game!,map,assets,{
    onSelection:()=>{updateSelection();const selected=game!.entities.find(e=>renderer?.selection.has(e.id));if(selected)sound.voice(selected.type,'select');},onCommand:(kind)=>{const selected=game!.entities.find(e=>renderer?.selection.has(e.id));if(kind==='deploy')sound.play('uplace');else if(selected)sound.voice(selected.type,kind==='attack'?'attack':'move');if(renderer&&!renderer.attackMove)$('#battlefield').classList.remove('attack-mode');},onNotice:text=>{notice(text);clearTools();},
    onPlace:(x,y)=>{
      if(supportMode){const success=game!.support(0,supportMode,x,y,[...renderer!.selection]);if(success){supportMode=undefined;renderer!.tool='select';notice('支援命令已下达。');}return success;}
      const def=renderer!.placement;if(!def)return false;
      const success=game!.place(0,def.id,x,y);if(success){renderer!.placement=undefined;$('#battlefield').classList.remove('build-mode');sound.play(`${game!.players[0].faction}_constructioncomplete`);renderBuildList();}else{notice(game!.bootcamp?game!.lastMessage:'无法在此建造。请选择已探明、平坦且靠近基地的区域。',true);sound.play(`${game!.players[0].faction}_cannotdeployhere`);}return success;
    },
    onEntityClick:e=>{
      if(renderer!.tool==='repair'){if(e.owner===0)game!.repair(e.id);return true;}
      if(renderer!.tool==='sell'){if(e.owner===0)game!.sell(e.id);return true;}
      return false;
    }
  });renderer.attachMinimap($('#radar'));
  $('#sidebar-status').onclick=()=>showModal('外交与战况',`<table class="score-table"><thead><tr><th>指挥官</th><th>国家</th><th>关系</th></tr></thead><tbody>${game!.players.map(p=>`<tr><td>${escape(t(p.name))}</td><td>${escape(t(countryById(p.country).name))}</td><td>${game!.isAllied(0,p.id)?t('友方'):t('敌方')}</td></tr>`).join('')}</tbody></table>`,'');
  $('#game-options').onclick=showPause;
  $('#repair').onclick=()=>setTool('repair');$('#sell').onclick=()=>setTool('sell');
  groups.clear();mountCommandBar($('#command-bar'),assets,faction,game!,renderer,groups,deploySelection);
  document.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(el=>el.onclick=()=>{category=el.dataset.category as ProductionCategory;sidebar?.resetScroll();renderBuildList();});
  const debug = mountDebugPanel($('#battlefield-tools'),game!,sound,()=>{updateUI();renderer!.draw();});
  if(game!.bootcamp)disposeSwitch=mountRendererSwitch(debug,renderer);
  renderer.canvas.dataset.renderer='2d';
  renderBuildList();updateUI();bindLanguage();
}
function setTool(tool:'repair'|'sell'){if(!renderer)return;const next=renderer.tool===tool?'select':tool;clearTools();renderer.tool=next;renderer.placement=undefined;renderer.attackMove=false;$('#repair').classList.toggle('active',renderer.tool==='repair');$('#sell').classList.toggle('active',renderer.tool==='sell');sidebar?.update(game!,category,renderer.tool);$('#battlefield').className='battlefield '+(renderer.tool==='select'?'':`${renderer.tool}-mode`);}
function clearTools(){if(!renderer)return;renderer.tool='select';renderer.placement=undefined;renderer.attackMove=false;supportMode=undefined;$('#repair')?.classList.remove('active');$('#sell')?.classList.remove('active');sidebar?.update(game!,category,renderer.tool);$('#battlefield').className='battlefield';}
function deploySelection(){if(!game||!renderer)return;game.deploy([...renderer.selection]);game.unload([...renderer.selection]);renderBuildList();updateSelection();sound.play(`${game.players[0].faction}_newconstructionoptions`);}
function renderBuildList(){
  if(game){const tabs=availableTabs(game);if(!tabs.includes(category))category=tabs[0]||'structure';}
  if(!game||!renderer||!sidebar)return;
  buildSignature=renderProduction({game,assets,category,clock:sidebar.ui.gclock2,
    onBuild:id=>{const d=CATALOG[id],p=game!.players[0];if(!game!.build(0,id))notice(game!.getBuildReason(0,id)||'当前无法生产。',true);else sound.play(`${p.faction}_${d.kind==='building'?'building':d.category==='infantry'?'training':'unitready'}`);renderBuildList();},
    onReady:id=>{const d=CATALOG[id];clearTools();renderer!.placement=d;renderer!.tool='select';$('#battlefield').className='battlefield build-mode';notice(`选择 ${d.name} 的建造位置。右键取消。`);},
    onCancel:kind=>{game!.cancelBuild(0,kind);renderBuildList();},
    onSupport:id=>{clearTools();supportMode=id;renderer!.tool='support';notice('在战场上选择支援目标。');},
  },buildSignature);
  sidebar.update(game,category,renderer.tool);sidebar.refresh();
}
function updateSelection(){
  if(!game||!renderer)return;const entities=game.entities.filter(e=>renderer!.selection.has(e.id)&&e.hp>0);
  $('#selection-label').textContent=entities.length===0?'':entities.length===1?`${getDefinition(entities[0].type).name} · ${Math.ceil(entities[0].hp)} / ${entities[0].maxHp}`:`已选择 ${entities.length} 支部队`;
  $('#selection-info').innerHTML=entities.slice(0,24).map(e=>`<div class="selected-card">${escape(getDefinition(e.type).name)}<i style="width:${Math.max(1,e.hp/e.maxHp*90)}%"></i></div>`).join('');
  translateUI($('#selection-info'));translateUI($('#selection-label'));
}
function updateUI(){
  if(!game||!renderer)return;const p=game.players[0];
  const mins=Math.floor(game.time/60),secs=Math.floor(game.time%60);$('#game-time').textContent=`${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  $('#battle-status').textContent=game.paused?'已暂停':p.powerConsumed>p.powerProduced?'电力不足':`剩余阵营 ${new Set(game.players.filter(v=>!v.defeated).map(v=>v.team)).size}`;
  const events=game.events.filter(e=>e.id>lastEvent&&(e.owner===undefined||e.owner===0));for(const ev of events){notice(ev.text,ev.kind==='warning');if(ev.kind==='complete'){sound.play(`${p.faction}_${ev.text.includes('单位')||ev.text.includes('训练')?'unitready':'constructioncomplete'}`);lastComplete=ev.id;}}lastEvent=game.events.at(-1)?.id||lastEvent;
  notices=notices.filter(n=>n.until>performance.now());$('#hud-message').innerHTML=notices.slice(-3).map(n=>`<div class="notice ${n.warn?'warn':''}">${escape(n.text)}</div>`).join('');
  renderer.drawMinimap();updateSelection();renderBuildList();
  updateCommandBar($('#command-bar'),game,renderer,groups);
  translateUI();
  if(game.status!=='playing'&&!shownResult){shownResult=true;showResult();}
}
function frame(now:number){
  if(!playing||!game||!renderer)return;const dt=Math.min((now-lastTick)/1000,.08);lastTick=now;
  if(!modalOpen){game.step(dt);renderer.update(dt);playBattleSounds();}else renderer.draw();
  if(now-lastUI>220){updateUI();lastUI=now;}
  animation=requestAnimationFrame(frame);
}
function playBattleSounds(){
  if(!game||!renderer)return;
  for(const effect of game.effects){if(effect.id<=lastSoundEffect)continue;lastSoundEffect=effect.id;if(!game.visible(0,effect.x,effect.y))continue;const p=renderer.toScreen(effect.x,effect.y);if(p.x<0||p.x>renderer.width||p.y<0||p.y>renderer.height)continue;
    if(effect.kind==='shot')sound.playEvent(effect.weapon==='tesla'?'TeslaTankAttack':effect.weapon==='bullet'?'GIAttack':effect.weapon==='radiation'?'DesolatorAttack':'GrizzlyTankAttack');
    else if(effect.kind==='explosion')sound.playEvent('Explosion01');else if(effect.kind==='nuke')sound.playEvent('NukeExplosion');
  }
}
function notice(text:string,warn=false){notices.push({text,until:performance.now()+6500,warn});}
function toast(text:string){document.querySelector('.error-toast')?.remove();const el=document.createElement('div');el.className='error-toast';el.textContent=t(text);document.body.append(el);setTimeout(()=>el.remove(),5000);}
function showGameMenu(title:string,body:string,actions:string) {
  const root=showModal(title,`<div class="pause-content">${body}${actions?`<div class="modal-actions">${actions}</div>`:''}</div><aside class="command-rail">${railHeader(title)}<button id="resume">返回战场</button><button id="pause-settings">选项</button><button id="pause-help">操作说明</button><button id="surrender">${game!.bootcamp?'结束训练':'投降'}</button><button id="leave">退出游戏</button>${languageControl()}<div class="rail-bottom"></div></aside>`,'');
  root.classList.add('pause-shade');root.querySelector('.modal')!.classList.add('pause-shell');
  $('#resume').onclick=closeModal;$('#pause-help').onclick=showHelp;
  $('#pause-settings').onclick=()=>showOptions({assets,sound,renderer:renderer!,speed:gameSpeed,
    modal:showGameMenu,back:showPause,help:showHelp,setSpeed:value=>{gameSpeed=value;game!.speed=value;}});
  $('#surrender').onclick=()=>{closeModal();if(game!.bootcamp)renderModeSelect();else{game!.surrender(0);updateUI();}};
  $('#leave').onclick=()=>{closeModal();renderModeSelect();};
  bindLanguageControl(root,()=>{buildSignature='';updateUI();});
  root.querySelector<HTMLButtonElement>('#resume')!.focus();return root;
}
function showPause(){if(game&&!shownResult)showGameMenu('游戏菜单','','');}
function showResult(){
  if(!game)return;const won=game.winnerTeam===game.players[0].team;sound.play(`${game.players[0].faction}_${won?'victorious':'defeated'}`);
  showModal('战斗报告',`<div class="result-title">${won?'MISSION ACCOMPLISHED':'MISSION FAILED'}</div><div class="result-subtitle">${won?'胜利':'战败'}</div><table class="score-table"><thead><tr><th>指挥官</th><th>国家</th><th>击杀</th><th>损失</th><th>建造</th></tr></thead><tbody>${game.players.map(p=>`<tr><td style="color:${p.color}">${escape(p.name)}</td><td>${countryById(p.country).name}</td><td>${p.kills}</td><td>${p.losses}</td><td>${p.buildingsBuilt}</td></tr>`).join('')}</tbody></table>`,`<button id="result-back" class="primary">返回遭遇战</button>`);$('#result-back').onclick=()=>{closeModal();renderLobby();};$('#modal-x').onclick=()=>{closeModal();renderLobby();};
}
window.addEventListener('keydown',e=>{
  const target=e.target as HTMLElement;if(e.key!=='Escape'&&['INPUT','SELECT','TEXTAREA'].includes(target.tagName))return;
  if(e.key==='Escape'){e.preventDefault();if(modalOpen){closeModal();if(shownResult)renderLobby();return;}if(renderer&&(renderer.placement||renderer.tool!=='select'||renderer.attackMove)){clearTools();return;}if(playing)showPause();return;}
  if(!playing||!game||!renderer||modalOpen)return;
  const key=e.key.toLowerCase();renderer.keys.add(key);
  if(['arrowup','arrowdown','arrowleft','arrowright',' ','tab'].includes(key))e.preventDefault();
  if(e.repeat)return;
  if(key==='h')renderer.home();else if(key==='d')deploySelection();else if(key==='a'){clearTools();renderer.attackMove=true;renderer.placement=undefined;$('#battlefield').classList.add('attack-mode');notice('攻击移动：左键选择目的地。');}
  else if(key==='s'||key==='g')game.commandStop([...renderer.selection]);
  else if(key==='p')showPause();
  else if(key==='t')selectType(game,renderer);
  else if(key==='z'){renderer.planningMode=!renderer.planningMode;updateCommandBar($('#command-bar'),game,renderer,groups);}
  else if(key==='tab'){const tabs=availableTabs(game);if(tabs.length)category=tabs[(tabs.indexOf(category)+1)%tabs.length];renderBuildList();}
  else if(/^[1-9]$/.test(key)){if(e.ctrlKey||e.metaKey){e.preventDefault();groups.set(key,[...renderer.selection]);notice(`编队 ${key} 已建立。`);}else renderer.setSelection((groups.get(key)||[]).filter(id=>game!.entities.some(v=>v.id===id&&v.owner===0&&v.hp>0&&!v.transportedBy)));}
});
window.addEventListener('keyup',e=>renderer?.keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>{renderer?.keys.clear();if(playing&&!modalOpen&&!shownResult)showPause();});
// Integration handle for deterministic browser verification and inspection.
Object.defineProperty(window,'ra2',{get:()=>({game,renderer,map:selectedMap,assets,slots})});
Promise.resolve().then(async()=>{showEntrySplash();if(await probeOriginalAssets())renderModeSelect();else showAssetSetup(app);}).catch(error=>{if(error instanceof OriginalAssetsError || /素材|地图|资源/.test(error instanceof Error?error.message:String(error))){showAssetSetup(app,error instanceof Error?error.message:String(error));return;}console.error(error);app.innerHTML=`<div class="fatal"><h1>战场载入失败</h1><pre>${escape(error instanceof Error?error.message:String(error))}</pre><button onclick="location.reload()">重新载入</button></div>`;translateUI();});
