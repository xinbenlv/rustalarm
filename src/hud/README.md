<!-- Native original-art HUD layout, production presentation and lifecycle. -->
# Original-art interface

The shared 2D/3D HUD displays locally converted Allied/Soviet SHP atlases at their
native 168px width. No original media is imported into the application bundle.
Hosted entry connects browser storage and checks readiness before showing the menu.
Missing or outdated originals open preparation; local dev still reuses disk output.

```text
main.ts -> sidebar.ts     shell, native buttons, radar cover, power, resize/disposal
        -> production.ts availability, cards, queue/ready/progress and callbacks
availability.ts          unlocked/queued categories, shared by pointer and keyboard
notifications.ts         stable warning nodes and production voice cues
superweapon-timers.ts     全部玩家的公共倒计时、玩家颜色和窄屏分列
menu-skin.ts + menus.css  locally converted dialog/buttons/checkboxes
menu-shell.ts + CSS      CRT entry, 3-second splash and native mechanical command rail
menu-entry.css           fitted 4:3 entry composition
menu-video.ts + CSS      local original movie, reduced motion and exit cleanup
fonts/                   licensed Fira Sans Condensed 500/700 and menu font tokens
command-bar.ts + CSS     native groups/type/deploy/stop/waypoint controls
entity-tooltip.ts        delayed visibility-aware 2D/3D names
lobby-layout.ts + lobby.css compact player/rules panel and right map/commands
map-picker.ts + CSS       filtered/sorted map list, guarded preview and confirmation
options*.ts + options.css live sound, display, speed and camera controls
save-menu.ts + save-menu.css local saves, versions, map overviews and file import/export
skin.ts                  atlas frames, geometry and readiness contract
sidebar.css              native pixel sizes and control states
scripts/assets/*-assets.json -> Python converter + TypeScript validation
```

Credits/top/radar/side1 precede whole 50px production rows. Each row has two 60×48
cameos with a 3px column gap. Side3/addon close the panel; the row calculation also
reserves the scroll arrows' full height. A ResizeObserver adjusts row count only.
Below 311px sidebar height the containing game region scrolls, rather than scaling art.

Normal/pressed/disabled frames are 0/1/2 where available. Tabs flash frame 3 for a
ready item in another category. The defense tab shows unlocked support abilities
above defense buildings, including superweapons after their buildings are placed.
Progress uses all 55 `gclock2` frames at 50% opacity;
ready labels and quantities remain localized DOM text. Power uses original colored
pips; the radar cover is frame 0 offline and the final frame online. The minimap
canvas retains the existing renderer's aspect ratio and pointer coordinate mapping.

支援按钮使用独立的原版图标，并复用旋转冷却遮罩。
公共超级武器倒计时显示在战场右下角。
公共倒计时使用所属玩家颜色和分钟秒钟格式。
迷雾不隐藏公共倒计时。空降只显示本地按钮指针。

引擎限制四类超级武器建筑和谭雅的数量。
侧栏保留满足前置条件的按钮。满额按钮变暗。
飞机名额满额时，侧栏保留飞机按钮并使按钮变暗。
生产完成通过语音、就绪标签和分页闪烁提示玩家。
生产完成不显示浮动通知。警报刷新保留原有文字节点。
Single-building queues, unit queues, cancellation, placement, repair/sell and support
rules still apply. Main owns command callbacks; the
sidebar owns presentation and disconnects its observer on exit. Deploy and control groups use native bottom command icons; base remains the H
shortcut. Language and settings live in the right-side ESC menu. The diplomacy icon
opens a read-only player/team table. Empty categories retain their disabled frame and no text; selection moves to the
first available category when its last producer disappears. The entry, lobby,
help, pause and result dialogs share original menu artwork. Settings immediately
update the current match; size presets bound the viewport and fit smaller windows.
Audio channels have independent volume and preserve the selected music track.

See [acceptance and local screenshots](../../docs/sidebar-verification.md).

Ordinary menus use labels and controls without descriptive paragraphs. Status
text appears for loading/errors; instructions remain in the explicit help dialog.

Waypoint mode (Z) appends real simulation destinations, with visible route markers.
Ctrl/Command-click assigns teams 1–3; keyboard groups 1–9 remain available. World
names appear after 800 ms of stationary hover and disappear under fog or on death.
