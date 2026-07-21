import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase,openDatabase,sqlite } from '../backend/src/infrastructure/database/connection';
import { configureRuntimePaths } from '../backend/src/config/runtimePaths';
import { runMigrations } from '../backend/src/infrastructure/database/migrate';
import { runSeed } from '../backend/src/infrastructure/database/seed';
import { ConnectedCommunicationsRepository } from '../backend/src/infrastructure/database/ConnectedCommunicationsRepository';

async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'whitelabel-crm-wi6-'));
  const databasePath=path.join(temp,'wi6.sqlite');
  configureRuntimePaths({dataDirectory:temp,databasePath,internalBackupDirectory:path.join(temp,'backups'),temporaryDirectory:path.join(temp,'tmp'),logDirectory:path.join(temp,'logs'),documentDirectory:path.join(temp,'documents')});
  try{
    const database=openDatabase(databasePath);
    runMigrations(database,path.resolve('drizzle'),sqlite);
    await runSeed();
    const repository=new ConnectedCommunicationsRepository(sqlite);
    const accounts=repository.listAccounts();
    if(accounts.length<2)throw new Error('Missing WI6 email/calendar account fixtures');
    if(repository.listEmailThreads({limit:100}).length<1)throw new Error('Missing WI6 email fixture');
    if(repository.listCalendarEvents({limit:100}).length<1)throw new Error('Missing WI6 calendar fixture');
    if(repository.listSyncRuns().length<2)throw new Error('Missing WI6 synchronization history');
    if(sqlite.pragma('integrity_check',{simple:true})!=='ok')throw new Error('WI6 SQLite integrity check failed');
    console.log('WI6 connected accounts/email/calendar/matching smoke passed.');
  }finally{closeDatabase();fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch((error:unknown)=>{console.error(error);process.exitCode=1;});
