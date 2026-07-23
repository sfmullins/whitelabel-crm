import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {cleanupTempDatabase,setupTempDatabase} from './crm/helpers';
import {runSeed} from '../infrastructure/database/seed';
import {SecurityRepository} from '../infrastructure/database/SecurityRepository';
import {LOCAL_OWNER_USER_ID} from '../infrastructure/database/wi8Wi9Schema';
import {startServer,type RunningServer} from '../server';

describe('backup route security',()=>{
  let server:RunningServer|null=null;
  beforeEach(async()=>{setupTempDatabase();await runSeed();server=await startServer({host:'127.0.0.1',port:0});});
  afterEach(async()=>{await server?.close();server=null;cleanupTempDatabase();});

  function headers(){return {'content-type':'application/json','x-crm-user-id':LOCAL_OWNER_USER_ID,origin:server!.url};}

  it('rejects malformed encryption keys before backup processing',async()=>{
    const response=await fetch(`${server!.url}/api/backups`,{method:'POST',headers:headers(),body:JSON.stringify({encryptionKeyHex:'not-a-32-byte-key'})});
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({error:'VALIDATION_ERROR'});
  });

  it('never persists the backup encryption key in immutable audit metadata',async()=>{
    const encryptionKeyHex='ab'.repeat(32);
    const response=await fetch(`${server!.url}/api/backups`,{method:'POST',headers:headers(),body:JSON.stringify({encryptionKeyHex,dailyRetentionCount:1,weeklyRetentionCount:1,monthlyRetentionCount:1})});
    expect(response.status).toBe(201);

    const event=new SecurityRepository().listAudit({action:'post.backups'}).items[0];
    expect(event).toBeDefined();
    expect(JSON.stringify(event.metadata)).not.toContain(encryptionKeyHex);
    expect((event.metadata as {body:{encryptionKeyHex:string}}).body.encryptionKeyHex).toBe('[redacted]');
  });
});
