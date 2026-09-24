# Original Red Alert 2 asset conversion

Project-owned decoders run in Pyodide for players or native Python for developer
tooling. Both extract data; neither runs the Windows installer. Originals and
converted media stay outside Git and static builds.

```text
src/asset-setup.ts -> asset-worker.ts -> browser_bootstrap.py
                                      -> export_*.py / format decoders
scripts/setup-assets.ts               -> same decoders in native Python
scripts/local-installer.ts            -> local Vite copy -> browser file import
```

## Browser preparation

Download from [Internet Archive](https://archive.org/details/red-alert-2-multiplayer),
select/drop a local file, or use a detected developer copy. Only the pinned
`Red-Alert-2-Multiplayer.exe` is accepted: 206,530,229 bytes, SHA-256
`5388c54d7d7b73060083563ff1926bca0d2663a76678b807e23e9a8d491441ce`.
A rejected file never replaces a verified cached installer or triggers a download.

1. Verify the installer in a worker and cache it in browser-private storage.
2. Mount it with `7z-wasm` WORKERFS; extract only the four required MIX archives.
3. Load Pyodide, Pillow, PyCryptodome and audioop-lts from the runtime CDN.
4. Run the shared Python stages for maps, sprites, voxels, sound and terrain.
5. Convert the menu Bink with FFmpeg WASM, encode previews and verify cached outputs.
6. Write the readiness marker last. Reload; the service worker serves originals
   from browser storage, including offline. Clearing site data removes this cache.

The published site never hosts or proxies originals. Conversion needs HTTPS or
localhost, about 500 MB of browser storage and substantial temporary memory. First
use can still fetch conversion tools from their CDN. Installer retries can reuse
browser cache. See [format reference](format-reference.md) for output fields,
upstream format documentation and native-pipeline validation.

## Local developer copy

`npm run dev` and `npm run preview` expose a loopback-only helper. The preparation
page shows **Use local Red-Alert-2-Multiplayer.exe** when it finds a full-size copy
in the current/shared Git checkout, their `.cache` directory or one of its immediate
subdirectories, or Downloads. The existing CLI cache name `ra2-installer.exe` also
works. Set `RA2_LOCAL_INSTALLER=/absolute/path/to/file.exe` to select another copy.

Discovery returns only availability, public filename and byte count. Clicking the
button reads that file over localhost and passes it to the same SHA-256-verified
file import. It never downloads an installer on failure. Requests require a local
socket, loopback Host and same-origin custom header; foreign origins are rejected.
No endpoint or original file is emitted into static deployment output. Developer
extracts in `public/` remain separate from browser storage.

## Native developer pipeline

```sh
npm ci
npm run assets:setup
npm run assets:check
```

Requires Python 3.10+, 7-Zip (`7zz`/`7z`) and FFmpeg with MP3/libvpx support. Python packages
are pinned in a cache-local virtual environment. Default cache: ignored `_3p/`;
outputs: `public/assets/` and `public/maps/`. `RA2_ASSET_CACHE` and `RA2_PUBLIC_DIR`
override these paths. `--force` reconstructs; `--check` validates without download.
Outputs are checked in staging; the readiness marker is published last.
The clone setup prompt runs `npm ci` and this native pipeline after consent.

## Browser archive probe

```sh
node scripts/probe-browser-archive.mjs /path/to/Red-Alert-2-Multiplayer.exe
```

With Playwright installed, this probe checks CORS and reads four MIX archives in a
WASM worker. Its local fixture avoids another archive download; it does not verify
the full preparation flow. `scripts/browser_local_installer.mjs` covers local-copy
preparation and actual gameplay; evidence remains under ignored `.cache/`.

## Runtime attribution

[7z-wasm 1.2.0](https://github.com/use-strict/7z-wasm) contains Igor Pavlov's 7-Zip,
under LGPL 2.1-or-later and the unRAR restriction; its package includes licenses and
source/build references. [Pyodide](https://pyodide.org/) and its packages retain
their respective licenses. Original game media belongs to Westwood Studios / EA.
Menu conversion uses [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm),
wrapper 0.12.15 and single-thread core 0.12.10 downloaded from jsDelivr.

## Interface upgrades

`sidebar-assets.json` lists all 27 required SHPs per faction and their frame counts.
`export_sidebar.py` preserves full native atlases, including all 55 clock frames.
TypeScript readiness checks consume the same contract. With complete older disk
output and extracted converter cache, `npm run assets:setup -- --sidebar-only`
updates just the UI; see [sidebar verification](../../docs/sidebar-verification.md).
`menu-assets.json` adds dialog, button, checkbox and mechanical menu-rail art. The same
upgrade refreshes these assets with their original palettes.
`export_menu_video.py` extracts `ra2ts_l.bik` and records the separate `menuVideo`
manifest entry. Native FFmpeg or the browser worker encodes a muted VP8 WebM;
the temporary Bink is deleted before outputs are stored. `RA2_FFMPEG` overrides
the native executable. The video remains local original media, excluded from builds.
浏览器素材版本 9 要求建筑部件、支援图标和导弹。
`prism_animation.py` 合成光棱塔的待机和充能帧。
浏览器复用已验证的安装包重新转换素材。
本地开发者可以运行 `npm run assets:setup -- --sprites-only`。
素材命令复用已提取的文件，更新建筑图层和停机坪锚点。
`building_turrets.py` 合成 32 个方向的炮塔和炮管。
转换器保留静止 `SuperAnim`，不叠加互斥的充能状态。
