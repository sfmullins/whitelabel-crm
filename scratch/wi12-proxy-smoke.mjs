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
const backend=await startServer({host:'127.0.0.1',port:0});
process.env.CRM_BACKEND_URL=backend.url;

const {createServer}=await import('vite');

async function runProxyMutation(port){
  process.env.CRM_FRONTEND_PORT=String(port);
  const vite=await createServer({root:frontendRoot,configFile:path.join(frontendRoot,'vite.config.ts'),logLevel:'error'});
  await vite.listen();
  const origin=`http://127.0.0.1:${port}`;
  try{
    const workspaceResponse=await fetch(`${origin}/api/onboarding/workspace`,{headers:{origin}});
    if(workspaceResponse.status!==200)throw new Error(`Workspace proxy request failed on ${port}: ${workspaceResponse.status} ${await workspaceResponse.text()}`);
    const workspace=await workspaceResponse.json();
    const mutation=await fetch(`${origin}/api/onboarding/draft`,{method:'PUT',headers:{origin,'content-type':'application/json'},body:JSON.stringify({configuration:workspace.draft.configuration,expectedChecksum:workspace.draft.checksum})});
    if(mutation.status!==200)throw new Error(`Draft proxy mutation failed on ${port}: ${mutation.status} ${await mutation.text()}`);
    const workspaceBlocked=await fetch(`${origin}/api/workspace/dashboard`,{headers:{origin}});
    if(workspaceBlocked.status!==409)throw new Error(`Provisioning lifecycle gate returned ${workspaceBlocked.status} instead of 409`);
    const hostile=await fetch(`${origin}/api/onboarding/draft`,{method:'PUT',headers:{origin:'https://attacker.example','content-type':'application/json'},body:'{}'});
    if(hostile.status!==403)throw new Error(`Hostile origin returned ${hostile.status} instead of 403`);
  }finally{await vite.close();}
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
  console.log('WI12 Vite proxy mutation smoke passed on canonical and explicit alternate ports.');
}finally{
  await backend.close();closeDatabase();fs.rmSync(temp,{recursive:true,force:true});
  delete process.env.CRM_BACKEND_URL;delete process.env.CRM_FRONTEND_PORT;
}
