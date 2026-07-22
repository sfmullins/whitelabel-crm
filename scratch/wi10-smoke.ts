import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase,openDatabase,sqlite } from '../backend/src/infrastructure/database/connection';
import { configureRuntimePaths } from '../backend/src/config/runtimePaths';
import { runMigrations } from '../backend/src/infrastructure/database/migrate';
import { runSeed } from '../backend/src/infrastructure/database/seed';
import { SecurityRepository } from '../backend/src/infrastructure/database/SecurityRepository';
import { PlatformRepository } from '../backend/src/infrastructure/database/PlatformRepository';

async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'whitelabel-crm-wi10-'));const databasePath=path.join(temp,'wi10.sqlite');
  configureRuntimePaths({dataDirectory:temp,databasePath,internalBackupDirectory:path.join(temp,'backups'),temporaryDirectory:path.join(temp,'tmp'),logDirectory:path.join(temp,'logs'),documentDirectory:path.join(temp,'documents')});
  process.env.CRM_ALLOW_LOOPBACK_WEBHOOKS='true';
  try{
    const database=openDatabase(databasePath);runMigrations(database,path.resolve('drizzle'),sqlite);await runSeed();runMigrations(database,path.resolve('drizzle'),sqlite);
    const security=new SecurityRepository(sqlite);const platform=new PlatformRepository(sqlite);const owner=security.resolveLocalUser();if(!owner||!owner.permissions.includes('api.manage')||!owner.permissions.includes('webhooks.manage'))throw new Error('WI10 platform permissions were not bootstrapped');
    const token=platform.createApiToken(owner,{name:'WI10 smoke token',scopes:['crm.read','crm.write']});const tokenIdentity=platform.resolveApiToken(token.token);if(!tokenIdentity||tokenIdentity.permissions.join(',')!=='crm.read,crm.write')throw new Error('WI10 API token resolution failed');
    const webhook=platform.createWebhook(owner,{name:'WI10 smoke webhook',endpointUrl:'http://127.0.0.1:45679/hook',eventTypes:['organisation.created.v1']});if(!webhook.secret)throw new Error('WI10 webhook secret creation failed');
    const eventId=platform.recordEvent({eventType:'organisation.created.v1',aggregateType:'organisation',aggregateId:'20000000-0000-4000-8000-000000000001',actorUserId:owner.id,apiTokenId:tokenIdentity.apiTokenId,requestId:'wi10-smoke',payload:{id:'20000000-0000-4000-8000-000000000001'}});if(!platform.listEvents().some((event:any)=>event.id===eventId))throw new Error('WI10 platform event persistence failed');if(platform.listDeliveries({status:'pending'}).length!==1)throw new Error('WI10 webhook delivery fan-out failed');
    let immutable=false;try{sqlite.prepare(`DELETE FROM platform_events WHERE id=?`).run(eventId);}catch{immutable=true;}if(!immutable)throw new Error('WI10 platform event immutability failed');
    if(sqlite.pragma('integrity_check',{simple:true})!=='ok')throw new Error('WI10 SQLite integrity check failed');
    console.log('WI10 scoped token, platform event and webhook smoke passed.');
  }finally{delete process.env.CRM_ALLOW_LOOPBACK_WEBHOOKS;closeDatabase();fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch((error:unknown)=>{console.error(error);process.exitCode=1;});
