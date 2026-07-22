import fs from 'node:fs';
import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { runSeed } from '../infrastructure/database/seed';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { SecurityRepository } from '../infrastructure/database/SecurityRepository';
import { ReportingRepository } from '../infrastructure/database/ReportingRepository';
import { ScheduledReportService } from '../application/services/ScheduledReportService';

const ACME='20000000-0000-4000-8000-000000000001';
const FILTERS={from:'2024-01-01T00:00:00.000Z',to:'2028-12-31T23:59:59.999Z'};

describe('scheduled reporting and audit lifecycle hardening',()=>{
  beforeEach(async()=>{setupTempDatabase();await runSeed();});
  afterEach(cleanupTempDatabase);

  it('generates due scheduled reports into an access-controlled download queue',async()=>{
    const security=new SecurityRepository();const reporting=new ReportingRepository();const owner=security.resolveLocalUser()!;
    const saved=reporting.createSavedReport(owner,{name:'Scheduled revenue',reportKey:'revenue',filters:FILTERS,visibility:'private'});
    const schedule=reporting.createSchedule(owner,{savedReportId:saved.id,cadence:'weekly',nextRunAt:'2020-01-01T07:00:00.000Z'}) as {id:string};
    const service=new ScheduledReportService();expect(await service.processDue()).toEqual({succeeded:1,failed:0});
    const runs=service.listRuns(owner);expect(runs).toHaveLength(1);expect(runs[0].status).toBe('succeeded');expect(runs[0].downloadAvailable).toBe(true);
    const file=service.getDownload(owner,String(runs[0].id));expect(fs.existsSync(file.path)).toBe(true);expect(fs.readFileSync(file.path,'utf8')).toContain('collectedCents');
    const stored=getSqliteConnection().prepare('SELECT next_run_at,last_run_at FROM report_schedules WHERE id=?').get(schedule.id) as {next_run_at:string;last_run_at:string};expect(stored.next_run_at>new Date().toISOString()).toBe(true);expect(stored.last_run_at).toBeTruthy();
    expect(security.listAudit({action:'report.schedule.generated'}).items.some((event)=>event.entityId===saved.id)).toBe(true);
  });

  it('does not expose private generated files to another user',async()=>{
    const security=new SecurityRepository();const reporting=new ReportingRepository();const owner=security.resolveLocalUser()!;const viewer=security.createUser({email:'scheduled-viewer@example.test',displayName:'Scheduled Viewer',roleKeys:['viewer'],password:'scheduled viewer password'});const viewerIdentity=security.resolveLocalUser(viewer.id)!;
    const saved=reporting.createSavedReport(owner,{name:'Private scheduled report',reportKey:'executive',filters:FILTERS,visibility:'private'});reporting.createSchedule(owner,{savedReportId:saved.id,cadence:'daily',nextRunAt:'2020-01-01T07:00:00.000Z'});
    const service=new ScheduledReportService();await service.processDue();const ownerRun=service.listRuns(owner)[0];expect(service.listRuns(viewerIdentity)).toHaveLength(0);expect(()=>service.getDownload(viewerIdentity,String(ownerRun.id))).toThrow('not found');
  });

  it('preserves immutable actor and organisation identifiers after source rows are deleted',()=>{
    const security=new SecurityRepository();const user=security.createUser({email:'audit-lifecycle@example.test',displayName:'Audit Lifecycle',roleKeys:['member'],password:'audit lifecycle password'});const connection=getSqliteConnection();const organisationId='90000000-0000-4000-8000-000000000001';const timestamp=new Date().toISOString();
    connection.prepare(`INSERT INTO organisations(id,name,status,created_at,updated_at) VALUES(?,?,'prospect',?,?)`).run(organisationId,'Disposable audit organisation',timestamp,timestamp);
    const auditId=security.recordAudit({actorUserId:user.id,action:'lifecycle.test',entityType:'organisation',entityId:organisationId,organisationId,requestId:'lifecycle-request',route:'/api/lifecycle',method:'DELETE'});
    connection.prepare('DELETE FROM team_memberships WHERE user_id=?').run(user.id);connection.prepare('DELETE FROM user_roles WHERE user_id=?').run(user.id);connection.prepare('DELETE FROM users WHERE id=?').run(user.id);connection.prepare('DELETE FROM organisations WHERE id=?').run(organisationId);
    const row=connection.prepare('SELECT actor_user_id,organisation_id FROM audit_events WHERE id=?').get(auditId) as {actor_user_id:string;organisation_id:string};expect(row).toEqual({actor_user_id:user.id,organisation_id:organisationId});
    expect((connection.prepare('PRAGMA foreign_key_list(audit_events)').all() as Array<unknown>)).toHaveLength(0);expect(()=>connection.prepare('UPDATE audit_events SET action=? WHERE id=?').run('changed',auditId)).toThrow('immutable');
  });

  it('excludes expired same-day sessions from operational metrics',()=>{
    const security=new SecurityRepository();const reporting=new ReportingRepository();const user=security.createUser({email:'session-count@example.test',displayName:'Session Count',roleKeys:['viewer'],password:'session count password'});security.createSessionForPassword(user.email,'session count password');
    getSqliteConnection().prepare(`UPDATE auth_sessions SET expires_at=? WHERE user_id=?`).run(new Date(Date.now()-60_000).toISOString(),user.id);
    const metrics=reporting.operations(FILTERS).metrics;expect(metrics.activeSessions).toBe(0);
  });
});
