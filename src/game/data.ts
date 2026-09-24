import type { Country, Definition, ProductionCategory } from './types';

export const COUNTRIES: Country[] = [
  { id: 'america', name: '美国', nameEn: 'America', faction: 'allied', flag: '🇺🇸', special: '空降兵', description: '建造空指部后可空投一队美国大兵。' },
  { id: 'korea', name: '韩国', nameEn: 'Korea', faction: 'allied', flag: '🇰🇷', special: '黑鹰战机', description: '拥有火力更强的黑鹰战机。' },
  { id: 'france', name: '法国', nameEn: 'France', faction: 'allied', flag: '🇫🇷', special: '巨炮', description: '可建造射程极远的巨炮。' },
  { id: 'germany', name: '德国', nameEn: 'Germany', faction: 'allied', flag: '🇩🇪', special: '坦克杀手', description: '专门对抗装甲目标的坦克杀手。' },
  { id: 'britain', name: '英国', nameEn: 'Great Britain', faction: 'allied', flag: '🇬🇧', special: '狙击手', description: '远距离精确消灭敌军步兵。' },
  { id: 'russia', name: '苏俄', nameEn: 'Russia', faction: 'soviet', flag: '🇷🇺', special: '磁能坦克', description: '使用磁暴武器攻击目标。' },
  { id: 'iraq', name: '伊拉克', nameEn: 'Iraq', faction: 'soviet', flag: '🇮🇶', special: '辐射工兵', description: '使用辐射武器造成区域伤害。' },
  { id: 'cuba', name: '古巴', nameEn: 'Cuba', faction: 'soviet', flag: '🇨🇺', special: '恐怖分子', description: '冲向目标后引爆炸药。' },
  { id: 'libya', name: '利比亚', nameEn: 'Libya', faction: 'soviet', flag: '🇱🇾', special: '自爆卡车', description: '威力巨大的移动爆炸装置。' },
];

const building = (id: string, name: string, nameEn: string, faction: Definition['faction'], cost: number, hp: number, sprite: string, options: Partial<Definition> = {}): Definition => ({
  id, name, nameEn, kind: 'building', faction, category: 'structure', cost, hp,
  buildTime: Math.max(5, cost / 100), sprite, cameo: sprite, size: [2, 2], sight: 8,
  armor: 'building', description: name, ...options,
});
const unit = (id: string, name: string, nameEn: string, faction: Definition['faction'], cost: number, hp: number, sprite: string, options: Partial<Definition> = {}): Definition => ({
  id, name, nameEn, kind: 'unit', faction, category: 'vehicle', cost, hp,
  buildTime: Math.max(3, cost / 130), sprite, cameo: sprite, sight: 7, speed: 2.1,
  armor: 'heavy', range: 5, damage: 38, cooldown: 1.2, weapon: 'shell', description: name, ...options,
});

const structures: Definition[] = [
  building('construction_yard', '盟军建造厂', 'Allied Construction Yard', 'allied', 3000, 1600, 'gacnst', { size: [4, 4], power: 30, producer: 'structure', description: '部署基地车建立基地，可建造盟军建筑。' }),
  building('soviet_construction_yard', '苏军建造厂', 'Soviet Construction Yard', 'soviet', 3000, 1600, 'nacnst', { size: [4, 4], power: 30, producer: 'structure', description: '部署基地车建立基地，可建造苏军建筑。' }),
  building('power_plant', '发电厂', 'Power Plant', 'allied', 800, 750, 'gapowr', { size: [2, 2], power: 200, prerequisites: ['yard'], description: '提供 200 电力。' }),
  building('tesla_reactor', '磁能反应炉', 'Tesla Reactor', 'soviet', 600, 750, 'napowr', { size: [3, 2], power: 150, prerequisites: ['yard'], description: '提供 150 电力。' }),
  building('barracks', '兵营', 'Allied Barracks', 'allied', 500, 700, 'gapile', { size: [3, 2], power: -10, prerequisites: ['power'], producer: 'infantry', description: '训练盟军步兵。' }),
  building('soviet_barracks', '兵营', 'Soviet Barracks', 'soviet', 500, 700, 'nahand', { size: [2, 2], power: -10, prerequisites: ['power'], producer: 'infantry', description: '训练苏军步兵。' }),
  building('refinery', '矿石精炼厂', 'Allied Ore Refinery', 'allied', 2000, 1100, 'garefn', { size: [4, 3], power: -50, prerequisites: ['power'], description: '附送超时空采矿车，将矿石兑换为资金。' }),
  building('soviet_refinery', '矿石精炼厂', 'Soviet Ore Refinery', 'soviet', 2000, 1100, 'narefn', { size: [4, 3], power: -50, prerequisites: ['power'], description: '附送武装采矿车，将矿石兑换为资金。' }),
  building('war_factory', '战车工厂', 'Allied War Factory', 'allied', 2000, 1300, 'gaweap', { size: [5, 3], power: -50, prerequisites: ['refinery'], producer: 'vehicle', description: '生产盟军战车。' }),
  building('soviet_war_factory', '战车工厂', 'Soviet War Factory', 'soviet', 2000, 1300, 'naweap', { size: [5, 3], power: -50, prerequisites: ['refinery'], producer: 'vehicle', description: '生产苏军战车。' }),
  building('airforce_command', '空指部', 'Airforce Command HQ', 'allied', 1000, 900, 'gaairc', { size: [3, 2], power: -50, prerequisites: ['refinery'], producer: 'aircraft', description: '提供雷达并生产战机。美国获得空降兵。' }),
  building('radar', '雷达', 'Soviet Radar', 'soviet', 1000, 1000, 'naradr', { size: [2, 2], power: -50, prerequisites: ['refinery'], description: '提供雷达并解锁进阶科技。' }),
  building('battle_lab', '盟军作战实验室', 'Allied Battle Lab', 'allied', 2000, 800, 'gatech', { size: [3, 2], power: -100, prerequisites: ['war_factory', 'radar'], description: '解锁光棱坦克、幻影坦克及超时空科技。' }),
  building('soviet_battle_lab', '苏军作战实验室', 'Soviet Battle Lab', 'soviet', 2000, 800, 'natech', { size: [3, 3], power: -100, prerequisites: ['war_factory', 'radar'], description: '解锁天启坦克、基洛夫空艇及核能科技。' }),
  building('ore_purifier', '矿石精炼器', 'Ore Purifier', 'allied', 2500, 900, 'gaorep', { size: [3, 3], power: -200, prerequisites: ['tech'], description: '所有采矿收入增加 25%。' }),
  building('nuclear_reactor', '核子反应炉', 'Nuclear Reactor', 'soviet', 1000, 1000, 'nanrct', { size: [4, 4], power: 2000, prerequisites: ['tech'], description: '提供 2000 电力。被摧毁时会爆炸。' }),
  building('naval_yard', '盟军船坞', 'Allied Naval Shipyard', 'allied', 1000, 1500, 'gayard', { size: [4, 4], power: -25, prerequisites: ['refinery'], producer: 'naval', naval: true, description: '建造在海面，生产盟军舰艇。' }),
  building('soviet_naval_yard', '苏军船坞', 'Soviet Naval Shipyard', 'soviet', 1000, 1500, 'nayard', { size: [4, 4], power: -25, prerequisites: ['refinery'], producer: 'naval', naval: true, description: '建造在海面，生产苏军舰艇。' }),
  building('repair_depot', '维修厂', 'Service Depot', 'allied', 800, 900, 'gadept', { size: [3, 3], power: -25, prerequisites: ['war_factory'], description: '自动修理附近己方载具，解锁基地车。' }),
  building('soviet_repair_depot', '维修厂', 'Service Depot', 'soviet', 800, 900, 'nadept', { size: [4, 3], power: -25, prerequisites: ['war_factory'], description: '自动修理附近己方载具，解锁基地车。' }),
  building('pillbox', '机枪碉堡', 'Pillbox', 'allied', 500, 650, 'gapill', { category: 'defense', size: [1, 1], power: 0, prerequisites: ['barracks'], range: 5.5, damage: 25, cooldown: .45, weapon: 'bullet', description: '对付步兵的基地防御。' }),
  building('sentry_gun', '哨戒炮', 'Sentry Gun', 'soviet', 500, 650, 'nalasr', { category: 'defense', size: [1, 1], power: 0, prerequisites: ['barracks'], range: 5.5, damage: 25, cooldown: .45, weapon: 'bullet', description: '对付步兵的基地防御。' }),
  building('patriot', '爱国者飞弹', 'Patriot Missile', 'allied', 1000, 900, 'nasam', { category: 'defense', size: [1, 1], power: -50, prerequisites: ['barracks'], range: 10, damage: 70, cooldown: 1, weapon: 'missile', antiAir: true, canAttackGround: false, description: '防空飞弹，停电时无法工作。' }),
  building('flak_cannon', '防空炮', 'Flak Cannon', 'soviet', 1000, 900, 'naflak', { category: 'defense', size: [1, 1], power: -50, prerequisites: ['barracks'], range: 10, damage: 65, cooldown: 1, weapon: 'flak', antiAir: true, canAttackGround: false, description: '远程防空炮，停电时无法工作。' }),
  building('prism_tower', '光棱塔', 'Prism Tower', 'allied', 1500, 800, 'gapris', { category: 'defense', size: [1, 1], power: -75, prerequisites: ['radar'], range: 8, damage: 120, cooldown: 4, weapon: 'prism', description: '光棱塔需要供电。附近的己方光棱塔聚光后增强攻击。' }),
  building('tesla_coil', '磁暴线圈', 'Tesla Coil', 'soviet', 1500, 800, 'natsla', { category: 'defense', size: [1, 1], power: -75, prerequisites: ['radar'], range: 7, damage: 155, cooldown: 2, weapon: 'tesla', description: '高压磁暴防御，需供电。' }),
  building('grand_cannon', '巨炮', 'Grand Cannon', 'allied', 2000, 1100, 'gagcan', { category: 'defense', size: [2, 2], country: 'france', power: -100, prerequisites: ['radar'], range: 15, damage: 230, cooldown: 3.2, weapon: 'shell', description: '法国专属重炮，射程与威力极高。' }),
  building('chronosphere', '超时空传送仪', 'Chronosphere', 'allied', 2500, 1000, 'gacsph', { buildLimit: 1, size: [4, 3], power: -200, prerequisites: ['tech'], description: '充能后可将选中部队传送至地图上的目标位置。' }),
  building('weather_control', '天气控制仪', 'Weather Control Device', 'allied', 5000, 1000, 'gaweth', { buildLimit: 1, size: [3, 3], power: -200, prerequisites: ['tech'], description: '充能后发动闪电风暴。' }),
  building('iron_curtain', '铁幕装置', 'Iron Curtain', 'soviet', 2500, 1000, 'nairon', { buildLimit: 1, size: [3, 3], power: -200, prerequisites: ['tech'], description: '充能后使目标附近己方车辆暂时无敌。' }),
  building('nuclear_silo', '核弹发射井', 'Nuclear Missile Silo', 'soviet', 5000, 1000, 'namisl', { buildLimit: 1, size: [3, 3], power: -200, prerequisites: ['tech'], description: '充能后可发射核弹。' }),
];

const infantry: Partial<Definition> = { category: 'infantry', armor: 'none', speed: 2.1, range: 4, damage: 18, cooldown: .75, weapon: 'bullet', prerequisites: ['barracks'] };
const vehicles: Definition[] = [
  unit('gi', '美国大兵', 'GI', 'allied', 200, 125, 'gi', { ...infantry, description: '盟军基础步兵。部署后火力与射程提高。' }),
  unit('conscript', '动员兵', 'Conscript', 'soviet', 100, 110, 'cons', { ...infantry, damage: 15, description: '便宜而可靠的苏军步兵。' }),
  unit('allied_engineer', '工程师', 'Engineer', 'allied', 500, 100, 'engineer', { ...infantry, range: 0, damage: 0, speed: 1.7, description: '命令进入敌方建筑可占领建筑。' }),
  unit('soviet_engineer', '工程师', 'Engineer', 'soviet', 500, 100, 'engineer', { ...infantry, range: 0, damage: 0, speed: 1.7, description: '命令进入敌方建筑可占领建筑。' }),
  unit('allied_dog', '警犬', 'Attack Dog', 'allied', 200, 100, 'adog', { ...infantry, speed: 3.5, range: .9, damage: 100, weapon: 'melee', description: '快速近战反步兵单位。' }),
  unit('soviet_dog', '警犬', 'Attack Dog', 'soviet', 200, 100, 'dog', { ...infantry, speed: 3.5, range: .9, damage: 100, weapon: 'melee', description: '快速近战反步兵单位。' }),
  unit('rocketeer', '火箭飞行兵', 'Rocketeer', 'allied', 600, 150, 'rock', { ...infantry, flying: true, antiAir: true, speed: 3.3, prerequisites: ['barracks', 'radar'], description: '可飞越地形，攻击地面与空中目标。' }),
  unit('tesla_trooper', '磁爆步兵', 'Tesla Trooper', 'soviet', 500, 210, 'shk', { ...infantry, speed: 1.4, range: 4.5, damage: 70, cooldown: 1.5, weapon: 'tesla', prerequisites: ['barracks', 'radar'], description: '重装磁爆步兵。' }),
  unit('flak_trooper', '防空步兵', 'Flak Trooper', 'soviet', 300, 120, 'flakt', { ...infantry, antiAir: true, range: 5, damage: 22, weapon: 'flak', description: '兼具地面攻击和防空能力。' }),
  unit('tanya', '谭雅', 'Tanya', 'allied', 1000, 220, 'tany', { ...infantry, buildLimit: 1, amphibious: true, speed: 2.8, range: 6, damage: 100, cooldown: .5, prerequisites: ['barracks', 'tech'], description: '精锐突击队员，擅长消灭步兵和摧毁建筑。' }),
  unit('spy', '间谍', 'Spy', 'allied', 1000, 100, 'spy', { ...infantry, damage: 0, range: 0, prerequisites: ['barracks', 'tech'], description: '进入敌方精炼厂窃取资金。' }),
  unit('crazy_ivan', '疯狂伊文', 'Crazy Ivan', 'soviet', 600, 125, 'ivan', { ...infantry, speed: 1.8, range: 1.5, damage: 400, cooldown: 3.3, weapon: 'explosive', prerequisites: ['barracks', 'radar'], description: '给敌方目标安放定时炸弹，30 秒后引爆。工程师可以拆除己方炸弹。' }),
  unit('yuri', '尤里', 'Yuri', 'soviet', 1200, 100, 'yuri', { ...infantry, speed: 1.8, sight: 12, range: 7, damage: 10, cooldown: 3, weapon: 'tesla', mindControlImmune: true, prerequisites: ['barracks', 'tech'], description: '原版苏军心灵控制步兵。控制一个敌军单位；按 D 释放反步兵心灵冲击波。' }),
  unit('chrono_legionnaire', '超时空军团兵', 'Chrono Legionnaire', 'allied', 1500, 200, 'cleg', { ...infantry, speed: 3.8, range: 5, damage: 125, cooldown: 1.5, weapon: 'chrono', prerequisites: ['barracks', 'tech'], description: '使用超时空武器攻击敌人。' }),
  unit('sniper', '狙击手', 'Sniper', 'allied', 600, 125, 'snipe', { ...infantry, country: 'britain', range: 12, damage: 180, cooldown: 2.5, prerequisites: ['barracks', 'radar'], description: '英国专属单位，对步兵极其有效。' }),
  unit('desolator', '辐射工兵', 'Desolator', 'soviet', 600, 200, 'deso', { ...infantry, country: 'iraq', speed: 1.5, range: 5.5, damage: 75, cooldown: 1.7, weapon: 'radiation', prerequisites: ['barracks', 'radar'], description: '伊拉克专属单位，部署后污染周围区域。' }),
  unit('terrorist', '恐怖分子', 'Terrorist', 'soviet', 200, 100, 'trst', { ...infantry, country: 'cuba', range: .8, damage: 300, weapon: 'explosive', description: '古巴专属单位，接近目标后自爆。' }),
  unit('grizzly', '灰熊坦克', 'Grizzly Tank', 'allied', 700, 320, 'gtnk', { prerequisites: ['war_factory'], speed: 2.9, description: '速度快，适合机动战的主战坦克。' }),
  unit('rhino', '犀牛坦克', 'Rhino Tank', 'soviet', 900, 450, 'htnk', { prerequisites: ['war_factory'], speed: 2.2, damage: 60, description: '装甲厚重、火力强大的主战坦克。' }),
  unit('ifv', '多功能步兵车', 'IFV', 'allied', 600, 220, 'fv', { prerequisites: ['war_factory'], speed: 3.5, damage: 30, antiAir: true, range: 6, weapon: 'missile', transportCapacity: 1, infantryOnly: true, description: '装载一名步兵切换武器。工程师变维修车，狙击手变远程狙击车。按 D 卸载。' }),
  unit('flak_track', '防空履带车', 'Flak Track', 'soviet', 500, 260, 'htk', { prerequisites: ['war_factory'], speed: 3, damage: 25, range: 6, antiAir: true, transportCapacity: 5, infantryOnly: true, weapon: 'flak', description: '快速防空车辆，可运输五名步兵。' }),
  unit('chrono_miner', '超时空采矿车', 'Chrono Miner', 'allied', 1400, 850, 'cmin', { prerequisites: ['war_factory'], range: 0, damage: 0, speed: 2.4, harvest: true, capacity: 700, description: '自动采矿，将矿石送回精炼厂。' }),
  unit('war_miner', '武装采矿车', 'War Miner', 'soviet', 1400, 1000, 'harv', { prerequisites: ['war_factory'], range: 4, damage: 20, weapon: 'bullet', speed: 2, harvest: true, capacity: 1000, description: '拥有自卫武器和大容量货舱的采矿车。' }),
  unit('allied_mcv', '盟军基地车', 'Allied MCV', 'allied', 3000, 1100, 'mcv', { prerequisites: ['war_factory', 'depot'], speed: 1.5, range: 0, damage: 0, deploysTo: 'construction_yard', description: '双击或按 D 部署为盟军建造厂。' }),
  unit('soviet_mcv', '苏军基地车', 'Soviet MCV', 'soviet', 3000, 1100, 'smcv', { prerequisites: ['war_factory', 'depot'], speed: 1.5, range: 0, damage: 0, deploysTo: 'soviet_construction_yard', description: '双击或按 D 部署为苏军建造厂。' }),
  unit('prism_tank', '光棱坦克', 'Prism Tank', 'allied', 1200, 260, 'sref', { prerequisites: ['war_factory', 'tech'], speed: 2, range: 9, damage: 95, cooldown: 2, weapon: 'prism', description: '远程光棱武器，适合摧毁建筑和步兵。' }),
  unit('mirage_tank', '幻影坦克', 'Mirage Tank', 'allied', 1000, 260, 'rtnk', { prerequisites: ['war_factory', 'tech'], speed: 2.6, range: 7, damage: 80, weapon: 'flame', description: '使用热能武器的伏击坦克。' }),
  unit('apocalypse', '天启坦克', 'Apocalypse Tank', 'soviet', 1750, 950, 'mtnk', { prerequisites: ['war_factory', 'tech'], speed: 1.5, range: 6, damage: 100, cooldown: 1.7, antiAir: true, description: '重装甲双管坦克，可攻击空中目标。' }),
  unit('v3', 'V3 火箭车', 'V3 Rocket Launcher', 'soviet', 800, 180, 'v3', { prerequisites: ['war_factory', 'radar'], speed: 1.9, range: 15, damage: 220, cooldown: 6, weapon: 'missile', description: '远距离轰炸敌方建筑。' }),
  unit('terror_drone', '恐怖机器人', 'Terror Drone', 'soviet', 500, 120, 'dron', { prerequisites: ['war_factory'], speed: 4.5, range: 1, damage: 85, cooldown: .65, armor: 'light', weapon: 'melee', description: '高速近战机器人，擅长破坏战车。' }),
  unit('tank_destroyer', '坦克杀手', 'Tank Destroyer', 'allied', 900, 400, 'tnkd', { prerequisites: ['war_factory', 'radar'], country: 'germany', speed: 2.4, range: 6, damage: 105, cooldown: 1.8, description: '德国专属单位，攻击装甲有额外伤害。' }),
  unit('tesla_tank', '磁能坦克', 'Tesla Tank', 'soviet', 1200, 380, 'ttnk', { prerequisites: ['war_factory', 'radar'], country: 'russia', speed: 2.3, range: 6, damage: 100, cooldown: 1.6, weapon: 'tesla', description: '苏俄专属磁能坦克。' }),
  unit('demolition_truck', '自爆卡车', 'Demolition Truck', 'soviet', 1500, 150, 'trucka', { prerequisites: ['war_factory', 'radar'], country: 'libya', speed: 2.6, range: 1, damage: 950, weapon: 'explosive', description: '利比亚专属单位，接近目标后造成大范围爆炸。' }),
  unit('harrier', '入侵者战机', 'Harrier', 'allied', 1200, 220, 'falc', { category: 'aircraft', prerequisites: ['radar'], flying: true, speed: 6, range: 6, damage: 100, cooldown: 3.5, weapon: 'missile', description: '高速对地攻击战机。' }),
  unit('black_eagle', '黑鹰战机', 'Black Eagle', 'allied', 1200, 300, 'beag', { category: 'aircraft', prerequisites: ['radar'], country: 'korea', flying: true, speed: 6, range: 6, damage: 150, cooldown: 3.5, weapon: 'missile', description: '韩国专属战机，装甲和火力强于入侵者。' }),
  unit('kirov', '基洛夫空艇', 'Kirov Airship', 'soviet', 2000, 1800, 'zep', { prerequisites: ['war_factory', 'tech'], flying: true, speed: .85, range: 0, damage: 240, cooldown: 2, weapon: 'bomb', description: '缓慢而坚固的重型轰炸飞艇。' }),
  unit('nighthawk', '夜鹰直升机', 'Nighthawk Transport', 'allied', 1000, 400, 'shad', { prerequisites: ['war_factory', 'radar'], flying: true, speed: 4, damage: 25, cooldown: .65, weapon: 'bullet', transportCapacity: 5, infantryOnly: true, description: '可运输五名步兵的空中支援直升机。' }),
  unit('destroyer', '驱逐舰', 'Destroyer', 'allied', 1000, 650, 'dest', { category: 'naval', prerequisites: ['naval'], naval: true, speed: 2.3, range: 8, damage: 65, description: '舰炮攻击海面与岸上目标，舰载机执行反潜攻击。' }),
  unit('aegis', '神盾巡洋舰', 'Aegis Cruiser', 'allied', 1200, 800, 'aegis', { category: 'naval', prerequisites: ['naval', 'radar'], naval: true, speed: 2, range: 12, damage: 85, antiAir: true, canAttackGround: false, weapon: 'missile', description: '远程防空战舰。' }),
  unit('carrier', '航空母舰', 'Aircraft Carrier', 'allied', 2000, 1100, 'carrier', { category: 'naval', prerequisites: ['naval', 'tech'], naval: true, speed: 1.5, range: 18, damage: 180, cooldown: 4, weapon: 'carrier', description: '远距离打击海上与陆地目标。' }),
  unit('dolphin', '海豚', 'Dolphin', 'allied', 500, 200, 'dlph', { category: 'naval', prerequisites: ['naval', 'tech'], naval: true, speed: 3.5, range: 4, damage: 55, weapon: 'sonic', description: '机动性极强的海军单位。' }),
  unit('submarine', '台风级潜艇', 'Typhoon Attack Sub', 'soviet', 1000, 650, 'sub', { category: 'naval', prerequisites: ['naval'], naval: true, speed: 2.3, range: 8, damage: 90, weapon: 'torpedo', description: '使用鱼雷攻击海上目标。' }),
  unit('sea_scorpion', '海蝎', 'Sea Scorpion', 'soviet', 600, 400, 'hyd', { category: 'naval', prerequisites: ['naval'], naval: true, speed: 3.2, range: 7, damage: 35, antiAir: true, weapon: 'flak', description: '高速海上防空单位。' }),
  unit('dreadnought', '无畏级战舰', 'Dreadnought', 'soviet', 2000, 1100, 'dred', { category: 'naval', prerequisites: ['naval', 'tech'], naval: true, speed: 1.5, range: 18, damage: 220, cooldown: 5, weapon: 'missile', description: '使用远程重型导弹轰炸敌方基地。' }),
  unit('giant_squid', '巨型乌贼', 'Giant Squid', 'soviet', 1000, 500, 'sqd', { category: 'naval', prerequisites: ['naval', 'tech'], naval: true, speed: 3, range: 1.5, damage: 140, weapon: 'melee', description: '强大的海上近战单位。' }),
  unit('allied_transport', '两栖运输船', 'Allied Amphibious Transport', 'allied', 900, 900, 'lcrf', { category: 'naval', prerequisites: ['naval'], naval: true, amphibious: true, speed: 3, range: 0, damage: 0, transportCapacity: 12, description: '可在陆地和水面行驶。右键装载附近部队，按 U 卸载。' }),
  unit('soviet_transport', '两栖运输船', 'Soviet Amphibious Transport', 'soviet', 900, 900, 'trs', { category: 'naval', prerequisites: ['naval'], naval: true, amphibious: true, speed: 3, range: 0, damage: 0, transportCapacity: 12, description: '可在陆地和水面行驶。右键装载附近部队，按 U 卸载。' }),
];

export const BUILDING_DEFS: Record<string, Definition> = Object.fromEntries(structures.map(d => [d.id, d]));
export const UNIT_DEFS: Record<string, Definition> = Object.fromEntries(vehicles.map(d => [d.id, d]));
export const CATALOG: Record<string, Definition> = { ...BUILDING_DEFS, ...UNIT_DEFS };
export const CATEGORIES: ProductionCategory[] = ['structure', 'defense', 'infantry', 'vehicle', 'aircraft', 'naval'];
export const CATEGORY_NAMES: Record<ProductionCategory, string> = { structure: '建筑', defense: '防御', infantry: '步兵', vehicle: '战车', aircraft: '空军', naval: '海军' };
// Original rules.ini [Colors], mpAllowedColors order; HSV components use 0–255.
export const PLAYER_COLORS = ['#e6de0d', '#ff1818', '#2269d4', '#3cd22d', '#ffa018', '#31d7e6', '#9428bd', '#ff99ea'];
export const getDefinition = (type: string): Definition => CATALOG[type] ?? UNIT_DEFS.grizzly;
export const countryById = (id: string): Country => COUNTRIES.find(c => c.id === id) ?? COUNTRIES[0];
