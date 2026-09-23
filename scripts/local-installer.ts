/** Loopback-only Vite development/preview access to one locally cached installer. */
import {open, readdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';
import type {IncomingMessage} from 'node:http';
import type {Connect, Plugin} from 'vite';
import {SOURCE_BYTES} from '../src/browser-storage';

const installerName = 'Red-Alert-2-Multiplayer.exe';
const names = [installerName, 'ra2-installer.exe'];
export async function findLocalInstaller(roots:string[], explicit?:string):Promise<string|undefined> {
  const candidates:string[] = [];
  for (const root of roots) {
    candidates.push(...names.map(name=>path.join(root,name)));
    const cache=path.join(root,'.cache');
    candidates.push(...names.map(name=>path.join(cache,name)));
    candidates.push(...names.map(name=>path.join(root,'_3p',name)));
    // Existing converter/upload caches are one directory deep; never scan the whole disk.
    const entries=await readdir(cache,{withFileTypes:true}).catch(()=>[]);
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name)))
      if(entry.isDirectory())candidates.push(...names.map(name=>path.join(cache,entry.name,name)));
  }
  for(const filename of explicit?[path.resolve(explicit)]:candidates) {
    const info=await stat(filename).catch(()=>undefined);
    if(info?.isFile()&&info.size===SOURCE_BYTES)return filename;
  }
}

export function isLocalInstallerRequest(req:Pick<IncomingMessage,'method'|'headers'> & {socket:{remoteAddress?:string}}):boolean {
  const remote=req.socket.remoteAddress;
  if(!remote||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote))return false;
  if(req.method!=='GET'||req.headers['x-ra2-local-installer']!=='1')return false;
  if(req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin')return false;
  try {
    const host=new URL('http://'+req.headers.host);
    if(!['localhost','127.0.0.1','[::1]'].includes(host.hostname))return false;
    if(req.headers.origin) {
      const origin=new URL(req.headers.origin);
      if(!['http:','https:'].includes(origin.protocol)||origin.host!==host.host)return false;
    }
    return true;
  } catch {return false;}
}

export function localInstallerMiddleware(base:string,roots:string[],explicit?:string):Connect.NextHandleFunction {
  const endpoint=base+'__local-installer';
  return (req,res,next)=>{
    const url=req.url?.split('?')[0];
    if(url!==endpoint&&url!==endpoint+'/file'){next();return;}
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    if(!isLocalInstallerRequest(req)){res.statusCode=403;res.end('Local development only.');return;}
    void (async()=>{
      const filename=await findLocalInstaller(roots,explicit);
      if(url===endpoint) {
        res.setHeader('Content-Type','application/json');
        res.end(JSON.stringify(filename?{available:true,name:installerName,size:SOURCE_BYTES}:{available:false}));return;
      }
      if(!filename){res.statusCode=404;res.end('Local installer unavailable.');return;}
      const file=await open(filename,'r');
      const info=await file.stat();
      if(!info.isFile()||info.size!==SOURCE_BYTES){await file.close();res.statusCode=404;res.end('Local installer changed.');return;}
      res.setHeader('Content-Type','application/octet-stream');
      res.setHeader('Content-Length',info.size);
      const stream=file.createReadStream();
      stream.on('error',()=>res.destroy());
      res.on('close',()=>stream.destroy());stream.pipe(res);
    })().catch(()=>{if(!res.headersSent){res.statusCode=404;res.end('Local installer unavailable.');}else res.destroy();});
  };
}

export function localInstallerPlugin(root:string):Plugin {
  const roots=[root];
  try {
    const common=execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    if(path.basename(common)==='.git')roots.push(path.dirname(common));
  } catch { /* Source archives have no shared Git checkout. */ }
  roots.push(path.join(homedir(),'Downloads'));
  const attach=(server:{config:{base:string};middlewares:Connect.Server})=>{
    server.middlewares.use(localInstallerMiddleware(server.config.base,[...new Set(roots)],process.env.RA2_LOCAL_INSTALLER));
  };
  return {name:'local-installer',configureServer:attach,configurePreviewServer:attach};
}
