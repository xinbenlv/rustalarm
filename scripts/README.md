# Developer and browser checks

Scripts prepare local originals, check publication boundaries and exercise the UI.
Original outputs and browser evidence stay ignored.

`prepare-local-assets.sh` creates ignored `_3p/` and asks before native setup.
The Git template invokes this script on an interactive clone checkout.

```text
assets/ + setup-assets.ts -> local optional extraction / conversion
maps/                    -> map conversion and native-map tests
check-source-only.ts     -> tracked source / production media isolation
browser_setup.py         -> browser download/conversion acceptance
browser_map_editor*.mjs  -> editor, sharing, resize and terrain acceptance
browser_bootcamp*.mjs    -> main-app bilingual switching, models and motion
local-installer.ts       -> loopback-only Vite installer discovery and streaming
browser_local_installer.mjs -> local copy, failure/retry and full conversion
browser_*.py / *.mjs     -> other existing UI regression suites
```

Prepared skirmish/editor suites select `mode-skirmish` after navigation or reload.
The setup suite also does so after conversion, cached re-entry and offline reload;
the locale audit re-enters after restoring and rechecking deliberately missing assets.

Bootcamp scripts connect to a dedicated Chrome CDP endpoint (`RA2_CDP_URL`, default
`http://127.0.0.1:9227`) with originals prepared for `RA2_BROWSER_URL` (default
`http://127.0.0.1:4207/`). They drive the mode menu, shared lobby and real battlefield.
They overwrite only their own ignored `.cache/bootcamp/evidence` output. Never run
them against a browser profile with an in-progress game the user wants to retain.

`browser_bootcamp_lifecycle.mjs` checks in-flight input, cancellation and live languages.
`browser_bootcamp.mjs` checks all production icons, identity/state preservation,
loading/context failure, re-entry and loop ownership. `browser_bootcamp_motion.mjs`
uploads a generated map and checks 64 actual movement directions, attacks and
skeletal deformation. They also run against a production preview and a base path.
`browser_bootcamp_camera.mjs` checks the default training map, shared-state switches,
all three camera presets from four directions, actual pointer orders, orbit/pan/zoom,
building placement, remembered view and environment-load failure recovery.

The local-installer browser check uses a fresh context on the same CDP endpoint,
defaults to the port 4208 subpath preview and requires an existing detected installer.
It blocks Internet Archive requests and saves evidence under `.cache/local-installer`.

`browser_bootcamp_terrain.mjs` checks real harvesting/depletion, hidden minerals,
renderer roundtrips and 48 near/far views across three camera presets/four directions.
It defaults to isolated ports 4211/9231 and writes only `.cache/terrain/`.

`RA2_BROWSER_URL=http://127.0.0.1:5173/ node scripts/browser_prepared_assets.mjs`
launches isolated Chrome and verifies disk-backed Bootcamp/Skirmish entry, including
2D/3D switching, with no download, conversion worker or installed original cache.

`browser_bootcamp_highland.mjs` instead launches a dedicated persistent Chrome profile
specified by `RA2_BROWSER_PROFILE`, already prepared for `RA2_BROWSER_URL` (default
port 4216). It checks flat grass pixels and filled front walls at 1× and 2.5×,
after pan, and shared-state 2D/3D roundtrips. Evidence stays under
`.cache/bootcamp/highland` (override with `RA2_EVIDENCE_DIR`). On a Vite dev server,
`RA2_HIGHLAND_BASELINE=1` disables the correction only in that browser and must fail
the same pixel test; it does not modify source or shared game state.

`browser_sidebar.mjs` launches isolated Chrome at port 4226 by default and checks
both native skins, two sizes, bilingual controls, production/repair/sale and 2D/3D.
Evidence stays in `.cache/sidebar/evidence/`; see `docs/sidebar-verification.md`.

`browser_menus.mjs` checks blank/disabled production categories, loss of a producer,
entry/menu art and live audio, camera, speed and viewport settings in both languages
and 2D/3D. Use `RA2_EMPTY_ONLY=1` for the focused category regression.

`browser_lobby_skin.mjs` checks original-style lobby/map layout in both modes and
languages, category filters, map sorting/cancel/confirm, retained player settings
and starting the chosen map. Screenshots remain in the same ignored cache.

`node scripts/browser_fidelity.mjs` verifies the 3-second entry splash, original
eight colors, right-side ESC/language controls, bottom group and waypoint commands,
and delayed 2D/3D name tooltips including fog and death. Screenshots stay in
`.cache/sidebar/evidence/rust-alarm-*.png`.

`node scripts/browser_menu_video.mjs` verifies original playback, loop, Fira font,
teardown, reduced motion and media failure at port 4226. Set
`RA2_TEST_VIDEO_CONVERTER=1` with local `.cache/menu-video/ra2ts_l.bik` to also
exercise real nested-worker Bink encoding. Evidence stays in `.cache/menu-video/`.

`browser_menu_cache.mjs` checks source-only static hosting on port 4229: missing
assets open preparation; cached native art/video work after a cold worker start.

`RA2_BROWSER_URL=http://127.0.0.1:4237/ python3 scripts/browser_saves.py` uses
Python Playwright and Chrome with a temporary profile. The script verifies saves
across browser restarts, both modes, native/imported maps, file backups, transaction
rollback, confirmations, languages and failed-load recovery. Evidence stays in
`.cache/saves/evidence/`. The development server must have prepared local assets.
The script also checks saved build identity, map overviews, old saves and narrow screens.

`node scripts/browser_production.mjs` 验证机场和生产回归。
浏览器测试检查满额禁用、起飞名额、停机点击和通知节点。
测试默认访问端口 4248，截图存放在 `.cache/airfield/`。

`browser_behaviors.mjs` 验证集结点、主工厂和雷达右键。
测试也检查限额按钮、建筑部件、战机出击与返航。
测试使用独立 Chrome，并把截图写入 `.cache/behavior/`。

`browser_combat_fidelity.mjs` 验证光棱、导弹和支援界面。
测试默认使用端口 4259，截图写入 `.cache/combat-fidelity/`。
