# Application regression tests

Node tests cover browser data contracts, original-media boundaries, maps, rendering
metadata and local developer tooling. Gameplay tests live in `src/game/`.
`src/game/behavior.test.ts` covers sorties, rally points, limits and weapon roles.
`src/game/combat-fidelity.test.ts` 验证聚光、分裂、爬升和公共计时。

```text
archive-input + browser-storage + service-worker -> original verification/cache
source-only + local-installer                    -> publication and local access
map-* + custom-* + terrain-*                     -> portable map/editor behavior
bootcamp-map + bootcamp-resources               -> shared field, asset coverage, mineral quantity/bounds

bootcamp-flat-highland                          -> continuous plateau/ramp corners without state changes
sprite-* + hd-actions + sound                    -> presentation data contracts
sidebar-layout                                  -> native footer bounds and menu/sidebar atlas completeness
sidebar-production                              -> support abilities unlock the defense tab
production-feedback                             -> production voice cues and exact aircraft docking
i18n + urls                                     -> language and base-path behavior
save-game + save-overview                       -> portable saves, build identity, visible map previews and legacy compatibility
```

Run `npm test`. Local-installer tests use synthetic sparse files and a temporary
loopback HTTP server; no original installer or remote network is needed. Real
browser flows live in `scripts/browser_*.mjs` and save evidence under ignored caches.
Readiness tests require the menu WebM in both the marker and actual cache;
publication tests reject original Bink/WebM/MP4 while allowing licensed fonts.
