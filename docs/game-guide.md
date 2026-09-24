<!-- Detailed existing game, preparation, editor and local tooling guide. -->
> **One Shot 结果**：如果你想查看这个项目的 One Shot 结果，请访问 [v0.1.0](https://github.com/xinbenlv/ra2-gpt-6-astra-2026-09-04/commit/3b9e9eaa2aa3b13db1f1bb1daca0f833d48986bf)。该版本的源代码保存在链接指向的对应提交中；仓库中的历史标签为 `v.0.1.0`。
>
> **Original One Shot result:** Use the v0.1.0 link above to open the exact commit containing that version's source code.

# Fan Re-created Red Alert2 (via ChatGPT 6 Astra on 2026-09-04)

This checkout: **v0.4.0** — Skirmish and Bootcamp with browser-only asset preparation. See [Bootcamp verification](bootcamp-verification.md) for the local implementation and renderer limits; the published site is not updated by a local build. The earlier local-file startup version is preserved as **v.0.1.0**.

An independent fan recreation created by developer [Victor Zhou](https://zzn.im) in a **one-shot development experiment on 2026-09-04**, while testing the then-latest model, **ChatGPT 6 Astra**. Victor uses this approach to benchmark different models. The one-shot label describes the initial experiment; subsequent fixes and updates are recorded in the commit history.

## Disclaimer and contact

This project has no affiliation, sponsorship, authorization or endorsement from **Electronic Arts (EA), Westwood Studios or their licensors**. Command & Conquer, Red Alert 2, and all original game trademarks, logos, assets and related copyrights belong to **EA and their respective rights holders**.

This project is also **not associated with, sponsored by or endorsed by OpenAI or ChatGPT**. OpenAI, ChatGPT and related trademarks and logos belong to **OpenAI and their respective owners**. The model name identifies the tool used for this experiment and does not imply an official partnership.

**No infringement of anyone’s copyright or other rights is intended.** This project claims no ownership of the original assets and grants no license to third-party content. For questions, rights concerns or **takedown requests**, contact Victor at **hi[at]zzn[dot]im** ([email](mailto:hi@zzn.im)).

## About the game

A browser RTS focused on Red Alert 2 skirmishes and Bootcamp, with original Westwood artwork, maps, voices and music converted on the player's device. The game engine, AI, rendering and interface are independently written in TypeScript. The initial implementation did not consult existing game implementations. Later regression fixes compare behavior with the local Chrono Divide references requested by the user.

## Create and share maps

After entering the skirmish lobby, open **Map editor / 地图编辑器** in the same web app. Choose a map size, theater and 2–8 starting positions; paint land, water, roads, cliffs, snow, ore and gems. The isometric canvas and custom-map battlefield both use the installed original terrain atlases and resource artwork, with 1×1, 3×3, 5×5, 7×7 and 9×9 brushes. Select a starting position and click the map to move it. Brush strokes and template/file replacement support undo and redo. The editor keeps a draft in this browser when local storage is available.

Coasts update as you paint: neighboring land and water select original shoreline pieces, including inside and outside corners, while beaches and pavement use the original edge transitions. The editor and battle use the same deterministic terrain resolver and draw order. Existing `.ra2map` files gain this rendering automatically; no file conversion or new asset download is needed.

Paint beyond an edge with **Auto-expand map** enabled to extend the map in any direction, including the full brush footprint. Existing terrain stays in place on screen. **Adjust map bounds** exposes eight handles: drag an edge or corner to preview a crop or expansion, then release to apply it. Each dimension supports 24–96 cells. A crop removes terrain and starting positions outside the new bounds; undo restores them together. Place any missing starting positions before downloading or playing. Pan with the middle mouse button or Space + drag, and zoom with the wheel or toolbar controls. On a touchscreen, use one finger to paint and two fingers to pinch-zoom or pan. The toolbar shows the current zoom percentage; **Fit Map** brings the whole map back into view. Zooming and panning preserve the map and its dimensions.

Click **Download map** to save a `.ra2map` file, then share that file. The recipient opens **Upload map / 上传地图** in the skirmish lobby (also available under **Choose map**), selects the file, configures opponents and starts the match. **Use in skirmish** sends the editor's current map directly to the lobby. Open a shared `.ra2map` in the editor to continue editing it.

Files contain versioned JSON with the map name, dimensions, theater, terrain/resources and starting positions. Import validates the file before adding it to the lobby, including a clear 5×5 area around each starting position for base deployment. `.ra2map` is this web app's format, not the original game's `.map` format; original `.map` / `.mpr` imports remain supported in the lobby. Shared files contain no original artwork or audio, and each player still needs the normal browser asset preparation. Imported lobby maps last for the page session; keep the downloaded file for later use. Files are read locally in the browser.

The sharing acceptance script uses two separate Chromium profiles copied from an already prepared asset profile. Run the app at the same origin used for that profile, then run `RA2_BROWSER_URL=http://127.0.0.1:4174/ RA2_BROWSER_PROFILE=.cache/browser-acceptance node scripts/browser_map_editor.mjs`. It checks editing, download contents, draft recovery, mobile/English controls and a second browser uploading the file and deploying a base. Run `node scripts/browser_map_editor_resize.mjs` against that origin and prepared editor profile to also check textured water, 9×9 brushes, expansion in all four directions, crop previews, undo/redo, view controls, draft recovery, size limits and a resized map starting a skirmish. Run `node scripts/browser_native_terrain.mjs` to verify actual original atlas draw calls in all three theaters and compare pixels from the editor and the imported map in battle, including shores, pavement, cliffs, ore and gems. Test profiles, downloads and screenshots stay under ignored `.cache/`.

## Play

[Play on GitHub Pages](https://ra2.apps.zzn.im/). GitHub Pages serves the game at the configured custom domain.

The fixed bottom-right label identifies the code currently running: a six-character Git commit hash and its commit time in UTC. These values are embedded during the build, so a cached page keeps its own version label. Online navigation revalidates the page; offline play retains the last loaded version and installed original assets.

For local development, install Node.js 22 or newer:

```sh
npm ci
npm run dev
```

The interface defaults to **English**, except when the browser’s preferred language is Chinese (`zh`, including `zh-CN`, `zh-TW` and `zh-HK`). A saved manual language choice takes precedence. Use the English / 中文 selector to switch at any time.

Open the printed address, normally [http://127.0.0.1:5173](http://127.0.0.1:5173).

1. On first launch, choose **Agree & download**, or import an installer you have already downloaded. The page links to the [Internet Archive item](https://archive.org/details/red-alert-2-multiplayer) and the exact [Red-Alert-2-Multiplayer.exe file](https://archive.org/download/red-alert-2-multiplayer/Red-Alert-2-Multiplayer.exe).
2. To import a local copy, click **Choose file & prepare** or drag the file into the page. The supported installer is approximately **207 MB** (206,530,229 bytes). The browser verifies its size and SHA-256 before caching it; an incorrect file leaves an existing verified installer untouched. Local files are never uploaded.
3. Both paths extract and convert the same resources in a Web Worker. The Windows executable is never run. Conversion tools may still download on first use, even when you provide a local installer.
4. The browser stores the verified installer and converted resources in its own site storage. When preparation completes, the skirmish lobby opens automatically. Later visits reuse that storage.

Playing requires **no Python, 7-Zip, FFmpeg, backend or server-side conversion**. Initial preparation also downloads the Pyodide conversion runtime and its Python packages from a CDN. The application host serves code and conversion tools; it does not host, receive or proxy the original game resources.

Use a current desktop browser with Service Worker, WebAssembly, CacheStorage and OffscreenCanvas support. Preparation takes several minutes and temporarily uses substantially more memory than the download size. Production builds cache the application shell for subsequent offline play. Browser storage is specific to the site's origin and browser profile; clearing site data removes the installation, and storage eviction may require preparing it again.

### 中文快速开始

运行 `npm ci`、`npm run dev` 后打开网址。首次启动可同意浏览器直接从 Internet Archive 下载约 207 MB 安装包，也可点击「选择文件并准备」或拖入已下载的 Red-Alert-2-Multiplayer.exe。页面提供对应 Archive 条目和安装包直链。文件会在本机浏览器内校验、保存、解包和转换，不会上传，完成后自动进入遭遇战。无需安装 Python、7-Zip 或 FFmpeg，也不需要素材服务器。下次打开会复用浏览器缓存；清除该网站的数据会移除素材。

## Build and host

```sh
npm run build
npm run preview
```

Serve `dist/` over HTTPS; localhost is supported for development. Root hosting works by default. For a repository subpath, use the same base for building and previewing:

```sh
RA2_BASE_PATH=/ra2-gpt-6-astra-2026-09-04/ npm run build
RA2_BASE_PATH=/ra2-gpt-6-astra-2026-09-04/ npm run preview
```

The service worker, application files, original-asset URLs and offline cache respect that base. Browser caches are separated by app path, so this site does not take over other projects on the same `github.io` origin.

The **Deploy GitHub Pages** workflow runs on pushes to `main` or manual dispatch. It tests the source, builds for the Pages base path, verifies the source-only boundary, then uploads only `dist/` and deploys it. The repository Pages settings configure the custom domain.

Every build excludes original resources, **even when the developer has already extracted them into `public/`**. Vite's automatic public-directory copying is disabled. The build contains the app, conversion code, 7-Zip WebAssembly, a service worker and an application-shell manifest. Static hosting supports the complete browser preparation flow.

## Skirmish features

- Skirmish setup and play only; Bootcamp training; no campaign or missions.
- All **9 original RA2 countries**: America, Korea, France, Germany, Britain, Russia, Iraq, Cuba and Libya. No Yuri's Revenge faction; the original Soviet Yuri infantry remains available.
- One human player and up to seven AI opponents, three AI difficulties, countries, colors, alliances and spawn positions; starting credits/units, game speed, fog, superweapons and short-game settings.
- Original map catalog including **Arctic Circle (`mp22s8`)**, native terrain, overlays, previews and spawn positions. Local `.map` / `.mpr` import is supported. The catalog includes 79 ordinary skirmish maps, two playable MegaWealth maps and two annotated unfinished archive variants.
- Snow, temperate and urban theaters; 8,434 native TMP tile frames, bridges, ore, gems, roads, trees and neutral buildings.
- Original SHP sprites and infantry animation, 32-direction VXL vehicle rendering, house-color masks, cameos and Allied/Soviet sidebar graphics.
- MCV deployment, construction prerequisites, power, building placement, parallel production queues, refunds, repair/sell, mining and resource depletion.
- Selection, movement, attack-move, automatic combat, pathfinding, land/naval/air units, transports, veterancy, fog and allied shared vision.
- Country-specific units/support, engineer captures, oil income, hospitals and airfields, Yuri control, Crazy Ivan bombs and IFV passenger weapons.
- Paradrops, nuclear missiles, lightning storms, Iron Curtain and Chronosphere support; AI base construction, economy and attacks; victory/defeat, pause and replaying a skirmish.
- Original unit voices, EVA announcements, combat sounds and music including Hell March 2.

## Controls

| Input | Action |
| --- | --- |
| Left click / drag | Select friendly units; Shift adds/removes selection |
| Right click ground / enemy | Move / attack |
| Right click friendly transport | Board with infantry; D unloads |
| Double-click MCV / D | Deploy; D also deploys supported units or packs a construction yard |
| Build icon | Produce; click a ready building again to place it |
| Right-click build icon | Cancel the last item in that production category and refund it |
| A, then left click | Attack-move |
| S / G | Stop / guard |
| Ctrl/Cmd + 1–9 / number | Assign / select a control group |
| Arrow keys / screen edge | Move camera |
| Middle drag / Space drag | Pan camera |
| Mouse wheel | Zoom |
| H / radar click | Return to base / move camera |
| Tab | Change production category |
| Esc / P | Cancel current action / pause |

Short game eliminates a player after all buildings and MCVs are destroyed. With short game disabled, all units and buildings must be destroyed.

Players can use **Save Game / 存档** and **Load Game / 取档** in the pause menu.
The main menu also provides **Load Game**. Local saves retain Skirmish and Bootcamp
progress after a browser restart. Players can export and import `.rustalarm-save`
backups. See [save controls and limits](save-games.md).

## Debug Panel

Open **Debug Panel** in the bottom-left corner during a skirmish:

- **Add 10,000 credits** adds funds to the current player each time it is clicked.
- **Reveal entire map** reveals terrain, enemies and the radar for the current player. Turning it off restores normal fog rules.
- **Instant construction & recruitment** completes existing paid queues and future purchases immediately. Credits, prerequisites and building placement still apply; AI production is unchanged.
- **Mute all audio** immediately stops music, voices and effects and blocks further playback. Unmuting restores the previous music and sound preferences.

Gameplay debug options reset for each new match. The audio mute lasts for the current page session.

## Fidelity and limits

This is an independent playable rewrite, not the original executable or a frame-compatible Westwood engine. Original media and map data are retained; simulation behavior is implemented here.

Combat numbers, armor interactions, production timing, mining and AI tactics are simplified. Aircraft rearming, full projectile behavior, submarine stealth, Mirage disguise, all Spy effects, building garrisons and bridge destruction are incomplete. Voxel geometry and palettes are original, with approximate projection and lighting; some building machinery is composited into static layers.

Native map geometry, overlays, scenery and starts are read, but triggers, map-specific rules, mission logic and every special mode are not fully compatible. Only the three original RA2 theaters are supported; Yuri's Revenge theaters and mod-specific assets are not. There is no online multiplayer or original RA2 save/replay compatibility.

## Source-only publication

Git excludes original archives and every extracted or converted derivative: `public/assets/`, `public/maps/`, screenshots containing original artwork, caches, build output and Python bytecode.

```sh
npm run repo:check
npm run repo:hooks
```

The optional pre-commit hook rejects force-added original resources and scans staged files with gitleaks when available. CI tests a checkout without originals and checks a production build with synthetic resource files present, verifying that they never enter the hosted output.

## Development and verification

For the low-resolution source art → built-in ImageGen → Meshy textured 3D workflow, use the
repository skill [`$ra2-hd-blender`](../.agents/skills/ra2-hd-blender/SKILL.md).
It covers a shared reference prompt for buildings and units, Meshy task recovery,
and model/texture downloads. Blender is optional for user-requested manual review
or editing; the previous reconstruction guides remain as historical references.
Authored runtime GLBs and HD sprites can be tracked under `assets/hd/`; generated master models and extracted original game art remain in ignored caches.

```sh
npm test
npm run build
node --import tsx scripts/check-source-only.ts --build
```

Original-map integration tests run when the developer has extracted native resources locally; otherwise they are explicitly skipped. Decoder, simulation, initialization and publication-boundary tests remain runnable without originals. See [verification notes](verification.md) for measured results and the limits of each test.

The browser acceptance script checks first-run consent, a real Internet Archive download, conversion, automatic lobby entry, cached reload and offline Arctic Circle play. Run it against the production preview with a fresh browser profile:

```sh
RA2_BROWSER_URL=http://127.0.0.1:4173 \
RA2_BROWSER_PROFILE=.cache/browser-acceptance-fresh \
uv run --with playwright python scripts/browser_setup.py
```

The optional developer CLI can reproduce native assets on disk for conversion work and integration tests:

```sh
npm run assets:setup
npm run assets:check
```

This CLI requires Python 3.10+, native 7-Zip and FFmpeg. It writes ignored `.cache/ra2-assets/`, `public/assets/` and `public/maps/` directories; those files are not the browser installation and are never included in the static site. See [asset conversion documentation](../scripts/assets/README.md).

## Sources and third-party components

Original resources come from [Internet Archive: Red Alert 2 Multiplayer](https://archive.org/details/red-alert-2-multiplayer), an XWIS distribution containing Westwood game data. Browser downloads use Internet Archive's own CORS endpoint. The pinned installer SHA-256 is `5388c54d7d7b73060083563ff1926bca0d2663a76678b807e23e9a8d491441ce`.

[7z-wasm](https://github.com/use-strict/7z-wasm) supplies 7-Zip compiled to WebAssembly. Its JavaScript/WASM files use GNU LGPL 2.1-or-later plus the unRAR restriction; see the upstream [license](https://github.com/use-strict/7z-wasm/blob/master/License.txt) and [unRAR notice](https://github.com/use-strict/7z-wasm/blob/master/unRarLicense.txt). Original 7-Zip is by Igor Pavlov; the WASM package is maintained by Alexandru Ciuca. [Pyodide](https://pyodide.org/) runs the original project converters in the browser with Pillow, PyCryptodome and audioop-lts. These components retain their own licenses; original game media is not included in the source repository.

### GLB and Canvas 2D asset viewer

```sh
npm ci
npm run viewer:glb
```

Open <http://127.0.0.1:4175/> for local GLB comparison, or choose **Canvas 2D 战场**
to view the HD sprite scene at <http://127.0.0.1:4175/canvas/>. Both use one server.
The viewer code is in `tools/glb-compare/` and `tools/canvas-hd-preview/`; authored
runtime samples and their checksums are in [`assets/hd/`](../assets/hd/README.md).
No Codex workspace directory is required. The Canvas page uses the actual game
`GameEngine`, `Assets`, and `BattlefieldRenderer` with optional 4× sprite density.

The branch ships four optimized GLBs (about 30K triangles each, 1K WebP textures)
and their baked sprites; no LFS download is required. The Canvas scene contains four baked sample types. Arbitrary GLBs imported on the
3D page do not automatically become game sprites. The preview includes procedural Tanya walking/firing/hit frames, vehicle recoil,
combat/repair effects, enemy targets, pause/slow motion and masked team colors.
The GLBs remain static; full skeletal animation, separate turrets/tracks and
character death clips are not included.

Original-art comparison uses optional local `.cache/ra2-assets-rebuild-result/assets`.
Without it, authored HD sprites still work with the engine's terrain fallback and
the original-art toggle is disabled. Extracted original art is not committed.

`PORT` overrides 4175. `GLB_VIEWER_DIR`, `GLB_CANVAS_DIR`, `RA2_ORIGINAL_ASSETS`
and `RA2_MODEL_DIR` override the viewer, Canvas page, extracted original-art and
master-model locations respectively. Run `npm run viewer:glb -- --help` for details.
The default listener is local-only; nothing is pushed or published by this command.

Browser checks (server running, local Chrome installed):

```sh
node tools/glb-compare/test-integrated.mjs
node tools/canvas-hd-preview/verify.mjs
node tools/canvas-hd-preview/test-actions.mjs
node --test tools/canvas-hd-preview/procedural-poses.test.mjs
```

The first check also supports a cache-free checkout. The second needs original art
for its before/after screenshots. Results go to ignored `.cache/viewer-tests/`.

### Tanya skeletal action preview

Run `npm run viewer:motion` with `RA2_ORIGINAL_ASSETS` pointing to installed original
assets, then open port 4179. The 3D viewer compares authored skeletal poses against
original SHP frames; `/canvas/` displays the baked result on original terrain beside
the original unit. The model has 24 joints and 28 clips (including aliases and two water transitions), with
standing/prone/water shooting, crawl, down/up, swimming/treading, idle, death,
parachute and cheer sequences. Poses are reconstructed references, not exact
recovery of the source 3D animation. See [motion tooling](../tools/tanya-motion/README.md)
and run `npm run motion:test` for the delivered motion/mapping checks.

## 生产建筑支持集结点，战机会自动返航

玩家选中兵营、战车工厂或船坞后，可以右键设置集结点。
选中的生产建筑显示旗帜和连接线。
玩家双击生产建筑后，可以选择新单位的生产地点。
主工厂显示星号。雷达右键将视图移到对应位置。

每座机场提供四个战机名额，飞行中的战机仍占用名额。
入侵者和黑鹰发射空对地导弹，基洛夫投弹。
战机完成移动或失去目标后，会返回所属机场着陆。
战机耗尽弹药后，会返航装弹，再继续攻击。
四类超级武器和谭雅达到限额后，按钮保留并变暗。
