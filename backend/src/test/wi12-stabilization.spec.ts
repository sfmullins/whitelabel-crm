import fs from 'node:fs';
import path from 'node:path';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { BrandAssetReferenceSchema,type OnboardingWorkspace } from 'shared/onboarding';
import { getRuntimePaths } from '../config/runtimePaths';
import { OnboardingRepository } from '../infrastructure/database/OnboardingRepository';
import { SecurityRepository } from '../infrastructure/database/SecurityRepository';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { runSeed } from '../infrastructure/database/seed';
import { BrandAssetStore } from '../infrastructure/storage/BrandAssetStore';
import { startServer,type RunningServer } from '../server';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';

const ONE_PIXEL_PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3fBqWQAAAABJRU5ErkJggg==';

describe('WI12 stabilization',()=>{
  let server:RunningServer|null=null;
  beforeEach(()=>{process.env.CRM_ENFORCE_INSTANCE_LIFECYCLE='true';setupTempDatabase();delete process.env.CRM_TRUST_LOCAL_USERS;});
  afterEach(async()=>{await server?.close();server=null;cleanupTempDatabase();delete process.env.CRM_TRUST_LOCAL_USERS;delete process.env.CRM_ENFORCE_INSTANCE_LIFECYCLE;vi.restoreAllMocks();});

  it('uses the instance lifecycle as the authoritative workspace gate',async()=>{
    await runSeed('demo');
    const repository=new OnboardingRepository();
    expect(repository.getStatus()).toMatchObject({status:'provisioning',hasPublishedRevision:false,requiresOnboarding:true,canAccessWorkspace:false});
    server=await startServer({host:'127.0.0.1',port:0});

    const status=await fetch(`${server.url}/api/onboarding/status`);
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({status:'provisioning',requiresOnboarding:true});

    const blocked=await fetch(`${server.url}/api/workspace/dashboard`);
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({error:'INSTANCE_ONBOARDING_REQUIRED'});

    const onboarding=await fetch(`${server.url}/api/onboarding/workspace`);
    expect(onboarding.status).toBe(200);
  });

  it('allows every authenticated employee to read lifecycle status without granting onboarding access',async()=>{
    await runSeed('demo');
    const employee=new SecurityRepository().createUser({email:'member@example.test',displayName:'Lifecycle Member',roleKeys:['member']});
    server=await startServer({host:'127.0.0.1',port:0});
    const status=await fetch(`${server.url}/api/onboarding/status`,{headers:{'x-crm-user-id':employee.id}});
    expect(status.status).toBe(200);
    const privateWorkspace=await fetch(`${server.url}/api/onboarding/workspace`,{headers:{'x-crm-user-id':employee.id}});
    expect(privateWorkspace.status).toBe(403);
  });

  it('resets published lifecycle state deterministically for development onboarding',async()=>{
    process.env.CRM_SEED_NOW='2026-07-24T00:00:00.000Z';
    await runSeed('published');
    expect(new OnboardingRepository().getStatus()).toMatchObject({status:'active',requiresOnboarding:false,hasPublishedRevision:true});
    expect((getSqliteConnection().prepare('SELECT count(*) AS count FROM instance_publications').get() as {count:number}).count).toBe(1);

    await runSeed('demo');
    const first=new OnboardingRepository().getWorkspace();
    const firstCounts={
      organisations:(getSqliteConnection().prepare('SELECT count(*) AS count FROM organisations').get() as {count:number}).count,
      publications:(getSqliteConnection().prepare('SELECT count(*) AS count FROM instance_publications').get() as {count:number}).count,
      devices:(getSqliteConnection().prepare('SELECT count(*) AS count FROM instance_devices').get() as {count:number}).count,
    };
    expect(first.instance).toMatchObject({status:'provisioning',currentPublishedRevisionId:null});
    expect(firstCounts).toEqual({organisations:3,publications:0,devices:0});

    await runSeed('demo');
    const second=new OnboardingRepository().getWorkspace();
    const secondCounts={
      organisations:(getSqliteConnection().prepare('SELECT count(*) AS count FROM organisations').get() as {count:number}).count,
      publications:(getSqliteConnection().prepare('SELECT count(*) AS count FROM instance_publications').get() as {count:number}).count,
      devices:(getSqliteConnection().prepare('SELECT count(*) AS count FROM instance_devices').get() as {count:number}).count,
    };
    expect(secondCounts).toEqual(firstCounts);
    expect(second.draft.checksum).toBe(first.draft.checksum);
    delete process.env.CRM_SEED_NOW;
  });

  it('creates a genuinely fresh onboarding database without demo records',async()=>{
    await runSeed('fresh');
    expect(new OnboardingRepository().getStatus()).toMatchObject({status:'provisioning',requiresOnboarding:true});
    expect((getSqliteConnection().prepare('SELECT count(*) AS count FROM organisations').get() as {count:number}).count).toBe(0);
    expect((getSqliteConnection().prepare('SELECT count(*) AS count FROM customers').get() as {count:number}).count).toBe(0);
  });

  it('stores verified logos outside the onboarding configuration payload',async()=>{
    await runSeed('demo');
    server=await startServer({host:'127.0.0.1',port:0});
    const upload=await fetch(`${server.url}/api/onboarding/assets`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contentBase64:ONE_PIXEL_PNG,mimeType:'image/png',fileName:'logo.png'})});
    expect(upload.status).toBe(201);
    const asset=BrandAssetReferenceSchema.parse(await upload.json());
    expect(asset).toMatchObject({mimeType:'image/png',width:1,height:1,byteSize:70});
    expect(fs.existsSync(path.join(getRuntimePaths().dataDirectory,'branding-assets',`${asset.checksum}.png`))).toBe(true);

    const workspaceResponse=await fetch(`${server.url}/api/onboarding/workspace`);
    const workspace=await workspaceResponse.json() as OnboardingWorkspace;
    const configuration={...workspace.draft.configuration,branding:{...workspace.draft.configuration.branding,logoUrl:asset.url,logoAsset:asset}};
    const saved=await fetch(`${server.url}/api/onboarding/draft`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({configuration,expectedChecksum:workspace.draft.checksum})});
    expect(saved.status).toBe(200);
    const savedText=await saved.text();
    expect(savedText.length).toBeLessThan(100_000);
    expect(savedText).not.toContain(ONE_PIXEL_PNG.slice(0,30));

    const served=await fetch(`${server.url}${asset.url}`);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toContain('image/png');
  });

  it('rejects MIME mismatches and records origin rejection diagnostics',async()=>{
    await runSeed('demo');
    expect(()=>new BrandAssetStore().store({contentBase64:ONE_PIXEL_PNG,mimeType:'image/jpeg',fileName:'false.jpg'})).toThrow('does not match');
    const logs:string[]=[];vi.spyOn(console,'log').mockImplementation((value?:unknown)=>{logs.push(String(value));});
    server=await startServer({host:'127.0.0.1',port:0});
    const response=await fetch(`${server.url}/api/onboarding/draft`,{method:'PUT',headers:{origin:'https://attacker.example','content-type':'application/json'},body:'{}'});
    expect(response.status).toBe(403);
    const body=await response.json() as {requestId:string};expect(body.requestId).toBeTruthy();
    await new Promise((resolve)=>setTimeout(resolve,10));
    expect(logs.some((line)=>line.includes(body.requestId)&&line.includes('origin-forbidden')&&line.includes('403'))).toBe(true);
  });
});
