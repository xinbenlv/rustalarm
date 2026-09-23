import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Reject raw originals and generated original-media derivatives, even if force-added. */
export function forbiddenOriginalPath(path:string):boolean {
  const name=path.replaceAll('\\','/').toLowerCase();
  return /^(public\/(assets|maps)|docs\/screenshots|\.cache|_3p|dist|node_modules)(\/|$)/.test(name)
    || /\.(mix|map|mpr|shp|vxl|hva|pal|bag|idx|exe|iso|bik|webm|mp4|pyc|pyo)$/.test(name)
    || /(^|\/)__pycache__\//.test(name);
}
/** A deployable bundle contains code and WASM, never original-media output. */
export function forbiddenBuildPath(path:string):boolean {
  const name=path.replaceAll('\\','/').toLowerCase();
  return /^(assets|maps|docs\/screenshots|public|\.cache|_3p)(\/|$)/.test(name)
    || /\.(mix|map|mpr|shp|vxl|hva|pal|bag|idx|exe|iso|bik|webm|mp4|png|jpg|jpeg|gif|webp|wav|mp3|ogg|flac)$/.test(name);
}
function main(){
  if(process.argv.includes('--build')){
    const root=resolve('dist'),files:string[]=[];
    const walk=(directory:string)=>{for(const entry of readdirSync(directory,{withFileTypes:true})){const filename=join(directory,entry.name);if(entry.isDirectory())walk(filename);else files.push(relative(root,filename));}};
    try{walk(root);}catch(error){process.stderr.write(`Cannot inspect production build: ${error instanceof Error?error.message:String(error)}\nRun npm run build first.\n`);process.exitCode=1;return;}
    const forbidden=files.filter(forbiddenBuildPath);
    if(forbidden.length){process.stderr.write('Original game material must not be hosted in the application build:\n'+forbidden.map(file=>'  '+file).join('\n')+'\n');process.exitCode=1;}
    else if(!files.includes('index.html')||!files.includes('ra2-sw.js')){process.stderr.write('Production build is missing the application HTML or browser-storage service worker.\n');process.exitCode=1;}
    else console.log(`Source-only build check passed: ${files.length} application files, no original media or maps.`);
    return;
  }
  const staged=process.argv.includes('--staged');
  const result=spawnSync('git',staged?['diff','--cached','--name-only','--diff-filter=ACMR','-z']:['ls-files','-z'],{encoding:'utf8'});
  if(result.status!==0){process.stderr.write(result.stderr||'无法读取 Git 文件列表。\n');process.exitCode=1;return;}
  const forbidden=result.stdout.split('\0').filter(Boolean).filter(forbiddenOriginalPath);
  if(forbidden.length){process.stderr.write('原版提取素材及其直接转换资源不能提交：\n'+forbidden.map(p=>'  '+p).join('\n')+'\n请从暂存区移除这些文件；保留本机副本。\n');process.exitCode=1;}
  else console.log('Source-only check passed: no original assets, maps, screenshots, or caches in Git.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main();
