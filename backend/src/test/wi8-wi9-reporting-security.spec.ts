import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { runSeed } from '../infrastructure/database/seed';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { SecurityRepository } from '../infrastructure/database/SecurityRepository';
import { ReportingRepository } from '../infrastructure/database/ReportingRepository';
import { OwnershipRepository } from '../infrastructure/database/OwnershipRepository';
import { DEFAULT_TEAM_ID,LOCAL_OWNER_USER_ID } from '../infrastructure/database/wi8Wi9Schema';
import { startServer,type RunningServer } from '../server';

const FULL_RANGE={from:'2024-01-01T00:00:00.000Z',to:'2028-12-31T23:59:59.999Z'};

function auth(token:string){return {authorization:`Bearer ${token}`,'content-type':'application/json'};}

describe('WI8-WI9 reporting, identity and hardening',()=>{
  beforeEach(async()=>{setupTempDatabase();await runSeed();});
  afterEach(()=>{delete process.env.CRM_TRUST_LOCAL_USERS;cleanupTempDatabase();});

  it('seeds the local owner, system roles, teams and ownership without destructive migration',()=>{
    const security=new SecurityRepository();const owner=security.getUser(LOCAL_OWNER_USER_ID)!;
    expect(owner.status).toBe('active');expect(owner.roles.map((role)=>role.key)).toContain('owner');expect(owner.permissions).toContain('reports.export');expect(owner.teams.map((team)=>team.id)).toContain(DEFAULT_TEAM_ID);
    const connection=getSqliteConnection();expect((connection.prepare('SELECT count(*) AS count FROM organisations WHERE owner_user_id IS NULL OR owner_team_id IS NULL').get() as {count:number}).count).toBe(0);
    expect((connection.prepare('SELECT count(*) AS count FROM tasks WHERE owner_user_id IS NULL OR owner_team_id IS NULL').get() as {count:number}).count).toBe(0);
  });

  it('hashes credentials, expires/revokes sessions and enforces disabled users',()=>{
    const security=new SecurityRepository();const user=security.createUser({email:'viewer@example.test',displayName:'Viewer',roleKeys:['viewer'],password:'correct horse battery staple'});
    const credential=getSqliteConnection().prepare('SELECT password_hash,password_salt FROM users WHERE id=?').get(user.id) as {password_hash:string;password_salt:string};
    expect(credential.password_hash).not.toContain('correct horse');expect(credential.password_salt.length).toBeGreaterThan(10);
    const session=security.createSessionForPassword(user.email,'correct horse battery staple');expect(security.resolveSession(session.token)?.permissions).toContain('reports.read');
    getSqliteConnection().prepare(`UPDATE auth_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE user_id=?`).run(user.id);expect(security.resolveSession(session.token)).toBeNull();
    const second=security.createSessionForPassword(user.email,'correct horse battery staple');security.updateUser(user.id,{status:'disabled'});expect(security.resolveSession(second.token)).toBeNull();
  });

  it('records immutable audit events with preserved actor and entity identifiers',()=>{
    const security=new SecurityRepository();const id=security.recordAudit({actorUserId:LOCAL_OWNER_USER_ID,action:'test.audit',entityType:'organisation',entityId:'20000000-0000-4000-8000-000000000001',organisationId:'20000000-0000-4000-8000-000000000001',requestId:'request-audit',route:'/api/test',method:'POST',metadata:{password:'[redacted]'}});
    expect(security.listAudit({action:'test.audit'}).items[0].id).toBe(id);
    expect(()=>getSqliteConnection().prepare('UPDATE audit_events SET action=? WHERE id=?').run('tampered',id)).toThrow('immutable');
    expect(()=>getSqliteConnection().prepare('DELETE FROM audit_events WHERE id=?').run(id)).toThrow('immutable');
  });

  it('calculates reports from persisted values and exports the same report grain',()=>{
    const reporting=new ReportingRepository();const connection=getSqliteConnection();
    const expected=(connection.prepare('SELECT COALESCE(SUM(amount),0) AS value FROM payments WHERE payment_date BETWEEN ? AND ?').get(FULL_RANGE.from,FULL_RANGE.to) as {value:number}).value;
    const revenue=reporting.revenue(FULL_RANGE);expect(revenue.totals.collectedCents).toBe(expected);expect(revenue.totals.invoicedCents).toBeGreaterThan(0);
    const executive=reporting.executive(FULL_RANGE);expect(executive.kpis.activeClients).toBeGreaterThan(0);expect(executive.kpis.collectedRevenueCents).toBe(expected);
    const csv=reporting.exportCsv('revenue',FULL_RANGE);expect(csv.filename).toMatch(/^revenue-report-/);expect(csv.content).toContain('invoicedCents');expect(csv.content).toContain('collectedCents');
  });

  it('isolates team reports and dashboards by owner/team visibility',()=>{
    const security=new SecurityRepository();const reporting=new ReportingRepository();
    const one=security.createUser({email:'one@example.test',displayName:'One',roleKeys:['manager'],password:'password for manager one'});const peer=security.createUser({email:'peer@example.test',displayName:'Peer',roleKeys:['viewer'],password:'password for peer user'});const outsider=security.createUser({email:'out@example.test',displayName:'Outsider',roleKeys:['viewer'],password:'password for outside user'});
    const team=security.createTeam({name:'Delivery',userIds:[one.id,peer.id]}) as {id:string};const other=security.createTeam({name:'Other',userIds:[outsider.id]}) as {id:string};security.updateUser(one.id,{teamIds:[team.id]});security.updateUser(peer.id,{teamIds:[team.id]});security.updateUser(outsider.id,{teamIds:[other.id]});
    const oneIdentity=security.resolveLocalUser(one.id)!;const peerIdentity=security.resolveLocalUser(peer.id)!;const outsiderIdentity=security.resolveLocalUser(outsider.id)!;
    const saved=reporting.createSavedReport(oneIdentity,{name:'Delivery report',reportKey:'workload',visibility:'team',teamId:team.id});expect(reporting.listSavedReports(peerIdentity).some((item)=>item.id===saved.id)).toBe(true);expect(reporting.listSavedReports(outsiderIdentity).some((item)=>item.id===saved.id)).toBe(false);
    const dashboard=reporting.createDashboard(oneIdentity,{name:'Delivery dashboard',visibility:'team',teamId:team.id,widgets:[{widgetKey:'workload'}]});expect(reporting.listDashboards(peerIdentity).some((item)=>item.id===dashboard.id)).toBe(true);expect(reporting.listDashboards(outsiderIdentity).some((item)=>item.id===dashboard.id)).toBe(false);
  });

  it('enforces viewer/member permissions over live HTTP and assigns created ownership',async()=>{
    process.env.CRM_TRUST_LOCAL_USERS='false';const security=new SecurityRepository();const viewer=security.createUser({email:'http-viewer@example.test',displayName:'HTTP Viewer',roleKeys:['viewer'],password:'viewer secure password'});const member=security.createUser({email:'http-member@example.test',displayName:'HTTP Member',roleKeys:['member'],password:'member secure password'});const viewerSession=security.createSessionForPassword(viewer.email,'viewer secure password');const memberSession=security.createSessionForPassword(member.email,'member secure password');let server:RunningServer|null=null;
    try{
      server=await startServer({host:'127.0.0.1',port:0});
      const report=await fetch(`${server.url}/api/reporting/executive?from=${encodeURIComponent(FULL_RANGE.from)}&to=${encodeURIComponent(FULL_RANGE.to)}`,{headers:auth(viewerSession.token)});expect(report.status).toBe(200);
      const exportDenied=await fetch(`${server.url}/api/reporting/revenue/export.csv`,{headers:auth(viewerSession.token)});expect(exportDenied.status).toBe(403);
      const createDenied=await fetch(`${server.url}/api/organisations`,{method:'POST',headers:auth(viewerSession.token),body:JSON.stringify({name:'Denied Organisation',status:'prospect'})});expect(createDenied.status).toBe(403);
      const createdResponse=await fetch(`${server.url}/api/organisations`,{method:'POST',headers:auth(memberSession.token),body:JSON.stringify({name:'Owned Organisation',status:'prospect'})});expect(createdResponse.status).toBe(201);const created=await createdResponse.json() as {id:string};
      expect(new OwnershipRepository().get('organisation',created.id).ownerUserId).toBe(member.id);
      const audit=security.listAudit({entityType:'organisations'});expect(audit.items.some((event)=>event.actorUserId===member.id&&event.entityId===created.id)).toBe(true);
      const ready=await fetch(`${server.url}/ready`);expect(ready.status).toBe(200);
    }finally{await server?.close();}
  });
});
