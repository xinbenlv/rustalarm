/** Download and convert original RA2 data. The Windows installer is never run. */
import { missingNativeUiAssets, MENU_VIDEO_PATH } from '../src/hud/skin';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { configureMapData } from '../src/maps';

export const SOURCE_URL = 'https://archive.org/download/red-alert-2-multiplayer/Red-Alert-2-Multiplayer.exe';
export const SOURCE_SHA256 = '5388c54d7d7b73060083563ff1926bca0d2663a76678b807e23e9a8d491441ce';
export const SOURCE_BYTES = 206530229;
export const ASSET_VERSION = 1;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configuredPath = (key: string, fallback: string): string => path.resolve(projectRoot, process.env[key] || fallback);
const publicDirectory = (): string => configuredPath('RA2_PUBLIC_DIR', 'public');
const cacheDirectory = (): string => configuredPath('RA2_ASSET_CACHE', '_3p');

export interface AssetReadiness {
  ready: boolean;
  missing: string[];
  files: number;
  maps: number;
}

/** Validate metadata and every referenced image, native map and sound; no mutations. */
export async function checkAssetsReady(publicDir = publicDirectory(), requireSidebar = true): Promise<AssetReadiness> {
  const missing: string[] = [];
  const files = new Set<string>(requireSidebar?[MENU_VIDEO_PATH.slice(1)]:[]);
  const documents = new Map<string, unknown>();
  const required = ['assets/manifest.json', 'assets/terrain/manifest-tiles.json',
    'assets/scenery/manifest-scenery.json', 'maps/catalog.json', 'maps/terrain.json',
    'maps/overlays.json', 'maps/provenance.json'];
  for (const name of required) {
    files.add(name);
    try { documents.set(name, JSON.parse(await fs.readFile(path.join(publicDir, name), 'utf8'))); }
    catch { missing.push(name); }
  }
  const record = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const manifest = record(documents.get('assets/manifest.json'));
  for (const [key, minimum] of [['sprites', 130], ['cameos', 130], ['ui', 47], ['sounds', 1375], ['music', 3], ['overlays', 978]] as const) {
    if (Object.keys(record(manifest[key])).length < minimum) missing.push(`assets/manifest.json:${key} (expected at least ${minimum})`);
  }
  if (requireSidebar) for (const key of missingNativeUiAssets(record(manifest.ui))) missing.push(`assets/manifest.json:ui.${key}`);
  if (record(manifest.source).sha256 !== SOURCE_SHA256) missing.push('assets/manifest.json:source.sha256');
  const sprites = record(manifest.sprites);
  for (const name of ['fv-turret0', 'fv-turret1', 'fv-turret2', 'fv-turret3']) {
    if (record(sprites[name]).frames !== 32) missing.push(`assets/manifest.json:sprites.${name}`);
  }
  for (const name of ['gi', 'cons', 'engineer', 'tany']) {
    if (Number(record(sprites[name]).frames) <= 80) missing.push(`assets/manifest.json:sprites.${name} complete infantry frames`);
  }
  try { configureMapData({catalog:documents.get('maps/catalog.json'),terrain:documents.get('maps/terrain.json'),overlays:documents.get('maps/overlays.json')}); }
  catch { missing.push('maps metadata schema is invalid'); }
  const catalog = documents.get('maps/catalog.json');
  const maps = Array.isArray(catalog) ? catalog : [];
  if (maps.length < 83) missing.push('maps/catalog.json (expected 83 original maps)');
  if (!maps.some(value => record(value).id === 'mp22s8')) missing.push('maps/catalog.json:mp22s8 (Arctic Circle)');
  for (const value of maps) {
    const entry = record(value), filename = entry.filename;
    if (typeof filename !== 'string' || !/^[a-z0-9_-]+\.map$/i.test(filename)) missing.push('maps/catalog.json:invalid filename');
    else files.add(`maps/${filename}`);
  }
  const nativeSources = record(documents.get('maps/provenance.json')).files;
  if (Array.isArray(nativeSources)) for (const value of nativeSources) {
    const filename = record(value).file;
    if (typeof filename === 'string' && /^[a-z0-9_-]+\.map$/i.test(filename)) files.add(`maps/${filename}`);
  }
  if (Object.keys(record(documents.get('assets/terrain/manifest-tiles.json'))).length < 8434) missing.push('assets/terrain/manifest-tiles.json (expected 8434 tile frames)');
  if (Object.keys(record(documents.get('assets/scenery/manifest-scenery.json'))).length < 497) missing.push('assets/scenery/manifest-scenery.json (expected 497 scenery sprites)');
  const collect = (value: unknown): void => {
    if (typeof value === 'string' && /^\/(?:assets|maps)\//.test(value)) {
      const relative = value.slice(1);
      if (relative.includes('..') || relative.includes('\\') || relative.includes('\0')) missing.push(`unsafe asset path: ${relative}`);
      else files.add(relative);
    } else if (Array.isArray(value)) value.forEach(collect);
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(collect);
  };
  documents.forEach(collect);
  // Older local installations predate ready.json; accept them only after the same
  // complete scan. The installer adds their readiness marker without downloading.
  try {
    const ready = JSON.parse(await fs.readFile(path.join(publicDir, 'assets/ready.json'), 'utf8'));
    if (ready.version !== ASSET_VERSION || ready.sourceSha256 !== SOURCE_SHA256) missing.push('assets/ready.json:version/sourceSha256');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') missing.push('assets/ready.json');
  }
  await Promise.all([...files].map(async name => {
    try { if (!(await fs.stat(path.join(publicDir, name))).size) missing.push(name); }
    catch { missing.push(name); }
  }));
  return { ready: missing.length === 0, missing: [...new Set(missing)].sort(), files: files.size, maps: maps.length };
}

function progress(stage: string, message: string, percent?: number): void {
  console.log(`RA2_ASSETS_PROGRESS ${JSON.stringify({ stage, message, ...(percent === undefined ? {} : { percent }) })}`);
}

async function run(command: string, args: string[], env = process.env): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} failed (${signal || code}). See the converter output above.`)));
  });
}

function available(commands: string[], args: string[]): string | undefined {
  return commands.find(command => {
    const result = spawnSync(command, args, { stdio: 'ignore' });
    return !result.error && result.status === 0;
  });
}

async function sha256(filename: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function downloadInstaller(cache: string): Promise<string> {
  const target = path.join(cache, 'ra2-installer.exe');
  try {
    if (await sha256(target) === SOURCE_SHA256) {
      progress('download', '原版安装包校验通过，使用本地缓存。', 100);
      return target;
    }
    progress('download', '本地安装包校验不匹配，重新下载原版素材。');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const explicit = process.env.RA2_LOCAL_INSTALLER;
  const candidates = explicit ? [path.resolve(explicit)] : [
    path.join(cache, 'Red-Alert-2-Multiplayer.exe'),
    path.join(projectRoot, '.cache/ra2-assets/ra2-installer.exe'),
    path.join(homedir(), 'Downloads/Red-Alert-2-Multiplayer.exe'),
  ];
  for (const candidate of candidates) {
    const info = await fs.stat(candidate).catch(() => undefined);
    if (info?.isFile() && info.size === SOURCE_BYTES && await sha256(candidate) === SOURCE_SHA256) {
      const partial = target + '.part';
      try {
        await fs.copyFile(candidate, partial);
        await fs.rename(partial, target);
      } catch (error) {
        await fs.rm(partial, { force: true });
        throw error;
      }
      progress('download', '已校验并复用本地安装包，无需重新下载。', 100);
      return target;
    }
    if (explicit) throw new Error(`RA2_LOCAL_INSTALLER does not match the expected installer: ${candidate}`);
  }
  progress('download', '正在从 Internet Archive 下载原版素材（约 207 MB）。', 0);
  const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(30 * 60 * 1000) });
  if (!response.ok || !response.body) throw new Error(`Internet Archive download failed: HTTP ${response.status}. Retry npm run assets:setup when the archive is reachable.`);
  const total = Number(response.headers.get('content-length')) || SOURCE_BYTES;
  let received = 0, lastUpdate = 0;
  const counter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    received += chunk.length;
    if (Date.now() - lastUpdate > 1000) {
      lastUpdate = Date.now();
      progress('download', `已下载 ${(received / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`, Math.min(99, Math.floor(received / total * 100)));
    }
    callback(null, chunk);
  } });
  const partial = target + '.part';
  try {
    await pipeline(Readable.fromWeb(response.body as never), counter, createWriteStream(partial));
    const digest = await sha256(partial);
    if (digest !== SOURCE_SHA256) throw new Error(`Original installer SHA-256 mismatch. Expected ${SOURCE_SHA256}, received ${digest}. Nothing was extracted.`);
    await fs.rename(partial, target);
  } catch (error) {
    await fs.rm(partial, { force: true });
    throw error;
  }
  progress('download', '原版素材下载完成，SHA-256 校验通过。', 100);
  return target;
}

async function writeReady(publicDir: string, checked: AssetReadiness): Promise<void> {
  const ready = { version: ASSET_VERSION, sourceUrl: SOURCE_URL, sourceSha256: SOURCE_SHA256,
    files: checked.files, maps: checked.maps, installedAt: new Date().toISOString() };
  const target = path.join(publicDir, 'assets/ready.json');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target + '.tmp', JSON.stringify(ready, null, 2) + '\n');
  await fs.rename(target + '.tmp', target);
}

async function install(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  for (const arg of args) if (!['--check', '--force', '--help', '--sidebar-only'].includes(arg)) throw new Error(`Unknown argument: ${arg}. Use --check, --force, --sidebar-only, or --help.`);
  if (args.has('--help')) {
    console.log('Usage: npm run assets:setup [-- --force | --sidebar-only]\n       npm run assets:check\n\nDownloads the verified original archive and converts it locally without running Windows executables.\nRequires Python 3.10+, 7zz (or 7z), FFmpeg; uv is optional.\nOverrides: RA2_ASSET_CACHE, RA2_PUBLIC_DIR, RA2_PYTHON, RA2_7ZIP, RA2_FFMPEG.');
    return;
  }
  const destination = publicDirectory();
  if (!args.has('--check')) await fs.mkdir(cacheDirectory(), { recursive: true });
  if (args.has('--sidebar-only')) {
    const base = await checkAssetsReady(destination, false);
    if (!base.ready) throw new Error('Sidebar-only upgrade needs complete existing originals. Run the full setup first.');
    const cache = cacheDirectory();
    const python = process.env.RA2_PYTHON || path.join(cache, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    await run(python, ['scripts/assets/export_sidebar.py'], {...process.env, RA2_ASSET_CACHE:cache, RA2_PUBLIC_DIR:destination});
    const upgraded = await checkAssetsReady(destination);
    if (!upgraded.ready) throw new Error(`Sidebar upgrade is incomplete: ${upgraded.missing.join(', ')}`);
    await writeReady(destination, upgraded);
    progress('complete', 'Original sidebar upgraded; existing maps, sprites and sound retained.', 100);
    return;
  }
  const checked = await checkAssetsReady(destination);
  if (args.has('--check')) {
    console.log(JSON.stringify(checked));
    process.exitCode = checked.ready ? 0 : 1;
    return;
  }
  if (checked.ready && !args.has('--force')) {
    await writeReady(destination, checked);
    progress('complete', `原版素材已就绪：${checked.maps} 张地图，${checked.files} 个文件。`, 100);
    return;
  }
  progress('dependencies', '检查本地素材转换工具。');
  const sevenZip = available([process.env.RA2_7ZIP || '', '7zz', '7z'].filter(Boolean), ['i']);
  const ffmpeg = available([process.env.RA2_FFMPEG || '', 'ffmpeg'].filter(Boolean), ['-version']);
  const python = available([process.env.RA2_PYTHON || '', 'python3', 'python'].filter(Boolean), ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)']);
  const uv = available(['uv'], ['--version']);
  if (!sevenZip || !ffmpeg || !python) {
    const missing = [!sevenZip && '7-Zip (7zz/7z)', !ffmpeg && 'FFmpeg', !python && 'Python 3.10+'].filter(Boolean).join(', ');
    throw new Error(`Missing required tools: ${missing}.\nmacOS: brew install sevenzip ffmpeg python uv\nDebian/Ubuntu: sudo apt install 7zip ffmpeg python3 python3-venv\nWindows: install Python, FFmpeg and 7-Zip, then add their executable folders to PATH (or set RA2_PYTHON, RA2_FFMPEG, RA2_7ZIP).\nThen retry npm run assets:setup.`);
  }
  const cache = cacheDirectory();
  await fs.mkdir(cache, { recursive: true });
  const lockPath = path.join(cache, 'setup.lock');
  let lock;
  try { lock = await fs.open(lockPath, 'wx'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    throw new Error(`Another asset setup may be using ${cache}. Wait for it to finish. If a previous setup was interrupted, remove ${lockPath} and retry.`);
  }
  await lock.writeFile(String(process.pid));
  try {
    const venv = path.join(cache, 'venv');
    const pythonEnv = path.join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    const env = { ...process.env, RA2_ASSET_CACHE: cache, RA2_PUBLIC_DIR: path.join(cache, 'staging'),
      RA2_FFMPEG: ffmpeg, PYTHONUNBUFFERED: '1', UV_CACHE_DIR: path.join(cache, 'uv-cache'),
      PIP_CACHE_DIR: path.join(cache, 'pip-cache') };
    try { await fs.access(pythonEnv); }
    catch {
      if (uv) await run(uv, ['venv', '--python', python, venv], env);
      else await run(python, ['-m', 'venv', venv], env);
    }
    const dependencies = ['Pillow==11.3.0', 'pycryptodome==3.23.0'];
    if (uv) await run(uv, ['pip', 'install', '--python', pythonEnv, ...dependencies], env);
    else await run(pythonEnv, ['-m', 'pip', 'install', ...dependencies], env);
    const installer = await downloadInstaller(cache);
    progress('extract', '解包原版素材；不会运行 Windows 安装程序。');
    await run(sevenZip, ['x', '-y', '-bso0', `-o${path.join(cache, 'game')}`, installer], env);
    await run(pythonEnv, ['scripts/assets/bootstrap.py'], env);
    await fs.rm(env.RA2_PUBLIC_DIR, { recursive: true, force: true });
    await fs.mkdir(env.RA2_PUBLIC_DIR, { recursive: true });
    const stages: Array<[string, string, string]> = [
      ['maps', '提取原版遭遇战地图与地形数据。', 'scripts/maps/extract_original_maps.py'],
      ['sprites', '转换原版建筑、单位、图标素材。', 'scripts/assets/export_assets.py'],
      ['voxels', '将原版车辆、舰船与飞机转换为 32 方向精灵。', 'scripts/assets/export_voxels.py'],
      ['audio', '转换原版语音、音效和音乐。', 'scripts/assets/export_audio.py'],
      ['infantry', '转换全部步兵动画和建筑图层。', 'scripts/assets/complete_sprites.py'],
      ['overlays', '转换矿石、桥梁、树木与围墙。', 'scripts/assets/export_overlays.py'],
      ['sidebar', '转换原版阵营侧栏、菜单与鼠标指针。', 'scripts/assets/export_sidebar.py'],
      ['terrain', '转换原版雪地、温带与城市地形。', 'scripts/maps/export_terrain.py'],
      ['scenery', '转换遭遇战地图中的原版建筑与景物。', 'scripts/maps/export_scenery.py'],
    ];
    for (const [stage, message, script] of stages) {
      progress(stage, message);
      await run(pythonEnv, [script], env);
    }
    progress('previews', '解码原版地图预览图。');
    await run(process.execPath, ['--import', 'tsx', 'scripts/maps/build_previews.ts'], env);
    progress('verify', '验证全部图像、声音和原生地图文件。');
    const rebuilt = await checkAssetsReady(env.RA2_PUBLIC_DIR);
    if (!rebuilt.ready) throw new Error(`Asset conversion is incomplete:\n${rebuilt.missing.join('\n')}`);
    // Publish complete trees only; old working assets remain intact throughout conversion.
    await fs.mkdir(destination, { recursive: true });
    for (const directory of ['assets', 'maps']) await fs.cp(path.join(env.RA2_PUBLIC_DIR, directory), path.join(destination, directory), { recursive: true, force: true });
    await writeReady(destination, rebuilt);
    progress('complete', `原版素材已就绪：${rebuilt.maps} 张地图，${rebuilt.files} 个文件。`, 100);
  } finally {
    await lock.close();
    await fs.rm(lockPath, { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  install().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    progress('error', message);
    console.error(message);
    process.exitCode = 1;
  });
}
