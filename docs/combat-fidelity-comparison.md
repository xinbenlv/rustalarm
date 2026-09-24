# 本次比对修复了光棱、战机和支援界面

本次比对日期为 2026-09-23。
本次实现只参考行为、规则数据和素材标识。
Rust Alarm 没有复制参考项目的游戏实现。
本次改动保留了工作区中已有的其他修改。

## 两份参考代码采用相同的核心行为

参考目录分别为：

- `/Users/zzn/ws/xinbenlv/chrono-divide-humanify-opus`
- `/Users/zzn/ws/xinbenlv/chrono-divide-humanified`

两份目录中的下列核心文件逐字节一致：

- `src/game/gameobject/task/AttackTask.js`
- `src/game/gameobject/locomotor/WingedLocomotor.js`
- `src/game/SuperWeapon.js`
- `src/game/superweapon/ParadropEffect.js`
- `src/gui/screen/game/component/hud/SuperWeaponTimers.js`

两份 `SidebarCard.js` 的冷却计算也一致。
`humanify-opus` 额外打印就绪标签的调试信息。
本次实现没有引入调试信息。
本地 `_3p/raw/rules.ini` 提供数值和图标标识。
本地 `_3p/raw/art.ini` 提供光棱塔动画标识。

## 逐项比对揭示了五组缺项

参考文件路径均相对于参考目录。
“原有实现”描述本次修改前的工作区。

| 反馈 | 参考实现与文件 | 原有实现 | 本次实现 |
| --- | --- | --- | --- |
| 光棱塔不发光棱 | `src/game/gameobject/task/AttackTask.js`：主塔充能，空闲同属塔支援，最多八座 | 引擎直接结算伤害；光束从地面附近发射；没有聚光 | [引擎](../src/game/engine.ts)和[光棱参数](../src/game/prism.ts)增加充能、支援占用、增伤和取消；塔顶发射光束 |
| 多辆光棱坦克是否聚光 | `src/game/gameobject/Projectile.js`：坦克光束命中非建筑后分裂 | 引擎只结算范围伤害，没有分裂光束 | 引擎绘制分裂光束；建筑目标不分裂；坦克不互相聚光 |
| 战机起飞速度不对 | `src/game/gameobject/locomotor/WingedLocomotor.js`：战机同时爬升和加速，接近终点减速 | 战机垂直升至 45 像素，然后瞬间以全速平移 | [战机参数](../src/game/aircraft.ts)和引擎增加加速、减速、同时爬升；战机约 3.33 秒升至巡航高度 |
| 导弹显示不对 | `src/engine/renderable/entity/Projectile.js`：原版投射物图像；Maverick 使用 `DRAGON` | 渲染器画通用箭头，两发导弹横向平移；命中效果落在地面 | [武器渲染](../src/weapon-effects.ts)使用 32 向原版导弹；两发导弹分时发射；命中高度跟随目标 |
| 公共超级武器倒计时缺失 | `src/gui/screen/game/component/hud/SuperWeaponTimers.js`：遍历全部玩家，读取 `ShowTimer`，使用玩家颜色和分钟秒钟 | 支援按钮只显示本地剩余秒数；战场没有公共倒计时 | [倒计时界面](../src/hud/superweapon-timers.ts)在战场右下角显示全部存活玩家；迷雾不隐藏倒计时；窄屏自动分列 |
| 空降图标不对 | `src/gui/screen/game/component/hud/viewmodel/CombatantSidebarModel.js`：支援读取 `SidebarImage` | 空降使用机场图标；其他支援使用建筑图标 | [生产界面](../src/hud/production.ts)分别使用 `APAR/PARA/CHRO/BOLT/IRCR/NUKE` |
| 倒计时按钮没有旋转指针 | `src/gui/screen/game/component/hud/SidebarCard.js`：`gclock2.shp` 按进度切换 55 帧 | 生产按钮有时钟；支援按钮没有时钟，并且整体变灰 | 支援按钮复用原版半透明时钟；指针随充能旋转；就绪时遮罩消失 |

## 本次实现同时修正了关联规则

光棱塔使用所属玩家的光束颜色。
一座支援塔给主塔增加 150% 基础伤害。
充能期间，支援塔不同时发动自己的攻击。
停电或目标消失会取消聚光。
存档记录充能目标、支援塔和发射时间。

素材转换器保留光棱塔待机和充能动画。
[动画合成器](../scripts/assets/prism_animation.py)读取原版帧。
渲染器根据实际充能状态选择动画。

支援规则采用原版充能时间：

| 支援 | 充能时间 | 需要供电 | 公共倒计时 |
| --- | --- | --- | --- |
| 空降部队 | 04:00 | 否 | 否 |
| 超时空传送 | 07:00 | 是 | 是 |
| 闪电风暴 | 10:00 | 是 | 是 |
| 铁幕装置 | 05:00 | 是 | 是 |
| 核弹攻击 | 10:00 | 是 | 是 |

空降按钮保留本地充能指针。
停电会暂停超级武器，但不会暂停空降。
建筑出售、摧毁或玩家出局会移除对应公共计时。
暂停游戏会冻结充能数值和按钮指针。

浏览器素材版本从 8 升为 9。
旧缓存会复用已验证的安装包重新转换。
本地升级命令为 `npm run assets:setup -- --sprites-only`。
本次已经更新当前工作区的本地素材。
转换后的原版素材仍留在忽略目录中。

## 完整功能对齐仍然存在后续差异

下表记录本次比对确认的剩余差异。
本次修复不代表整个引擎已经等同参考项目。

| 范围 | 参考功能 | 当前差异与代码 |
| --- | --- | --- |
| 空降执行 | `ParadropEffect.js` 和 `ParadropTask.js` 管理运输机、航线和降落伞 | `GameEngine.support()` 仍直接生成八名大兵；运输机航线、降落过程和阵营兵种尚未实现 |
| 两种空降来源 | 参考项目分别管理美国空降和科技机场空降 | `getSupport()` 仍合并两个来源；美国玩家同时拥有两种来源时没有两个独立按钮 |
| 战机转弯 | `WingedLocomotor.js` 管理转弯半径、俯仰、滚转和盘旋 | 战机已经加速爬升；引擎仍直接转向目标，未实现完整飞行姿态 |
| 导弹轨迹 | 参考项目以独立投射物状态处理转向和飞行 | 当前导弹沿发射点到目标的插值轨迹飞行；导弹尚无完整转向半径 |
| 光棱碎片 | `Projectile.js` 使用碎片额度，并向空地发射剩余额度 | 当前普通坦克最多向三个有效目标分裂；空地碎片和精英级联尚未实现 |
| 超级武器执行 | 参考项目分别实现核弹飞行、持续风暴和两阶段传送 | `support()` 仍使用简化范围伤害和选中单位传送；本次只对齐计时、供电和按钮 |
| 兵种数值 | 原版规则分别提供生命、弹头和每发伤害 | 本次保留多数现有兵种数值；战机双发平分现有总伤害；当前数值尚未全面对齐 |

## 本次验证覆盖了状态和实际画面

`npm test` 通过了 178 项测试。
`npm run build` 通过了类型检查和构建。
`npm run assets:check` 确认本地素材完整。
`npm run repo:check` 确认原版素材没有进入 Git。

[模拟测试](../src/game/combat-fidelity.test.ts)覆盖聚光增伤、支援上限、取消、分裂、爬升和计时。
已有战机测试继续验证出击、返航、装弹和存档续跑。
[浏览器测试](../scripts/browser_combat_fidelity.mjs)验证真实界面。
浏览器测试覆盖迷雾、颜色、图标、指针和窄屏布局。
浏览器测试也覆盖八名玩家的 32 条倒计时。

开发服务使用端口 4259。
浏览器测试使用独立的无界面 Chrome。
本地截图位于 `.cache/combat-fidelity/`。
截图不会进入 Git 或发布产物。
本次没有发布线上版本。
