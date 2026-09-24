// Verified browser preparation; only complete native sidebar atlases are marked ready.
// This legacy worker exceeds 5 KB to keep the ordered cache transaction together;
// menu encoding is split into its own module.
import { convertMenuVideo } from './menu-video-converter';
import { missingNativeUiAssets } from './hud/skin';
import { missingCombatAssets } from './combat-assets';
import SevenZip from '7z-wasm';
import sevenWasm from '7z-wasm/7zz.wasm?url';
import { scopedCache } from './urls';
import { cacheLocalArchive, OriginalArchiveError, verifyOriginalArchive } from './archive-input';
import { configureMapData, importMap, listMaps } from './maps';
import { ARCHIVE_CACHE, ORIGINAL_CACHE, ORIGINAL_VERSION, READY_URL, SOURCE_BYTES, SOURCE_SHA256, SOURCE_URL, type SetupProgress } from './browser-storage';

// This is Internet Archive's own CORS endpoint. No application proxy or asset mirror.
const DOWNLOAD_URL = 'https://cors.archive.org/cors/red-alert-2-multiplayer/Red-Alert-2-Multiplayer.exe';
const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.29.4/full/pyodide.mjs';
const pythonSources = import.meta.glob('../scripts/{assets,maps}/*.{py,json}', {query:'?raw',import:'default',eager:true}) as Record<string,string>;
const notify = (stage:string,percent?:number,message?:string) => postMessage({type:'progress',stage,percent,message} satisfies SetupProgress);
const mime = (name:string) => name.endsWith('.webm')?'video/webm':name.endsWith('.png')?'image/png':name.endsWith('.wav')?'audio/wav':name.endsWith('.json')?'application/json':'text/plain';

async function getArchive():Promise<Blob> {
  const cache = await caches.open(ARCHIVE_CACHE);
  const cached = await cache.match(SOURCE_URL);
  if (cached) { notify('verify',10); return cached.blob(); }
  notify('download',0);
  const response = await fetch(DOWNLOAD_URL,{credentials:'omit',signal:AbortSignal.timeout(30*60*1000)});
  if (!response.ok || !response.body) throw new Error(`Internet Archive download failed (HTTP ${response.status}). Please retry.`);
  const reader=response.body.getReader();let received=0,last=0;
  const stream = new ReadableStream<Uint8Array>({async pull(controller) {
    const {done,value} = await reader.read();
    if(done){controller.close();return;}
    received+=value.byteLength;
    if(Date.now()-last>500){last=Date.now();notify('download',Math.min(25,received/SOURCE_BYTES*25),`${(received/1e6).toFixed(1)} / 206.5 MB`);}
    controller.enqueue(value);
  },cancel(reason){return reader.cancel(reason);}});
  try { await cache.put(SOURCE_URL,new Response(stream,{headers:{'Content-Type':'application/octet-stream'}})); }
  catch(error) { await cache.delete(SOURCE_URL);throw error; }
  return (await cache.match(SOURCE_URL))!.blob();
}

// Pyodide deliberately stays inside this worker, including its virtual filesystem.
interface PythonRuntime {
  FS:{mkdirTree(path:string):void;writeFile(path:string,data:string|Uint8Array):void;readFile(path:string,options?:{encoding:'utf8'}):any;readdir(path:string):string[];stat(path:string):{mode:number};isDir(mode:number):boolean;unlink(path:string):void};
  loadPackage(names:string[]):Promise<void>;
  runPythonAsync(code:string):Promise<any>;
}
async function install(localFile?: Blob) {
  let archive: Blob;
  if (localFile) {
    notify('verify',10);
    archive = await cacheLocalArchive(localFile, () => notify('save-archive',26));
  } else {
    archive = await getArchive(); notify('verify',26);
    try { await verifyOriginalArchive(archive); }
    catch (error) { await (await caches.open(ARCHIVE_CACHE)).delete(SOURCE_URL); throw error; }
  }
  notify('runtime',28);
  const {loadPyodide} = await import(/* @vite-ignore */ PYODIDE_URL);
  const py = await loadPyodide({indexURL:PYODIDE_URL.slice(0,PYODIDE_URL.lastIndexOf('/')+1),stdout:console.log,stderr:console.warn}) as PythonRuntime;
  await py.loadPackage(['pillow','pycryptodome','audioop-lts']);
  for(const [name,code] of Object.entries(pythonSources)) {
    const target='/project/'+name.replace(/^\.\.\//,'');
    py.FS.mkdirTree(target.slice(0,target.lastIndexOf('/')));py.FS.writeFile(target,code);
  }
  py.FS.mkdirTree('/cache/game');notify('extract',32);
  const zip = await SevenZip({locateFile:()=>sevenWasm,print:console.log,printErr:console.warn});
  zip.FS.mkdir('/input');zip.FS.mkdir('/output');
  zip.FS.mount(zip.WORKERFS,{blobs:[{name:'original.exe',data:archive}]},'/input');
  // Exact allowlist: no executable code is extracted or executed.
  zip.callMain(['x','/input/original.exe','-o/output','-y','-bso0','-bsp0','ra2.mix','language.mix','multi.mix','theme.mix']);
  for(const name of ['ra2.mix','language.mix','multi.mix','theme.mix']) {
    const data=zip.FS.readFile('/output/'+name);py.FS.writeFile('/cache/game/'+name,data);zip.FS.unlink('/output/'+name);
  }
  zip.FS.unmount('/input');archive=new Blob();
  await py.runPythonAsync("import os, sys\nos.environ['RA2_ASSET_CACHE']='/cache'\nos.environ['RA2_PUBLIC_DIR']='/public'\nsys.path.insert(0,'/project/scripts/assets')\nimport browser_bootstrap as browser\n");
  const stages=['extract','maps','sprites','voxels','audio','infantry','overlays','sidebar','terrain','scenery'];
  for(let i=0;i<stages.length;i++){
    notify(stages[i]!,35+i*5);await py.runPythonAsync(`browser.run_browser_stage('${stages[i]}')`);
    const disposable:Record<string,string>={extract:'ra2.mix',maps:'multi.mix',sprites:'language.mix',audio:'theme.mix'};
    if(disposable[stages[i]!])py.FS.unlink('/cache/game/'+disposable[stages[i]!]);
  }
  notify('video',84);
  const rawVideo='/public/assets/ui/ra2ts_l.bik';
  py.FS.writeFile('/public/assets/ui/ra2ts_l.webm',await convertMenuVideo(py.FS.readFile(rawVideo),progress=>notify('video',84+progress*2)));
  py.FS.unlink(rawVideo);
  notify('previews',86);
  const json=(name:string)=>JSON.parse(py.FS.readFile('/public/maps/'+name,{encoding:'utf8'}));
  configureMapData({catalog:json('catalog.json'),terrain:json('terrain.json'),overlays:json('overlays.json')});
  const cache=await caches.open(ORIGINAL_CACHE);await cache.delete(READY_URL);
  const files:string[]=[];
  for(const definition of listMaps()) {
    const map=importMap(py.FS.readFile('/public/maps/'+definition.filename,{encoding:'utf8'}),definition.filename,definition);
    if(!map.previewData)throw new Error(`Original preview missing: ${definition.filename}`);
    const {width,height,rgb}=map.previewData,canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d')!;
    const pixels=ctx.createImageData(width,height);
    for(let i=0;i<width*height;i++){pixels.data[i*4]=rgb[i*3]!;pixels.data[i*4+1]=rgb[i*3+1]!;pixels.data[i*4+2]=rgb[i*3+2]!;pixels.data[i*4+3]=255;}
    ctx.putImageData(pixels,0,0);const url=`/maps/previews/${definition.id}.png`;
    await cache.put(url,new Response(await canvas.convertToBlob({type:'image/png'})));files.push(url);
  }
  notify('storage',90);
  const paths:string[]=[];
  function walk(root:string){for(const name of py.FS.readdir(root)){if(name==='.'||name==='..')continue;const path=root+'/'+name;if(py.FS.isDir(py.FS.stat(path).mode))walk(path);else paths.push(path);}}
  walk('/public');
  for(let i=0;i<paths.length;i++) {
    const path=paths[i]!,url=path.slice('/public'.length),bytes=py.FS.readFile(path) as Uint8Array;
    await cache.put(url,new Response(new Blob([bytes as BlobPart],{type:mime(path)})));files.push(url);py.FS.unlink(path);
    if(i%100===0)notify('storage',90+i/paths.length*9);
  }
  const keys = new Set((await cache.keys()).map(request=>new URL(request.url).pathname));
  const required=new Set(files);
  const collect=(value:unknown):void=>{if(typeof value==='string' && /^\/(?:assets|maps)\//.test(value))required.add(value);else if(Array.isArray(value))value.forEach(collect);else if(value && typeof value==='object')Object.values(value).forEach(collect);};
  for(const file of ['/assets/manifest.json','/assets/terrain/manifest-tiles.json','/assets/scenery/manifest-scenery.json','/maps/catalog.json']){const response=await cache.match(file);if(!response)throw new Error('Missing original metadata: '+file);collect(await response.json());}
  const manifest=await (await cache.match('/assets/manifest.json'))!.json();
  if(missingNativeUiAssets(manifest.ui || {}).length)throw new Error('UI conversion is incomplete. Please retry.');
  if(missingCombatAssets(manifest).length)throw new Error('Combat asset conversion is incomplete. Please retry.');
  for(const map of listMaps())required.add('/maps/'+map.filename);
  if(files.length<3000 || ![...required].every(file=>keys.has(file)))throw new Error('Browser storage verification failed. Please retry.');
  await cache.put(READY_URL,Response.json({version:ORIGINAL_VERSION,sourceSha256:SOURCE_SHA256,files,installedAt:new Date().toISOString()}));
  postMessage({type:'complete',stage:'complete',percent:100} satisfies SetupProgress);
}
let running=false;
self.onmessage=event=>{
  if(event.data?.type!=='install'||running)return;running=true;
  const run=()=>install(event.data.file instanceof Blob ? event.data.file : undefined);
  // A second tab cannot overwrite an installation already in progress.
  const task = navigator.locks ? navigator.locks.request(scopedCache('ra2-original-setup'),{ifAvailable:true},lock=>{
    if(!lock)throw new Error('Another tab is preparing original assets. Wait for it to finish, then reload this tab.');return run();
  }):run();
  void task.catch(error=>postMessage({type:'error',stage:'error',message:error instanceof Error?error.message:String(error),errorCode:error instanceof OriginalArchiveError?error.code:undefined} satisfies SetupProgress)).finally(()=>{running=false;});
};
