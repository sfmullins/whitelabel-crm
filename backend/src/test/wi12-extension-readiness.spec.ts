import crypto from 'node:crypto';
import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { OnboardingRepository } from '../infrastructure/database/OnboardingRepository';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { runSeed } from '../infrastructure/database/seed';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';

describe('WI12 extension readiness',()=>{
  beforeEach(()=>setupTempDatabase());
  afterEach(()=>cleanupTempDatabase());

  it('evaluates enabled extensions through the WI11 status column',async()=>{
    await runSeed('demo');
    const connection=getSqliteConnection();
    const timestamp='2026-07-24T19:40:00.000Z';
    const manifest=JSON.stringify({formatVersion:1,packageKey:'readiness-fixture',name:'Readiness fixture',version:'1.0.0',application:{minVersion:'1.0.0'},capabilities:[],contributions:{}});
    const checksum=crypto.createHash('sha256').update(manifest).digest('hex');
    connection.prepare(`INSERT INTO extensions(id,package_key,name,description,current_version,status,system_managed,manifest_json,checksum_sha256,signature_status,capabilities_json,installed_at,updated_at,enabled_at) VALUES(?,?,?,?,?,'enabled',0,?,?,'unsigned','[]',?,?,?)`).run(crypto.randomUUID(),'readiness-fixture','Readiness fixture','Regression fixture','1.0.0',manifest,checksum,timestamp,timestamp,timestamp);

    const repository=new OnboardingRepository(connection);
    const workspace=repository.getWorkspace();
    const configuration={...workspace.draft.configuration,extensions:[...workspace.draft.configuration.extensions,{packageKey:'readiness-fixture',enabled:true,approvedCapabilities:[]}]};
    const saved=repository.saveDraft(configuration,null,workspace.draft.checksum);

    expect(saved.readiness.checks.find((check)=>check.id==='extensions.compatible')).toMatchObject({status:'passed',evidence:{unavailable:[]}});
    expect(repository.getWorkspace().draft.checksum).toBe(saved.draft.checksum);
  });
});
