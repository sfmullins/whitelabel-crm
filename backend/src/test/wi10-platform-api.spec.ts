import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { runSeed } from '../infrastructure/database/seed';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { SecurityRepository } from '../infrastructure/database/SecurityRepository';
import { PlatformRepository } from '../infrastructure/database/PlatformRepository';
import { LOCAL_OWNER_USER_ID } from '../infrastructure/database/wi8Wi9Schema';
import { signWebhookPayload } from '../application/services/WebhookDeliveryService';
import { startServer,type RunningServer } from '../server';

function bearer(token:string){return {authorization:`Bearer ${token}`,'content-type':'application/json'};}

describe('WI10 platform API',()=>{
  beforeEach(async()=>{setupTempDatabase();await runSeed();process.env.CRM_ALLOW_LOOPBACK_WEBHOOKS='true';});
  afterEach(()=>{delete process.env.CRM_ALLOW_LOOPBACK_WEBHOOKS;delete process.env.CRM_TRUST_LOCAL_USERS;cleanupTempDatabase();});

  it('stores API token hashes, limits scopes and enforces revocation',()=>{
    const security=new SecurityRepository();const platform=new PlatformRepository();const owner=security.resolveLocalUser(LOCAL_OWNER_USER_ID)!;
    const created=platform.createApiToken(owner,{name:'Read integration',scopes:['crm.read']});
    expect(created.token).toMatch(/^wlc_/);expect(JSON.stringify(created.record)).not.toContain(created.token);
    const stored=getSqliteConnection().prepare(`SELECT token_hash,token_prefix,scopes_json FROM api_tokens WHERE id=?`).get((created.record as any).id) as {token_hash:string;token_prefix:string;scopes_json:string};
    expect(stored.token_hash).toHaveLength(64);expect(stored.token_hash).not.toContain(created.token);expect(stored.token_prefix).toMatch(/^wlc_/);expect(JSON.parse(stored.scopes_json)).toEqual(['crm.read']);
    expect(platform.resolveApiToken(created.token)?.permissions).toEqual(['crm.read']);
    platform.revokeApiToken((created.record as any).id);expect(platform.resolveApiToken(created.token)).toBeNull();
  });

  it('rejects scopes that the issuer does not hold',()=>{
    const security=new SecurityRepository();const platform=new PlatformRepository();const viewer=security.createUser({email:'viewer-wi10@example.test',displayName:'WI10 Viewer',roleKeys:['viewer'],password:'viewer password long enough'});const identity=security.resolveLocalUser(viewer.id)!;
    expect(()=>platform.createApiToken(identity,{name:'Invalid write token',scopes:['crm.write']})).toThrow('exceeds issuer permission');
    expect(()=>platform.createApiToken(identity,{name:'Unsupported token',scopes:['users.manage']})).toThrow('Unsupported API token scope');
  });

  it('requires bearer authentication on v1 and applies token scopes',async()=>{
    const security=new SecurityRepository();const platform=new PlatformRepository();const owner=security.resolveLocalUser(LOCAL_OWNER_USER_ID)!;const session=security.createSession(owner.id);const read=platform.createApiToken(owner,{name:'Read only',scopes:['crm.read']});const write=platform.createApiToken(owner,{name:'Writer',scopes:['crm.read','crm.write']});let server:RunningServer|null=null;
    try{
      server=await startServer({host:'127.0.0.1',port:0});
      const anonymous=await fetch(`${server.url}/api/v1/me`);expect(anonymous.status).toBe(401);
      const sessionMe=await fetch(`${server.url}/api/v1/me`,{headers:bearer(session.token)});expect(sessionMe.status).toBe(200);expect((await sessionMe.json() as any).authType).toBe('session');
      const tokenMe=await fetch(`${server.url}/api/v1/me`,{headers:bearer(read.token)});expect(tokenMe.status).toBe(200);expect((await tokenMe.json() as any).authType).toBe('api_token');
      const denied=await fetch(`${server.url}/api/v1/organisations`,{method:'POST',headers:bearer(read.token),body:JSON.stringify({name:'Denied v1 organisation',status:'prospect'})});expect(denied.status).toBe(403);
      const created=await fetch(`${server.url}/api/v1/organisations`,{method:'POST',headers:bearer(write.token),body:JSON.stringify({name:'Created through v1',status:'prospect'})});expect(created.status).toBe(201);const body=await created.json() as {id:string};expect(body.id).toBeTruthy();
    }finally{await server?.close();}
  });

  it('publishes an authenticated OpenAPI contract',async()=>{
    const security=new SecurityRepository();const platform=new PlatformRepository();const owner=security.resolveLocalUser(LOCAL_OWNER_USER_ID)!;const token=platform.createApiToken(owner,{name:'Documentation reader',scopes:['crm.read']});let server:RunningServer|null=null;
    try{server=await startServer({host:'127.0.0.1',port:0});const response=await fetch(`${server.url}/api/v1/openapi.json`,{headers:bearer(token.token)});expect(response.status).toBe(200);const document=await response.json() as any;expect(document.openapi).toBe('3.1.0');expect(document.paths['/organisations']).toBeTruthy();expect(document.components.securitySchemes.bearerAuth).toBeTruthy();}finally{await server?.close();}
  });

  it('creates encrypted webhook subscriptions and durable event deliveries',()=>{
    const security=new SecurityRepository();const platform=new PlatformRepository();const owner=security.resolveLocalUser(LOCAL_OWNER_USER_ID)!;
    const created=platform.createWebhook(owner,{name:'Local receiver',endpointUrl:'http://127.0.0.1:45678/hook',eventTypes:['organisation.created.v1']});
    expect(created.secret.length).toBeGreaterThan(30);expect(JSON.stringify(created.subscription)).not.toContain(created.secret);
    const eventId=platform.recordEvent({eventType:'organisation.created.v1',aggregateType:'organisation',aggregateId:'20000000-0000-4000-8000-000000000001',actorUserId:owner.id,requestId:'wi10-event',payload:{id:'20000000-0000-4000-8000-000000000001'}});
    expect(eventId).toBeTruthy();const deliveries=platform.listDeliveries({status:'pending'});expect(deliveries).toHaveLength(1);expect((deliveries[0] as any).eventType).toBe('organisation.created.v1');
    const signature=signWebhookPayload(created.secret,'1700000000','{"ok":true}');expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(()=>getSqliteConnection().prepare(`UPDATE platform_events SET event_type='tampered' WHERE id=?`).run(eventId)).toThrow('immutable');
  });
});
