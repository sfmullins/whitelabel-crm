import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const frontendRoot=path.join(root,'frontend');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'wi12-proxy-smoke-'));
const {configureRuntimePaths}=require('../backend/dist/config/runtimePaths.js');
const {openDatabase,closeDatabase,getSqliteConnection}=require('../backend/dist/infrastructure/database/connection.js');
const {runMigrations}=require('../backend/dist/infrastructure/database/migrate.js');
const {runSeed}=require('../backend/dist/infrastructure/database/seed.js');
const {startServer}=require('../backend/dist/server.js');

configureRuntimePaths({dataDirectory:temp,databasePath:path.join(temp,'crm.sqlite'),internalBackupDirectory:path.join(temp,'backups'),temporaryDirectory:path.join(temp,'tmp'),logDirectory:path.join(temp,'logs'),documentDirectory:path.join(temp,'documents')});
const database=openDatabase(path.join(temp,'crm.sqlite'));
runMigrations(database,path.join(root,'backend','drizzle'),getSqliteConnection());
await runSeed('demo');
let backend=await startServer({host:'127.0.0.1',port:0});
process.env.CRM_BACKEND_URL=backend.url;

const {createServer}=await import('vite');

async function createProxy(port,logLevel='error'){
  process.env.CRM_FRONTEND_PORT=String(port);
  const vite=await createServer({root:frontendRoot,configFile:path.join(frontendRoot,'vite.config.ts'),logLevel});
  await vite.listen();
  return {vite,origin:`http://127.0.0.1:${port}`};
}

async function expectStatus(response,expected,label){
  if(response.status!==expected)throw new Error(`${label} returned ${response.status} instead of ${expected}: ${await response.text()}`);
  return response;
}

async function runProxyMutation(port){
  const {vite,origin}=await createProxy(port);
  try{
    const workspaceResponse=await expectStatus(await fetch(`${origin}/api/onboarding/workspace`,{headers:{origin}}),200,`Workspace proxy request on ${port}`);
    const workspace=await workspaceResponse.json();
    await expectStatus(await fetch(`${origin}/api/onboarding/draft`,{method:'PUT',headers:{origin,'content-type':'application/json'},body:JSON.stringify({configuration:workspace.draft.configuration,expectedChecksum:workspace.draft.checksum})}),200,`Draft proxy mutation on ${port}`);
    await expectStatus(await fetch(`${origin}/api/workspace/dashboard`,{headers:{origin}}),409,'Provisioning lifecycle gate');
    await expectStatus(await fetch(`${origin}/api/onboarding/draft`,{method:'PUT',headers:{origin:'https://attacker.example','content-type':'application/json'},body:'{}'}),403,'Hostile origin');
  }finally{await vite.close();}
}

async function publishAndVerifyRestart(port){
  let proxy=await createProxy(port);
  try{
    const workspaceResponse=await expectStatus(await fetch(`${proxy.origin}/api/onboarding/workspace`,{headers:{origin:proxy.origin}}),200,'Pre-publication onboarding workspace');
    const workspace=await workspaceResponse.json();
    const validationResponse=await expectStatus(await fetch(`${proxy.origin}/api/onboarding/validate`,{method:'POST',headers:{origin:proxy.origin,'content-type':'application/json'},body:JSON.stringify({expectedChecksum:workspace.draft.checksum})}),200,'Onboarding validation');
    const validation=await validationResponse.json();
    if(!validation.publishable)throw new Error(`Demo onboarding fixture is not publishable: ${JSON.stringify(validation.checks?.filter((check)=>check.status==='failed')??[])}`);
    await expectStatus(await fetch(`${proxy.origin}/api/onboarding/publish`,{method:'POST',headers:{origin:proxy.origin,'content-type':'application/json'},body:JSON.stringify({expectedChecksum:workspace.draft.checksum})}),200,'Onboarding publication');
    const activeStatusResponse=await expectStatus(await fetch(`${proxy.origin}/api/onboarding/status`,{headers:{origin:proxy.origin}}),200,'Active lifecycle status');
    const activeStatus=await activeStatusResponse.json();
    if(!activeStatus.canAccessWorkspace||activeStatus.status!=='active'||!activeStatus.hasPublishedRevision)throw new Error(`Published lifecycle is inconsistent: ${JSON.stringify(activeStatus)}`);
    await expectStatus(await fetch(`${proxy.origin}/api/workspace/dashboard`,{headers:{origin:proxy.origin}}),200,'Published workspace');
    await expectStatus(await fetch(`${proxy.origin}/api/settings`,{headers:{origin:proxy.origin}}),200,'Published settings projection');
  }finally{await proxy.vite.close();}

  await backend.close();
  backend=await startServer({host:'127.0.0.1',port:0});
  process.env.CRM_BACKEND_URL=backend.url;
  proxy=await createProxy(port);
  try{
    const statusResponse=await expectStatus(await fetch(`${proxy.origin}/api/onboarding/status`,{headers:{origin:proxy.origin}}),200,'Restarted lifecycle status');
    const status=await statusResponse.json();
    if(status.status!=='active'||!status.canAccessWorkspace||!status.hasPublishedRevision)throw new Error(`Published lifecycle did not survive restart: ${JSON.stringify(status)}`);
    await expectStatus(await fetch(`${proxy.origin}/api/workspace/dashboard`,{headers:{origin:proxy.origin}}),200,'Restarted active workspace');
  }finally{await proxy.vite.close();}
}

async function assertStrictPort(){
  const blocker=net.createServer();
  await new Promise((resolve,reject)=>{blocker.once('error',reject);blocker.listen(3000,'127.0.0.1',resolve);});
  process.env.CRM_FRONTEND_PORT='3000';
  const vite=await createServer({root:frontendRoot,configFile:path.join(frontendRoot,'vite.config.ts'),logLevel:'silent'});
  let failed=false;
  try{await vite.listen();}catch{failed=true;}finally{await vite.close().catch(()=>{});await new Promise((resolve)=>blocker.close(resolve));}
  if(!failed)throw new Error('Vite silently selected another port instead of enforcing strictPort');
}

try{
  await runProxyMutation(3000);
  await runProxyMutation(3017);
  await assertStrictPort();
  await publishAndVerifyRestart(3000);
  console.log('WI12 Vite proxy, publication and restart smoke passed on canonical and explicit alternate ports.');
}finally{
  await backend.close().catch(()=>{});closeDatabase();fs.rmSync(temp,{recursive:true,force:true});
  delete process.env.CRM_BACKEND_URL;delete process.env.CRM_FRONTEND_PORT;
}
