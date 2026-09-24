import { nativeUiAssets, MENU_VIDEO_PATH } from './hud/skin';
import { APP_BASE, appUrl, scopedCache } from './urls';
import { combatAssetPaths } from './combat-assets';
/** Original data is only ever written to this browser's origin-private storage. */
export const ORIGINAL_CACHE = scopedCache('ra2-originals-v2');
export const ARCHIVE_CACHE = scopedCache('ra2-download-v1');
export const ORIGINAL_VERSION = 9;
export const SOURCE_PAGE_URL = 'https://archive.org/details/red-alert-2-multiplayer';
export const SOURCE_URL = 'https://archive.org/download/red-alert-2-multiplayer/Red-Alert-2-Multiplayer.exe';
export const SOURCE_BYTES = 206530229;
export const SOURCE_SHA256 = '5388c54d7d7b73060083563ff1926bca0d2663a76678b807e23e9a8d491441ce';
export const READY_URL = '/assets/ready.json';
export interface BrowserReady { version:number; sourceSha256:string; files:string[]; installedAt:string }
export type ArchiveErrorCode = 'archive-size' | 'archive-hash';
export interface SetupProgress { type:'progress'|'complete'|'error'; stage:string; percent?:number; message?:string; errorCode?:ArchiveErrorCode }

export async function originalsReady(): Promise<boolean> {
  if (!('caches' in globalThis)) return false;
  const cache = await caches.open(ORIGINAL_CACHE);
  try {
    const marker = await cache.match(READY_URL);
    if (!marker) return false;
    const ready = await marker.json() as BrowserReady;
    if (ready.version !== ORIGINAL_VERSION || ready.sourceSha256 !== SOURCE_SHA256 || !Array.isArray(ready.files) || ready.files.length < 3000) return false;
    const paths = new Set((await cache.keys()).map(request => new URL(request.url).pathname));
    if (!combatAssetPaths.every(path => ready.files.includes(path) && paths.has(path))) return false;
    return ready.files.includes(MENU_VIDEO_PATH) && paths.has(MENU_VIDEO_PATH) && ready.files.every(file => paths.has(file)) && nativeUiAssets.every(({key}) => ready.files.includes(`/assets/ui/${key}.png`) && paths.has(`/assets/ui/${key}.png`));
  } catch { return false; }
}

export async function connectAssetStorage(): Promise<void> {
  if (!isSecureContext || !('serviceWorker' in navigator) || !('caches' in window))
    throw new Error('Browser storage requires HTTPS or localhost and a browser with Service Worker support.');
  const registration = await navigator.serviceWorker.register(appUrl('ra2-sw.js'), { scope:APP_BASE, updateViaCache:'none' });
  try { await registration.update(); }
  catch (error) { if (!registration.active) throw error; } // Reuse the installed worker offline.
  const pending = registration.installing || registration.waiting;
  if (pending && pending.state !== 'activated') await new Promise<void>((resolve,reject) => {
    const timeout = setTimeout(() => reject(new Error('Browser storage update timed out. Please reload.')),15000);
    const check = () => {
      if (pending.state === 'activated') {clearTimeout(timeout);resolve();}
      if (pending.state === 'redundant') {clearTimeout(timeout);reject(new Error('Browser storage update failed. Please reload.'));}
    };
    pending.addEventListener('statechange',check);check();
  });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller || navigator.serviceWorker.controller !== registration.active) await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Browser storage could not start. Please reload.')), 15000);
    navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timeout); resolve(); }, {once:true});
  });
}
