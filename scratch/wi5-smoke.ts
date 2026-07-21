import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase,openDatabase,sqlite } from '../backend/src/infrastructure/database/connection';
import { configureRuntimePaths } from '../backend/src/config/runtimePaths';
import { runMigrations } from '../backend/src/infrastructure/database/migrate';
import { runSeed } from '../backend/src/infrastructure/database/seed';
import { WorkRepository } from '../backend/src/infrastructure/database/WorkRepository';
import { DocumentRepository } from '../backend/src/infrastructure/database/DocumentRepository';
import { CommunicationRepository } from '../backend/src/infrastructure/database/CommunicationRepository';
import { WorkflowRepository } from '../backend/src/infrastructure/database/WorkflowRepository';

async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'whitelabel-crm-wi5-'));
  const databasePath=path.join(temp,'wi5.sqlite');
  configureRuntimePaths({dataDirectory:temp,databasePath,internalBackupDirectory:path.join(temp,'backups'),temporaryDirectory:path.join(temp,'tmp'),logDirectory:path.join(temp,'logs'),documentDirectory:path.join(temp,'documents')});
  try{
    const database=openDatabase(databasePath);
    runMigrations(database,path.resolve('drizzle'),sqlite);
    await runSeed();
    const work=new WorkRepository(sqlite).listWork({bucket:'all',limit:200,offset:0});
    if(!work.items.some((item)=>item.workType==='task'))throw new Error('Missing task fixture');
    if(!work.items.some((item)=>item.workType==='follow_up'))throw new Error('Missing activity follow-up fixture');
    if(new DocumentRepository(sqlite).list({organisationId:'20000000-0000-4000-8000-000000000001'}).length<1)throw new Error('Missing Acme document fixture');
    if(new CommunicationRepository(sqlite).list({organisationId:'20000000-0000-4000-8000-000000000001'}).length<2)throw new Error('Missing Acme communication fixtures');
    if(new WorkflowRepository(sqlite).listRuns().length<1)throw new Error('Missing workflow run fixture');
    const integrity=sqlite.pragma('integrity_check',{simple:true});
    if(integrity!=='ok')throw new Error(`SQLite integrity check failed: ${integrity}`);
    console.log('WI5 tasks/reminders/documents/communications/workflows smoke passed.');
  }finally{
    closeDatabase();
    fs.rmSync(temp,{recursive:true,force:true});
  }
}
main().catch((error:unknown)=>{console.error(error);process.exitCode=1;});
