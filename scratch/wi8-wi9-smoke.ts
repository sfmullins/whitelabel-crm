import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase,openDatabase,sqlite } from '../backend/src/infrastructure/database/connection';
import { configureRuntimePaths } from '../backend/src/config/runtimePaths';
import { runMigrations } from '../backend/src/infrastructure/database/migrate';
import { runSeed } from '../backend/src/infrastructure/database/seed';
import { SecurityRepository } from '../backend/src/infrastructure/database/SecurityRepository';
import { ReportingRepository } from '../backend/src/infrastructure/database/ReportingRepository';
import { OwnershipRepository } from '../backend/src/infrastructure/database/OwnershipRepository';

async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'whitelabel-crm-wi89-'));const databasePath=path.join(temp,'wi89.sqlite');
  configureRuntimePaths({dataDirectory:temp,databasePath,internalBackupDirectory:path.join(temp,'backups'),temporaryDirectory:path.join(temp,'tmp'),logDirectory:path.join(temp,'logs'),documentDirectory:path.join(temp,'documents')});
  try{
    const database=openDatabase(databasePath);runMigrations(database,path.resolve('drizzle'),sqlite);await runSeed();
    const security=new SecurityRepository(sqlite);const reporting=new ReportingRepository(sqlite);const owner=security.resolveLocalUser();
    if(!owner||!owner.permissions.includes('reports.export'))throw new Error('WI8-WI9 owner/permission bootstrap failed');
    const viewer=security.createUser({email:'wi89-viewer@example.test',displayName:'WI89 Viewer',roleKeys:['viewer'],password:'wi89 viewer password'});const session=security.createSessionForPassword(viewer.email,'wi89 viewer password');
    if(!security.resolveSession(session.token)?.permissions.includes('reports.read'))throw new Error('WI8-WI9 session resolution failed');
    if(security.resolveSession(session.token)?.permissions.includes('reports.export'))throw new Error('WI8-WI9 viewer export permission leaked');
    const executive=reporting.executive({from:'2020-01-01T00:00:00.000Z',to:'2035-12-31T23:59:59.999Z'});if(executive.kpis.activeClients<1)throw new Error('WI8 executive report returned no persisted clients');
    const saved=reporting.createSavedReport(owner,{name:'WI89 smoke report',reportKey:'executive',visibility:'private'});if(!reporting.listSavedReports(owner).some((item)=>item.id===saved.id))throw new Error('WI8 saved report persistence failed');
    const dashboard=reporting.createDashboard(owner,{name:'WI89 smoke dashboard',visibility:'private',widgets:[{widgetKey:'executive_kpis'},{widgetKey:'revenue_trend'}]});if(dashboard.widgets.length!==2)throw new Error('WI8 dashboard widget persistence failed');
    const organisation=(sqlite.prepare(`SELECT id FROM organisations LIMIT 1`).get() as {id:string});new OwnershipRepository(sqlite).update('organisation',organisation.id,{ownerUserId:owner.id,ownerTeamId:owner.teams[0]?.id??null});
    const auditId=security.recordAudit({actorUserId:owner.id,action:'wi89.smoke',requestId:'wi89-smoke',route:'/scratch/wi8-wi9',method:'POST'});if(!security.listAudit({action:'wi89.smoke'}).items.some((item)=>item.id===auditId))throw new Error('WI9 audit persistence failed');
    let immutable=false;try{sqlite.prepare(`DELETE FROM audit_events WHERE id=?`).run(auditId);}catch{immutable=true;}if(!immutable)throw new Error('WI9 audit immutability failed');
    if(sqlite.pragma('integrity_check',{simple:true})!=='ok')throw new Error('WI8-WI9 SQLite integrity check failed');
    console.log('WI8-WI9 identity/RBAC/audit/reporting/dashboard smoke passed.');
  }finally{closeDatabase();fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch((error:unknown)=>{console.error(error);process.exitCode=1;});
