import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { runSeed } from '../infrastructure/database/seed';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { SecurityRepository } from '../infrastructure/database/SecurityRepository';
import { ReportingRepository } from '../infrastructure/database/ReportingRepository';
import { ReportScheduleRepository } from '../infrastructure/database/ReportScheduleRepository';
import { ScheduledReportService } from '../application/services/ScheduledReportService';
import { startServer,type RunningServer } from '../server';

function auth(token:string){return {authorization:`Bearer ${token}`,'content-type':'application/json'};}

describe('administration permission and schedule lifecycle hardening',()=>{
  beforeEach(async()=>{setupTempDatabase();await runSeed();});
  afterEach(()=>{delete process.env.CRM_TRUST_LOCAL_USERS;cleanupTempDatabase();});

  it('does not allow users.manage alone to assign privileged roles',async()=>{
    const connection=getSqliteConnection();const timestamp=new Date().toISOString();const roleId='91000000-0000-4000-8000-000000000001';
    connection.prepare(`INSERT INTO roles(id,key,name,description,system_role,created_at,updated_at) VALUES(?,?,'User operator','Can manage users but not roles',0,?,?)`).run(roleId,'user_operator',timestamp,timestamp);
    connection.prepare(`INSERT INTO role_permissions(role_id,permission_key,created_at) VALUES(?,'users.manage',?)`).run(roleId,timestamp);
    const security=new SecurityRepository();const operator=security.createUser({email:'operator@example.test',displayName:'User Operator',roleKeys:['user_operator'],password:'operator secure password'});const session=security.createSessionForPassword(operator.email,'operator secure password');process.env.CRM_TRUST_LOCAL_USERS='false';let server:RunningServer|null=null;
    try{
      server=await startServer({host:'127.0.0.1',port:0});
      const list=await fetch(`${server.url}/api/admin/users`,{headers:auth(session.token)});expect(list.status).toBe(200);
      const create=await fetch(`${server.url}/api/admin/users`,{method:'POST',headers:auth(session.token),body:JSON.stringify({email:'escalated@example.test',displayName:'Escalated',roleKeys:['owner'],password:'escalated password value'})});expect(create.status).toBe(403);
      const roleMatrix=await fetch(`${server.url}/api/admin/roles`,{headers:auth(session.token)});expect(roleMatrix.status).toBe(403);
    }finally{await server?.close();}
  });

  it('pauses and resumes scheduled report execution without losing the configured cadence',async()=>{
    const security=new SecurityRepository();const identity=security.resolveLocalUser()!;const reporting=new ReportingRepository();const schedules=new ReportScheduleRepository();
    const saved=reporting.createSavedReport(identity,{name:'Lifecycle report',reportKey:'executive',filters:{from:'2024-01-01T00:00:00.000Z',to:'2028-12-31T23:59:59.999Z'}});const created=reporting.createSchedule(identity,{savedReportId:saved.id,cadence:'monthly',nextRunAt:'2020-01-01T07:00:00.000Z'}) as {id:string};
    const paused=schedules.update(identity,created.id,{enabled:false}) as {enabled:number;cadence:string};expect(paused.enabled).toBe(0);expect(paused.cadence).toBe('monthly');expect(await new ScheduledReportService().processDue()).toEqual({succeeded:0,failed:0});
    schedules.update(identity,created.id,{enabled:true,cadence:'weekly',nextRunAt:'2020-01-01T07:00:00.000Z'});expect(await new ScheduledReportService().processDue()).toEqual({succeeded:1,failed:0});
  });
});
