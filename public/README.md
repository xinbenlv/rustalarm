# Browser storage and local developer output

`ra2-sw.js` is application source: the build emits it explicitly. Vite's normal public-directory copying is disabled so original game data never enters a hosted build.

The normal first-run flow downloads original resources directly from Internet Archive after the player's consent, converts them in a Web Worker, and saves them in browser CacheStorage. The service worker answers `/assets/` and `/maps/` requests from that storage; it does not fetch originals from the application host.

The `assets/` and `maps/` directories that may exist here are optional output from the offline developer command `npm run assets:setup`. Their original images, audio, maps, palettes and derived metadata are ignored by Git and excluded from builds. Local `npm run dev` validates and serves a complete set directly from this checkout or the shared main checkout, bypassing browser conversion. `RA2_PUBLIC_DIR` can point to another prepared public directory; `RA2_DEV_ASSETS=browser` disables this shortcut. They are not copied into browser storage. Production and preview retain the browser-only flow. Do not force-add them or include them in source releases.

Readiness requires complete native sidebar/command frames, the menu rail and the
original menu WebM. Older disk output can use `--sidebar-only`; browser schema 7 reparses the
verified cached installer. Both paths retain the original-media publication boundary.

旧机场素材缺少停机坪地面层。本地开发者可以运行
`npm run assets:setup -- --sprites-only` 更新建筑图层。
同一命令也更新支援图标、原版导弹和光棱塔充能动画。
