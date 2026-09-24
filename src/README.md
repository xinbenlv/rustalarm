# Application source

Browser application code uses TypeScript, native Canvas and a lazy Three.js world
presenter. Hosted original assets stay in the player's browser storage; local dev can reuse verified disk output.

```text
main.ts -> asset readiness/preparation -> mode menu -> lobby/editor -> battle
  game/                deterministic simulation, data and tests
  renderer.ts          original terrain, controls, sprites, minimap and HUD
  bootcamp/            training map, verified GLBs, rotating camera and switch lifecycle
  hud/                 native faction sidebar, entry/ESC shell, commands, tooltips and options
  assets.ts            browser original-art/audio consumers
  asset-setup/worker   local download and conversion; menu-video-converter runs FFmpeg WASM
  maps/custom-*        original and portable editor maps
  map-editor*          editor UI and terrain painting
  i18n.ts / urls.ts    locale and deployment-path boundaries
  save-game.ts / save-storage.ts / save-map.ts  versioned saves, IndexedDB and restored map metadata
  save-overview.ts      saved terrain, fog and entity thumbnails
  build-info.ts         shared game version and running commit identity
```

Bootcamp and skirmish share the lobby and engine. All new production restrictions
are enforced in the engine as well as the sidebar. The optional WebGL layer changes
presentation without replacing the engine or controller. Bootcamp defaults to its
existing-asset training map in both renderers. Its 3D roads/coasts gain continuous
material detail; mineral instances shrink with actual resource depletion. See `bootcamp/README.md`.

Asset setup also detects the Vite loopback-only local installer helper. Its button
passes the local copy into the existing verified file import, with no download
fallback. Static sites retain the normal download and file picker flows.

Several existing modules (`engine.ts`, CSS and the compact main UI templates) exceed
the normal byte/line guideline. Their tightly coupled legacy state is retained for
this integration; new render lifecycle/model code is split into Bootcamp and native sidebar code into `hud/`.

`weapon-effects.ts` supplies distinct projectile and beam shapes for both views.
`combat-assets.ts` 校验支援图标、导弹和光棱塔动画。
Factories retain rally points; selected factories show a flag and connecting line.
