/** Local reuse must discover only installer candidates and never expose files to remote sites. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, mkdir, open, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {findLocalInstaller, isLocalInstallerRequest, localInstallerMiddleware} from '../scripts/local-installer';
import {SOURCE_BYTES} from '../src/browser-storage';

async function fixture() {
  const root=await mkdtemp(path.join(tmpdir(),'ra2-local-installer-'));
  const directory=path.join(root,'.cache','manual-upload');await mkdir(directory,{recursive:true});
  const filename=path.join(directory,'Red-Alert-2-Multiplayer.exe');
  const file=await open(filename,'w');await file.write('MZ synthetic test installer');await file.truncate(SOURCE_BYTES);await file.close();
  return {root,filename};
}

test('local detection finds a shared checkout cache, checks size and honors an explicit path',async t=>{
  const {root,filename}=await fixture();t.after(()=>rm(root,{recursive:true,force:true}));
  const worktree=path.join(root,'worktree');await mkdir(worktree);
  assert.equal(await findLocalInstaller([worktree,root]),filename);
  assert.equal(await findLocalInstaller([worktree]),undefined);
  assert.equal(await findLocalInstaller([worktree],filename),filename);
  assert.equal(await findLocalInstaller([root],path.join(root,'missing.exe')),undefined,'an unavailable override never silently selects another file');
  await writeFile(filename,'incomplete');
  assert.equal(await findLocalInstaller([root]),undefined,'partial installers do not advertise a ready local copy');
  await rm(filename);await mkdir(filename);
  assert.equal(await findLocalInstaller([root]),undefined,'a directory is never an installer');
  const archive=path.join(root,'_3p','ra2-installer.exe');await mkdir(path.dirname(archive));
  const local=await open(archive,'w');await local.truncate(SOURCE_BYTES);await local.close();
  assert.equal(await findLocalInstaller([root]),archive,'the ignored _3p installer is reusable');
});

test('local access rejects remote sockets, foreign origins, host rebinding and ordinary link requests',()=>{
  const req=(headers:Record<string,string>={},remoteAddress='127.0.0.1',method='GET')=>({method,socket:{remoteAddress},headers:{host:'localhost:4208','x-ra2-local-installer':'1',...headers}});
  assert.equal(isLocalInstallerRequest(req()),true);
  assert.equal(isLocalInstallerRequest(req({origin:'http://localhost:4208','sec-fetch-site':'same-origin'},'::1')),true);
  for(const request of [req({},'192.168.1.2'),req({host:'external.example'}),req({origin:'https://external.example'}),req({origin:'http://localhost:4209'}),req({'x-ra2-local-installer':''}),req({'sec-fetch-site':'cross-site'}),req({},'127.0.0.1','POST')])
    assert.equal(isLocalInstallerRequest(request),false);
});

for(const base of ['/','/ra2-bootcamp/'])test(`local HTTP detection and explicit file streaming at ${base}`,async t=>{
  const {root,filename}=await fixture();
  const middleware=localInstallerMiddleware(base,[root]);
  const server=createServer((req,res)=>middleware(req,res,()=>{res.statusCode=404;res.end();}));
  t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const endpoint=`http://127.0.0.1:${address.port}${base}__local-installer`,headers={'X-RA2-Local-Installer':'1'};
  const metadata=await fetch(endpoint,{headers});
  assert.equal(metadata.headers.get('cache-control'),'no-store');
  assert.equal(metadata.headers.get('access-control-allow-origin'),null);
  assert.deepEqual(await metadata.json(),{available:true,name:'Red-Alert-2-Multiplayer.exe',size:SOURCE_BYTES});
  assert.equal((await fetch(endpoint)).status,403);
  assert.equal((await fetch(endpoint+'/file',{headers:{...headers,Origin:'https://external.example'}})).status,403);
  assert.equal((await fetch(endpoint+'/other.exe',{headers})).status,404);
  const response=await fetch(endpoint+'/file',{headers});assert.equal(response.status,200);
  assert.equal(Number(response.headers.get('content-length')),SOURCE_BYTES);
  const reader=response.body!.getReader(),first=await reader.read();
  assert.equal(new TextDecoder().decode(first.value).slice(0,2),'MZ');await reader.cancel();
  await rm(filename);
  assert.deepEqual(await (await fetch(endpoint,{headers})).json(),{available:false});
  assert.equal((await fetch(endpoint+'/file',{headers})).status,404,'a removed file fails explicitly instead of downloading');
});
