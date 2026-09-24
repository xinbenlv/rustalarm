import { APP_TITLE } from './project';

export type Locale = 'en' | 'zh-CN';
const STORAGE_KEY = 'ra2-language';
export function detectLocale(saved: string | null, browserLanguage?: string): Locale {
  if (saved === 'en' || saved === 'zh-CN') return saved;
  return /^zh(?:[-_]|$)/i.test(browserLanguage ?? '') ? 'zh-CN' : 'en';
}
let savedLocale: string | null = null;
try { if (typeof window !== 'undefined') savedLocale = window.localStorage?.getItem(STORAGE_KEY) ?? null; } catch { /* Storage can be unavailable in private browsing. */ }
let locale: Locale = detectLocale(savedLocale, typeof window !== 'undefined' ? (window.navigator.languages?.[0] || window.navigator.language) : undefined);

/** Source messages remain Chinese in the simulation; localization happens at the presentation boundary. */
const english: Record<string, string> = {
  '光棱塔需要供电。附近的己方光棱塔聚光后增强攻击。':'Prism Towers require power. Nearby towers owned by the same player strengthen the attack with support beams.',
  '飞机名额已满':'Aircraft capacity reached',
  '已达到建造上限':'Build limit reached',
  '舰炮攻击海面与岸上目标，舰载机执行反潜攻击。':'Naval guns attack surface and shore targets. Aircraft attack submarines.',
  '正在读取原版战场资料':'Loading original battlefield data',
  '遭遇战':'Skirmish', '本地战场已就绪':'Battlefield ready', '音效':'Sound', '操作说明':'Controls',
  '战场情报':'Battlefield Intelligence', '北极圈原版地图预览':'Original map preview', '选择地图 ▸':'Select Map ▸',
  '战场规模':'Map Size', '作战地形':'Terrain', '地图来源':'Source', '雪地 · 海岛':'Snow / Islands', '温带':'Temperate', '城市':'Urban', 'Westwood 原版':'Westwood Original', '本地导入':'Imported Map',
  '作战部署':'Combatants', '指挥官':'Commander', '国家':'Country', '颜色':'Color', '盟友':'Team', '位置':'Start',
  '初始资金':'Starting Credits', '初始部队':'Starting Units', '游戏速度':'Game Speed', ' 支部队 + 基地车':' Units + MCV', '慢速':'Slow', '正常':'Normal', '快速':'Fast', '最快':'Fastest',
  '战争迷雾':'Fog of War', '超级武器':'Superweapons', '快速游戏':'Short Game', '原版音乐':'Original Music',
  '指挥官，等待您的命令。':'Awaiting your orders, Commander.', '建立基地，开采资源，消灭敌方势力。盟军与苏军 9 国已就绪。':'Build your base, harvest resources, and defeat your enemies. All 9 Allied and Soviet countries are ready.',
  '开始作战':'Start Game', '随机国家':'Random Country', '玩家':'Player', ' 类型':' Type', '— 关闭 —':'— Closed —', '简单的电脑':'Easy AI', '中等的电脑':'Medium AI', '冷酷的电脑':'Brutal AI',
  '金色':'Gold', '红色':'Red', '蓝色':'Blue', '绿色':'Green', '橙色':'Orange', '紫色':'Purple', '青色':'Cyan', '粉色':'Pink', '随机':'Random',
  '选择战场':'Select Battlefield', '搜索地图名称…':'Search map names…', '搜索地图':'Search Maps', ' 人':' Players', '原版地图':'Original Map', '导入 .map / .mpr':'Import .map / .mpr', '取消':'Cancel', '确认战场':'Confirm Map', '巨富':'MegaWealth', '草稿':'Draft', '已导入 ':'Imported ', '导入失败：':'Import failed: ',
  '作战操作':'Battlefield Controls', '左键 / 框选':'Left Click / Drag', '选中己方单位；按住 Shift 增减选择。':'Select your units. Hold Shift to add or remove units.', '右键':'Right Click', '移动部队，点击敌军发动攻击；取消建筑放置。':'Move units, attack an enemy, or cancel building placement.',
  '双击基地车 / D':'Double Click MCV / D', '部署基地车。大兵与辐射工兵也可部署。':'Deploy your MCV. GIs and Desolators can also deploy.', '建造图标':'Build Icon', '点击开始生产，建筑就绪后点击图标并放置。':'Click to begin production. Click a ready building, then place it.', '右击建造图标':'Right Click Build Icon', '取消该类生产队列中的一个项目。':'Cancel one item from that production queue.',
  '方向键 / 鼠标边缘':'Arrow Keys / Edges', '移动视角。也可中键拖动或按住空格拖动。':'Scroll the battlefield, or drag with the middle button or Space.', '滚轮':'Mouse Wheel', '缩放战场。':'Zoom the battlefield.', 'H / 雷达点击':'H / Radar Click', '返回基地 / 快速移动视角。':'Return to your base / jump to a map position.',
  'A → 左键':'A → Left Click', '攻击移动，沿途交战。':'Attack move; engage enemies along the way.', '停止 / 警戒。':'Stop / guard.', '建立编队，数字键选择编队。':'Create a control group; press its number to select it.', '切换建造分类。':'Cycle production categories.', '取消当前命令 / 暂停与选项。':'Cancel the current command / pause and options.', '收到':'Understood',
  '此文件是原包附带的未完成草稿，无法作为完整遭遇战启动。':'This original archive file is an unfinished draft and cannot start a complete skirmish.', '至少需要一名电脑对手。':'Add at least one AI opponent.', '至少需要两个敌对阵营，请调整盟友。':'At least two opposing teams are required. Adjust the team settings.', '玩家的起始位置不能重复。':'Players must have different starting positions.',
  '战场控制已建立。双击基地车或按 D 展开基地。':'Battlefield control established. Double-click your MCV or press D to deploy.', '无法启动战场：':'Unable to start the battlefield: ',
  '选项':'Options', '速度':'Speed', '即时战略战场':'Real-time strategy battlefield', '战场雷达':'Battlefield Radar', '修理建筑':'Repair Buildings', '出售建筑':'Sell Buildings', '部署选中单位（D）':'Deploy Selected Units (D)', '返回基地（H）':'Return to Base (H)',
  '维修':'Repair', '出售':'Sell', '部署':'Deploy', '基地':'Base', '建造分类':'Production Categories', '建筑':'Structures', '防御':'Defense', '步兵':'Infantry', '战车 / 飞机 / 舰艇':'Vehicles / Aircraft / Ships', '载具':'Vehicles',
  '建造面板':'Production', '选择建筑或部队开始生产。':'Select a structure or unit to begin production.', '没有选中单位':'No units selected', '左键选择 · 右键命令 · D 部署 · H 基地 · 滚轮缩放':'Left click: select · Right click: command · D: deploy · H: base · Wheel: zoom', '战场控制在线':'Battlefield control online',
  '支援命令已下达。':'Support order confirmed.', '无法在此建造。请选择已探明、平坦且靠近基地的区域。':'Cannot build here. Choose explored, level ground near your base.', '等待基地部署':'Awaiting MCV Deployment', '选中基地车':'Select your MCV', '双击或按 D 展开':'Double-click or press D to deploy',
  '尚无生产设施':'No Production Facilities', '先在建筑页建造对应的兵营、战车工厂或船坞。':'Build the appropriate barracks, war factory, or naval shipyard in the Structures tab.', '就 绪':'READY', '就绪':'Ready', ' 资金':' Credits', '当前无法生产。':'Production unavailable.',
  '已暂停':'Paused', '电力不足':'Low Power', '剩余阵营 ':'Teams Remaining: ', '基地尚未部署':'MCV Not Deployed', '　选中基地车，双击或按 D 展开。':' Select your MCV, then double-click or press D.', '巨富地图':'MegaWealth Map', '　训练工程师，占领钻油井取得持续收入。':' Train engineers and capture oil derricks for income.',
  '发展基地':'Build Your Base', '　建造发电厂和矿石精炼厂，开始采矿。':' Build a power plant and ore refinery to start harvesting.', '作战目标':'Objective', '摧毁所有敌方建筑及基地车。':'Destroy all enemy structures and MCVs.', '消灭所有敌方建筑和部队。':'Destroy all enemy structures and units.',
  '在战场上选择支援目标。':'Select a support target on the battlefield.', '游戏暂停':'Game Paused', '返回战场':'Resume Game', '关闭原版音乐':'Turn Music Off', '开启原版音乐':'Turn Music On', '关闭游戏音效':'Turn Sound Off', '开启游戏音效':'Turn Sound On', '投降并结束战斗':'Surrender', '退出到遭遇战设置':'Return to Skirmish Setup',
  '战斗报告':'Battle Report', '胜利':'Victory', '战败':'Defeat', '击杀':'Kills', '损失':'Losses', '建造':'Built', '返回遭遇战':'Return to Skirmish', '攻击移动：左键选择目的地。':'Attack move: left-click a destination.', '战场载入失败':'Battlefield Loading Failed', '重新载入':'Reload', '关闭':'Close',
  '雷达离线':'Radar Offline', '已取消':'Canceled', '空降部队':'Paratroopers', '超时空传送':'Chronoshift', '闪电风暴':'Lightning Storm', '铁幕装置':'Iron Curtain', '核弹攻击':'Nuclear Missile', '中立':'Neutral',
  '科技钻油井':'Tech Oil Derrick', '市民医院':'Civilian Hospital', '科技前哨站':'Tech Outpost', '科技机场':'Tech Airport', '民用建筑':'Civilian Building',
  '工程师占领后获得 $1000，并持续产出资金。':'Capture with an engineer to receive $1000 and ongoing income.', '占领后持续治疗己方步兵。':'Heals your infantry after capture.', '占领后修复附近己方车辆。':'Repairs nearby friendly vehicles after capture.', '占领后提供空降部队。':'Provides paratroopers after capture.', '战场上的原始民用建筑。':'An original civilian structure on this battlefield.',
  '战场已就绪。选中基地车，按 D 或双击部署。':'Battlefield ready. Select your MCV and press D or double-click to deploy.', '无法生产':'Production unavailable', '需要前置建筑':'Prerequisite structure required', '资金不足':'Insufficient funds', '生产队列已满':'Production queue full', '：开始生产':': production started',
  '生产已取消，资金已退回。':'Production canceled; funds refunded.', '选择要建造的建筑':'Select a structure to build', '船坞需要空旷水面':'A shipyard requires open water', '此处无法建造':'Cannot build here', '需要靠近己方建筑':'Must be near a friendly structure', '需要先探索这片区域':'Explore this area first', '建筑尚未就绪':'Structure not ready', '建造完成。':' construction complete.',
  '附近空间不足，请将基地车移动到开阔区域':'Not enough room. Move your MCV to open ground.', '建造厂已收起为基地车。':'Construction yard packed into an MCV.', '部队正在靠近运输载具':'Units are approaching the transport', '需要靠近海岸才能卸载':'Move closer to shore to unload', '已投降。':' has surrendered.', '支援尚未就绪':'Support not ready', '已启动！':' activated!', '已就绪，请选择放置位置。':' ready. Select a placement location.', '训练完成。':' training complete.',
  '这座民用建筑无法占领':'This civilian building cannot be captured', '工程师已拆除定时炸弹。':'Engineer disarmed the timed bomb.', '工程师已修复建筑。':'Engineer repaired the structure.', '疯狂伊文：定时炸弹已安放。':'Crazy Ivan: timed bomb planted.', '警告：我方基地正在遭受攻击！':'Warning: our base is under attack!', '我方采矿车正在遭受攻击！':'Our ore miner is under attack!', '被击败。':' has been defeated.', '任务失败。':'Mission failed.', '任务完成。战场属于你！':'Mission accomplished. The battlefield is yours!',
  '巨富模式：原图没有矿石，以工程师占领科技油井获得持续收入。':'MegaWealth: this original map has no ore. Capture tech oil derricks with engineers for income.', '巨富模式：以工程师占领原图的 36 座科技油井获得持续收入，只有少量残留矿石。':'MegaWealth: capture the 36 original tech oil derricks with engineers for income. Only a small amount of ore remains.',
  '原厂档案中的未完成变体：四个出生点相距仅两格，基地会重叠。保留查看和导入，不能直接开始遭遇战。':'Unfinished original variant: four starts are only two cells apart, causing overlapping bases. Available to inspect and import; skirmish start is disabled.', '原厂档案中的 Polar Cap 草稿：没有矿石、宝石或油井，无法持续发展经济。保留查看和导入，不能直接开始遭遇战。':'Original Polar Cap draft: no ore, gems, or oil derricks to sustain an economy. Available to inspect and import; skirmish start is disabled.',
  '地图文件超过 16 MB。':'Map file exceeds 16 MB.', '不是有效的 RA2 地图：缺少或不支持的 [Map] Size。':'Invalid RA2 map: missing or unsupported [Map] Size.', '遭遇战地图至少需要两个有效的起始位置（Waypoints 0–7）。':'A skirmish map requires at least two valid starting positions (Waypoints 0–7).', '地图不存在：':'Map not found: ', '无法加载地图 ':'Unable to load map ',
  '原版地图素材尚未加载，请先下载并安装原版素材，再初始化地图。':'Original map assets are not loaded. Download and install the original assets first.', '原版地图目录 catalog.json 无效，请重新安装原版素材。':'Invalid original map catalog.json. Reinstall the original assets.', '原版地形数据 terrain.json 无效或缺少战区，请重新安装原版素材。':'Invalid terrain.json or missing theater data. Reinstall the original assets.', '原版覆盖物数据 overlays.json 无效，请重新安装原版素材。':'Invalid original overlays.json. Reinstall the original assets.',
  '缺少原版素材清单。':'Original asset manifest is missing.', '缺少原版地形素材。':'Original terrain assets are missing.', '缺少原版场景素材。':'Original scenery assets are missing.', '原版素材无法读取，请重新准备素材。':'Unable to read original assets. Prepare them again.',
};

const descriptions: Record<string, string> = {
  '建造空指部后可空投一队美国大兵。':'Build an Airforce Command HQ to paradrop a squad of GIs.', '拥有火力更强的黑鹰战机。':'Fields the more powerful Black Eagle aircraft.', '可建造射程极远的巨炮。':'Can build the long-range Grand Cannon.', '专门对抗装甲目标的坦克杀手。':'Fields Tank Destroyers specialized against armor.', '远距离精确消灭敌军步兵。':'Snipers eliminate enemy infantry at long range.', '使用磁暴武器攻击目标。':'Tesla Tanks attack with electrical weapons.', '使用辐射武器造成区域伤害。':'Desolators use radiation to inflict area damage.', '冲向目标后引爆炸药。':'Terrorists rush their targets and detonate explosives.', '威力巨大的移动爆炸装置。':'Demolition Trucks carry devastating mobile explosives.',
  '部署基地车建立基地，可建造盟军建筑。':'Deploy an MCV to establish a base and construct Allied buildings.', '部署基地车建立基地，可建造苏军建筑。':'Deploy an MCV to establish a base and construct Soviet buildings.', '提供 200 电力。':'Produces 200 power.', '提供 150 电力。':'Produces 150 power.', '训练盟军步兵。':'Trains Allied infantry.', '训练苏军步兵。':'Trains Soviet infantry.', '附送超时空采矿车，将矿石兑换为资金。':'Includes a Chrono Miner. Converts ore into credits.', '附送武装采矿车，将矿石兑换为资金。':'Includes a War Miner. Converts ore into credits.', '生产盟军战车。':'Produces Allied vehicles.', '生产苏军战车。':'Produces Soviet vehicles.',
  '提供雷达并生产战机。美国获得空降兵。':'Provides radar and produces aircraft. America also gains paratroopers.', '提供雷达并解锁进阶科技。':'Provides radar and unlocks advanced technology.', '解锁光棱坦克、幻影坦克及超时空科技。':'Unlocks Prism Tanks, Mirage Tanks, and chrono technology.', '解锁天启坦克、基洛夫空艇及核能科技。':'Unlocks Apocalypse Tanks, Kirov Airships, and nuclear technology.', '所有采矿收入增加 25%。':'Increases all harvesting income by 25%.', '提供 2000 电力。被摧毁时会爆炸。':'Produces 2000 power. Explodes when destroyed.', '建造在海面，生产盟军舰艇。':'Built on water. Produces Allied naval units.', '建造在海面，生产苏军舰艇。':'Built on water. Produces Soviet naval units.', '自动修理附近己方载具，解锁基地车。':'Automatically repairs nearby friendly vehicles and unlocks MCVs.',
  '对付步兵的基地防御。':'Base defense effective against infantry.', '防空飞弹，停电时无法工作。':'Anti-air missiles. Requires power.', '远程防空炮，停电时无法工作。':'Long-range anti-air defense. Requires power.', '威力强大的光棱防御，需供电。':'Powerful prism defense. Requires power.', '高压磁暴防御，需供电。':'High-voltage Tesla defense. Requires power.', '法国专属重炮，射程与威力极高。':'French heavy artillery with exceptional range and firepower.', '充能后可将选中部队传送至地图上的目标位置。':'When charged, teleports selected units to a target location.', '充能后发动闪电风暴。':'Launches a lightning storm when charged.', '充能后使目标附近己方车辆暂时无敌。':'When charged, temporarily makes friendly vehicles near the target invulnerable.', '充能后可发射核弹。':'Launches a nuclear missile when charged.',
  '盟军基础步兵。部署后火力与射程提高。':'Basic Allied infantry. Deploy for improved firepower and range.', '便宜而可靠的苏军步兵。':'Inexpensive, reliable Soviet infantry.', '命令进入敌方建筑可占领建筑。':'Order into an enemy structure to capture it.', '快速近战反步兵单位。':'Fast melee unit effective against infantry.', '可飞越地形，攻击地面与空中目标。':'Flies over terrain and attacks ground or air targets.', '重装磁爆步兵。':'Heavy infantry armed with Tesla weapons.', '兼具地面攻击和防空能力。':'Attacks both ground and air targets.', '精锐突击队员，擅长消灭步兵和摧毁建筑。':'Elite commando effective against infantry and structures.', '进入敌方精炼厂窃取资金。':'Enter an enemy refinery to steal credits.', '给敌方目标安放定时炸弹，30 秒后引爆。工程师可以拆除己方炸弹。':'Plants timed bombs on enemies, detonating after 30 seconds. Engineers can disarm bombs on friendly targets.',
  '原版苏军心灵控制步兵。控制一个敌军单位；按 D 释放反步兵心灵冲击波。':'Original Soviet psychic infantry. Controls one enemy unit; press D to unleash an anti-infantry psychic blast.', '使用超时空武器攻击敌人。':'Attacks enemies with chrono weapons.', '英国专属单位，对步兵极其有效。':'British special unit, highly effective against infantry.', '伊拉克专属单位，部署后污染周围区域。':'Iraqi special unit. Deploys to irradiate the surrounding area.', '古巴专属单位，接近目标后自爆。':'Cuban special unit. Detonates on approaching its target.', '速度快，适合机动战的主战坦克。':'Fast main battle tank suited to mobile warfare.', '装甲厚重、火力强大的主战坦克。':'Heavily armored main battle tank with powerful weapons.', '装载一名步兵切换武器。工程师变维修车，狙击手变远程狙击车。按 D 卸载。':'Carries one infantry unit to change weapons. Engineers create a repair vehicle; snipers add long-range fire. Press D to unload.',
  '快速防空车辆，可运输五名步兵。':'Fast anti-air vehicle with room for five infantry.', '自动采矿，将矿石送回精炼厂。':'Automatically harvests ore and returns it to a refinery.', '拥有自卫武器和大容量货舱的采矿车。':'Armed miner with a large ore hold.', '双击或按 D 部署为盟军建造厂。':'Double-click or press D to deploy an Allied Construction Yard.', '双击或按 D 部署为苏军建造厂。':'Double-click or press D to deploy a Soviet Construction Yard.', '远程光棱武器，适合摧毁建筑和步兵。':'Long-range prism weapon effective against structures and infantry.', '使用热能武器的伏击坦克。':'Ambush tank armed with a thermal weapon.', '重装甲双管坦克，可攻击空中目标。':'Heavily armored twin-cannon tank; can also attack aircraft.', '远距离轰炸敌方建筑。':'Bombards enemy structures from long range.', '高速近战机器人，擅长破坏战车。':'Fast melee robot effective against vehicles.',
  '德国专属单位，攻击装甲有额外伤害。':'German special unit dealing bonus damage to armor.', '苏俄专属磁能坦克。':'Russian special tank armed with Tesla weapons.', '利比亚专属单位，接近目标后造成大范围爆炸。':'Libyan special unit causing a massive explosion near its target.', '高速对地攻击战机。':'Fast ground-attack aircraft.', '韩国专属战机，装甲和火力强于入侵者。':'Korean special aircraft with more armor and firepower than the Harrier.', '缓慢而坚固的重型轰炸飞艇。':'Slow, durable heavy bomber airship.', '可运输五名步兵的空中支援直升机。':'Support helicopter carrying five infantry.', '海军主力战舰，可攻击空中与岸上目标。':'Versatile warship that attacks aircraft and shore targets.', '远程防空战舰。':'Long-range anti-air warship.', '远距离打击海上与陆地目标。':'Strikes naval and land targets from long range.', '机动性极强的海军单位。':'Highly maneuverable naval unit.', '使用鱼雷攻击海上目标。':'Fires torpedoes at naval targets.', '高速海上防空单位。':'Fast naval anti-air unit.', '使用远程重型导弹轰炸敌方基地。':'Bombards enemy bases with long-range heavy missiles.', '强大的海上近战单位。':'Powerful naval melee unit.', '可在陆地和水面行驶。右键装载附近部队，按 U 卸载。':'Travels on land and water. Right-click to load nearby units; press D to unload.',
};
Object.assign(english, descriptions);
let matcher: RegExp | undefined;
export function registerTranslations(entries: Record<string, string>): void { Object.assign(english, entries); matcher = undefined; }
export function getLocale(): Locale { return locale; }
export function setLocale(value: Locale): void {
  locale = value === 'zh-CN' ? 'zh-CN' : 'en';
  try { if (typeof window !== 'undefined') window.localStorage?.setItem(STORAGE_KEY, locale); } catch { /* Keep this page usable without storage. */ }
  updateDocumentLanguage();
}
function updateDocumentLanguage(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.title = APP_TITLE;
}
updateDocumentLanguage();

export function t(source: string): string {
  if (locale === 'zh-CN' || !/[\u3400-\u9fff]/.test(source)) return source;
  const patterns: [RegExp, (...values: string[]) => string][] = [
    [/^选择 (.+) 的建造位置。右键取消。$/, name => `Choose a placement for ${t(name)}. Right-click to cancel.`],
    [/^已选择 (\d+) 支部队$/, count => `${count} units selected`],
    [/^编队 (\d+) 已建立。$/, group => `Control group ${group} created.`],
    [/^建筑已出售，回收 \$(\d+)。$/, credits => `Building sold. $${credits} refunded.`],
    [/^间谍渗透成功，获取 \$(\d+)。$/, credits => `Spy infiltration successful. $${credits} stolen.`],
    [/^已占领(.+)。$/, name => `${t(name)} captured.`],
    [/^尤里已控制(.+)。$/, name => `Yuri has taken control of ${t(name)}.`],
    [/^不支持 (.+) 战区；原版 RA2 支持 TEMPERATE、SNOW 和 URBAN。$/, theater => `Unsupported theater ${theater}; original RA2 supports TEMPERATE, SNOW, and URBAN.`],
    [/^(\d+) 个原版素材文件缺失或损坏，请重新准备素材。$/, count => `${count} original asset files are missing or damaged. Prepare the assets again.`],
    [/^无法加载原版地图素材 (.+)，请下载并安装原版素材。(.*)$/, (file, reason) => `Unable to load original map asset ${file}. Download and install the original assets. ${reason}`],
  ];
  for (const [pattern, format] of patterns) { const match = source.match(pattern); if (match) return format(...match.slice(1)); }
  matcher ??= new RegExp(Object.keys(english).sort((a, b) => b.length - a.length).map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  return source.replace(matcher, key => english[key]!).replace(/：/g, ': ').replace(/，/g, ', ');
}

type Translation = { source: string; rendered: string };
const textSources = new WeakMap<Node, Translation>();
const attributeSources = new WeakMap<Element, Map<string, Translation>>();
/** Translate text and accessibility labels only; preserve values, handlers, markup, and original text for live language changes. */
export function localizeElement(root: ParentNode): void {
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('script,style,[data-language-control]')) continue;
    const current = node.nodeValue ?? '', previous = textSources.get(node);
    const source = previous && current === previous.rendered ? previous.source : current;
    const rendered = t(source);
    if (current !== rendered) node.nodeValue = rendered;
    textSources.set(node, { source, rendered });
  }
  const elements = [...root.querySelectorAll('[title],[aria-label],[placeholder]')];
  if (root instanceof Element) elements.push(root);
  for (const element of elements) {
    const saved = attributeSources.get(element) ?? new Map<string, Translation>();
    for (const name of ['title', 'aria-label', 'placeholder']) {
      const current = element.getAttribute(name); if (current === null) continue;
      const previous = saved.get(name), source = previous && current === previous.rendered ? previous.source : current, rendered = t(source);
      if (current !== rendered) element.setAttribute(name, rendered);
      saved.set(name, { source, rendered });
    }
    attributeSources.set(element, saved);
  }
}

export function languageControl(): string {
  return `<label class="language-control" data-language-control><select aria-label="Language / 语言" data-language-select><option value="en" ${locale === 'en' ? 'selected' : ''}>English</option><option value="zh-CN" ${locale === 'zh-CN' ? 'selected' : ''}>中文</option></select></label>`;
}
export function bindLanguageControl(root: ParentNode, onChange?: () => void): void {
  root.querySelectorAll<HTMLSelectElement>('[data-language-select]').forEach(select => {
    select.value = locale;
    select.onchange = () => {
      setLocale(select.value as Locale);
      document.querySelectorAll<HTMLSelectElement>('[data-language-select]').forEach(other => { other.value = locale; });
      localizeElement(document.body);
      onChange?.();
    };
  });
}
