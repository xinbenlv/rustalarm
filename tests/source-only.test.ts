import test from 'node:test';
import assert from 'node:assert/strict';
import { forbiddenOriginalPath, forbiddenBuildPath } from '../scripts/check-source-only.ts';

test('publication guard blocks originals and their generated forms even when force-added',()=>{
  for(const path of ['public/assets/sprites/gacnst.png','public/assets/manifest.json','public/maps/catalog.json','public/maps/MP22S8.MAP','docs/screenshots/arctic-circle.png','.cache/ra2-assets/installer.exe','_3p/ra2-installer.exe','_3p/game/ra2.mix','_3p/venv/bin/python','dist/assets/index.js','backup/RA2.MIX','backup/ra2ts_l.bik','backup/menu.webm','backup/menu.mp4','fixtures/test.mpr','scripts/assets/__pycache__/mix_extract.cpython-314.pyc'])assert.equal(forbiddenOriginalPath(path),true,path);
  for(const path of ['src/maps.ts','scripts/maps/map-playability.test.ts','scripts/assets/export_assets.py','public/README.md','docs/verification.md','package-lock.json','assets/hd/models/apocalypse-tank/30k.glb','assets/hd/sprites/tany.png'])assert.equal(forbiddenOriginalPath(path),false,path);
});

test('deployment guard excludes converted media while allowing application workers and WASM',()=>{
  for(const path of ['assets/manifest.json','maps/catalog.json','app/gacnst.png','app/menu.webm','app/menu.mp4','app/hm2.wav','app/source.MIX','public/README.md','.cache/installer.exe','_3p/game/ra2.mix'])assert.equal(forbiddenBuildPath(path),true,path);
  for(const path of ['index.html','ra2-sw.js','app-shell.json','app/index-HASH.js','app/asset-worker-HASH.js','app/index-HASH.css','app/7zz-HASH.wasm','7z-wasm-LICENSE.txt','Fira-Sans-Condensed-OFL.txt','app/fira-500.woff2'])assert.equal(forbiddenBuildPath(path),false,path);
});

// Disk reuse must never enable public-directory copying in production/preview.
test('build and preview always exclude local original files', async () => {
  const { default: config } = await import('../vite.config');
  assert.equal(typeof config, 'function');
  for (const env of [{command:'build', mode:'production'}, {command:'serve', mode:'production', isPreview:true}] as const) {
    const result = await (config as import('vite').UserConfigFnPromise)(env);
    assert.equal(result.publicDir, false);
    assert.equal(result.define?.__LOCAL_ORIGINALS__, 'false');
  }
});
