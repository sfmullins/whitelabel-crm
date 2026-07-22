import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { runSeed } from '../infrastructure/database/seed';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { SecurityRepository } from '../infrastructure/database/SecurityRepository';
import { PlatformRepository } from '../infrastructure/database/PlatformRepository';
import { LOCAL_OWNER_USER_ID } from '../infrastructure/database/wi8Wi9Schema';
import { startServer,type RunningServer } from '../server';

const bearer=(token:string)=>({authorization:`Bearer ${token}`,'content-type':'application/json'});

describe('WI10 platform hardening',()=>{
  beforeEach(async()=>{setupTempDatabase();await runSeed();process.env.CRM_ALLOW_LOOPBACK_WEBHOOKS='true';});
  afterEach(()=>{delete process.env.CRM_ALLOW_LOOPBACK_WEBHOOKS;cleanupTempDatabase();});

  it('invalidates expired tokens and tokens owned by disabled users',()=>{
    const security=new SecurityRepository();const platform=new PlatformRepository();const member=security.createUser({email:'token-owner@example.test',displayName:'Token Owner',roleKeys:['member'],password:'token owner password long enough'});const identity=security.resolveLocalUser(member.id)!;
    const expired=platform.createApiToken(identity,{name:'Expiring token',scopes:['crm.read']});
    getSqliteConnection().prepare(`UPDATE api_tokens SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?`).run((expired.record as any).id);
    expect(platform.resolveApiToken(expired.token)).toBeNull();
    const disabled=platform.createApiToken(identity,{name:'Disabled owner token',scopes:['crm.read']});security.updateUser(member.id,{status:'disabled'});
    expect(platform.resolveApiToken(disabled.token)).toBeNull();
  });

  it('rotates tokens atomically and normalizes offset expiry timestamps',()=>{
    const security=new SecurityRepository();const platform=new PlatformRepository();const owner=security.resolveLocalUser(LOCAL_OWNER_USER_ID)!;
    const original=platform.createApiToken(owner,{name:'Rotating token',scopes:['crm.read'],expiresAt:'2099-01-01T01:00:00+01:00'});expect((original.record as any).expiresAt).toBe('2099-01-01T00:00:00.000Z');
    const replacement=platform.rotateApiToken(owner,(original.record as any).id,{expiresAt:'2099-02-01T01:00:00+01:00'});
    expect(platform.resolveApiToken(original.token)).toBeNull();expect(platform.resolveApiToken(replacement.token)?.permissions).toEqual(['crm.read']);expect((replacement.record as any).expiresAt).toBe('2099-02-01T00:00:00.000Z');
  });

  it('moves repeated webhook failures to dead letter and permits explicit retry',()=>{
    const security=new SecurityRepository();const platform=new PlatformRepository();const owner=security.resolveLocalUser(LOCAL_OWNER_USER_ID)!;
    platform.createWebhook(owner,{name:'Failure lifecycle',endpointUrl:'http://127.0.0.1:45680/hook',eventTypes:['organisation.created.v1']});
    platform.recordEvent({eventType:'organisation.created.v1',aggregateType:'organisation',aggregateId:'20000000-0000-4000-8000-000000000001',actorUserId:owner.id,requestId:'failure-lifecycle'});
    const id=(platform.listDeliveries({status:'pending'})[0] as any).id as string;
    for(let attempt=0;attempt<6;attempt+=1)platform.markDeliveryFailed(id,503,'temporary endpoint failure');
    const dead=platform.listDeliveries({status:'dead'})[0] as any;expect(dead.id).toBe(id);expect(dead.attemptCount).toBe(6);expect(dead.errorSummary).toContain('temporary endpoint failure');
    const retried=platform.retryDelivery(id) as any;expect(retried.status).toBe('pending');
  });

  it('enforces platform permissions and redacts one-time secrets from audit records',async()=>{
    const security=new SecurityRepository();const owner=security.resolveLocalUser(LOCAL_OWNER_USER_ID)!;const ownerSession=security.createSession(owner.id);const viewer=security.createUser({email:'platform-viewer@example.test',displayName:'Platform Viewer',roleKeys:['viewer'],password:'platform viewer password'});const viewerSession=security.createSession(viewer.id);let server:RunningServer|null=null;
    try{
      server=await startServer({host:'127.0.0.1',port:0});
      const denied=await fetch(`${server.url}/api/platform/events`,{headers:bearer(viewerSession.token)});expect(denied.status).toBe(403);
      const tokenResponse=await fetch(`${server.url}/api/platform/api-tokens`,{method:'POST',headers:bearer(ownerSession.token),body:JSON.stringify({name:'Audited token',scopes:['crm.read']})});expect(tokenResponse.status).toBe(201);const tokenBody=await tokenResponse.json() as {token:string};expect(tokenBody.token).toMatch(/^wlc_/);
      const webhookResponse=await fetch(`${server.url}/api/platform/webhooks`,{method:'POST',headers:bearer(ownerSession.token),body:JSON.stringify({name:'Audited webhook',endpointUrl:'https://example.com/white-label-crm',eventTypes:['organisation.created.v1']})});expect(webhookResponse.status).toBe(201);const webhookBody=await webhookResponse.json() as {secret:string};expect(webhookBody.secret.length).toBeGreaterThan(30);
      const rows=getSqliteConnection().prepare(`SELECT route,after_json FROM audit_events WHERE route IN ('/api/platform/api-tokens','/api/platform/webhooks') ORDER BY occurred_at`).all() as Array<{route:string;after_json:string}>;
      expect(rows).toHaveLength(2);const serialized=JSON.stringify(rows);expect(serialized).not.toContain(tokenBody.token);expect(serialized).not.toContain(webhookBody.secret);expect(serialized).toContain('[redacted]');
    }finally{await server?.close();}
  });
});
