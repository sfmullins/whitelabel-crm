import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase,openDatabase,sqlite } from '../backend/src/infrastructure/database/connection';
import { configureRuntimePaths } from '../backend/src/config/runtimePaths';
import { runMigrations } from '../backend/src/infrastructure/database/migrate';
import { runSeed } from '../backend/src/infrastructure/database/seed';
import { CommunicationsHubRepository } from '../backend/src/infrastructure/database/CommunicationsHubRepository';
import { WorkflowRepository } from '../backend/src/infrastructure/database/WorkflowRepository';

const ACME='20000000-0000-4000-8000-000000000001';
const ACCOUNT='20000000-0000-4000-8000-000000000029';

async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'whitelabel-crm-wi7-'));
  const databasePath=path.join(temp,'wi7.sqlite');
  configureRuntimePaths({dataDirectory:temp,databasePath,internalBackupDirectory:path.join(temp,'backups'),temporaryDirectory:path.join(temp,'tmp'),logDirectory:path.join(temp,'logs'),documentDirectory:path.join(temp,'documents')});
  try{
    const database=openDatabase(databasePath);
    runMigrations(database,path.resolve('backend/drizzle'),sqlite);
    await runSeed();
    const hub=new CommunicationsHubRepository(sqlite);
    if(hub.listTemplates().length<4)throw new Error('Missing WI7 workflow templates');
    const draft=hub.createDraft({accountId:ACCOUNT,organisationId:ACME,to:[{address:'aisling.byrne@acme.example'}],subject:'WI7 smoke draft',bodyText:'Review before sending.'});
    if(hub.getDraft(String(draft.id))?.status!=='draft')throw new Error('WI7 draft persistence failed');
    const workflows=new WorkflowRepository(sqlite);
    const workflow=workflows.createDefinition({name:'WI7 smoke workflow',triggerType:'manual',actions:[{type:'create_email_draft',accountId:ACCOUNT,organisationId:ACME,to:[{address:'aisling.byrne@acme.example'}],subject:'Workflow draft',body:'No automatic send.'}]});
    const run=workflows.run({workflowId:String(workflow.id),sourceType:'organisation',sourceId:ACME,triggerEvent:'manual',idempotencyKey:'wi7-smoke-workflow',context:{organisationId:ACME,accountId:ACCOUNT}});
    if(run.status!=='succeeded')throw new Error('WI7 draft workflow failed');
    if(!hub.listDrafts({organisationId:ACME}).some((item)=>item.subject==='Workflow draft'))throw new Error('WI7 workflow did not create a draft');
    const attempts=(sqlite.prepare('SELECT count(*) AS count FROM outbound_email_attempts').get() as {count:number}).count;
    if(attempts!==0)throw new Error('WI7 workflow attempted external email transmission');
    if(sqlite.pragma('integrity_check',{simple:true})!=='ok')throw new Error('WI7 SQLite integrity check failed');
    console.log('WI7 drafts/workflow templates/safety smoke passed.');
  }finally{closeDatabase();fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch((error:unknown)=>{console.error(error);process.exitCode=1;});
