import fs from 'node:fs';
import path from 'node:path';
import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { CreateEnrolmentSchema,DEFAULT_ONBOARDING_CONFIGURATION,type OnboardingConfiguration } from 'shared/onboarding';
import { getRuntimePaths } from '../config/runtimePaths';
import { OnboardingRepository } from '../infrastructure/database/OnboardingRepository';
import { SecurityRepository } from '../infrastructure/database/SecurityRepository';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { CredentialVault } from '../infrastructure/security/CredentialVault';
import { LOCAL_OWNER_USER_ID } from '../infrastructure/database/wi8Wi9Schema';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { startServer,type RunningServer } from '../server';

function validConfiguration(name='Northstar Operations'):OnboardingConfiguration{
  const configuration=structuredClone(DEFAULT_ONBOARDING_CONFIGURATION);
  configuration.deployment={...configuration.deployment,mode:'managed',instanceSlug:'northstar-operations',instanceUrl:'https://crm.northstar.example',expectedUsers:48,distributionMethod:'managed-installer'};
  configuration.identity={...configuration.identity,displayName:name,legalName:`${name} Limited`,email:'owner@northstar.example',phone:'+353 1 555 0100',website:'https://northstar.example',address:'1 Operations Square, Dublin',supportEmail:'support@northstar.example',privacyEmail:'privacy@northstar.example'};
  configuration.security={...configuration.security,backupConfigured:true,backupEncryptionConfirmed:true,recoveryPlanConfirmed:true,restoreRehearsed:true,retentionPolicyReviewed:true,requireHttps:true};
  return configuration;
}

function repository(){const root=path.join(getRuntimePaths().dataDirectory,'wi12-test-vault');return new OnboardingRepository(getSqliteConnection(),new CredentialVault(root),async()=>path.join(getRuntimePaths().internalBackupDirectory,'pre-publication-test.db'));}

describe('WI12 instance onboarding and deployment profiles',()=>{
  beforeEach(()=>{setupTempDatabase();process.env.CRM_TRUST_LOCAL_USERS='true';});
  afterEach(()=>{delete process.env.CRM_TRUST_LOCAL_USERS;cleanupTempDatabase();});

  it('creates a resumable draft and grants bounded onboarding permissions',()=>{
    const workspace=repository().getWorkspace();expect(workspace.instance.status).toBe('provisioning');expect(workspace.draft.state).toBe('draft');expect(workspace.readiness.publishable).toBe(false);
    const owner=new SecurityRepository().getUser(LOCAL_OWNER_USER_ID)!;expect(owner.permissions).toEqual(expect.arrayContaining(['onboarding.read','onboarding.manage','deployment.publish','devices.manage']));
    expect(workspace.history).toHaveLength(1);expect((workspace.history[0] as Record<string,unknown>).configuration).toBeUndefined();
  });

  it('autosaves incomplete drafts without exposing credential-bearing fields',()=>{
    const onboarding=repository();const incomplete=structuredClone(DEFAULT_ONBOARDING_CONFIGURATION);incomplete.identity.displayName='Draft company';const saved=onboarding.saveDraft(incomplete,LOCAL_OWNER_USER_ID);expect(saved.draft.configuration.identity.displayName).toBe('Draft company');expect(saved.readiness.publishable).toBe(false);
    expect(()=>onboarding.saveDraft({...incomplete,apiToken:'not-allowed'},LOCAL_OWNER_USER_ID)).toThrow('cannot contain credentials');
  });

  it('validates, backs up, signs and atomically publishes a secret-free profile',async()=>{
    const onboarding=repository();const configuration=validConfiguration();onboarding.saveDraft(configuration,LOCAL_OWNER_USER_ID);const readiness=onboarding.validateDraft(LOCAL_OWNER_USER_ID);expect(readiness.publishable).toBe(true);expect(readiness.failures).toBe(0);
    const published=await onboarding.publish(LOCAL_OWNER_USER_ID);expect(published.backupPath).toContain('pre-publication-test.db');expect(published.workspace.instance.status).toBe('active');expect(published.workspace.published?.state).toBe('published');expect(published.workspace.draft.revision).toBe(2);
    const verified=OnboardingRepository.verifySignedProfile(published.deploymentProfile);expect(verified.profile.businessIdentity.displayName).toBe('Northstar Operations');expect(verified.profile.instanceUrl).toBe('https://crm.northstar.example');expect(JSON.stringify(verified)).not.toMatch(/password|privateKey|accessKey/i);
    const settings=getSqliteConnection().prepare(`SELECT business_name,currency,timezone FROM settings WHERE id='default'`).get() as {business_name:string;currency:string;timezone:string};expect(settings).toEqual({business_name:'Northstar Operations',currency:'EUR',timezone:'Europe/Dublin'});
    expect(()=>getSqliteConnection().prepare(`UPDATE instance_publications SET checksum=?`).run('0'.repeat(64))).toThrow('immutable');
  });

  it('rejects profile tampering and creates a new immutable publication for rollback',async()=>{
    const onboarding=repository();onboarding.saveDraft(validConfiguration('First Identity'),LOCAL_OWNER_USER_ID);const first=await onboarding.publish(LOCAL_OWNER_USER_ID);const firstRevisionId=first.workspace.published!.id;
    onboarding.saveDraft(validConfiguration('Second Identity'),LOCAL_OWNER_USER_ID);const second=await onboarding.publish(LOCAL_OWNER_USER_ID);expect(second.deploymentProfile.profile.businessIdentity.displayName).toBe('Second Identity');
    const tampered=structuredClone(second.deploymentProfile);tampered.profile.businessIdentity.displayName='Attacker';expect(()=>OnboardingRepository.verifySignedProfile(tampered)).toThrow('checksum');
    const rolledBack=await onboarding.rollback(firstRevisionId,LOCAL_OWNER_USER_ID);expect(rolledBack.deploymentProfile.profile.businessIdentity.displayName).toBe('First Identity');expect(rolledBack.deploymentProfile.profile.configurationRevision).toBeGreaterThan(second.deploymentProfile.profile.configurationRevision);
  });

  it('stores one-time enrolments as hashes and binds a scoped user session to one device',async()=>{
    const onboarding=repository();onboarding.saveDraft(validConfiguration(),LOCAL_OWNER_USER_ID);await onboarding.publish(LOCAL_OWNER_USER_ID);const security=new SecurityRepository();const employee=security.createUser({email:'employee@northstar.example',displayName:'Northstar Employee',roleKeys:['member'],password:'a sufficiently long employee password'});
    const issued=onboarding.createEnrolment(CreateEnrolmentSchema.parse({userId:employee.id,deviceLimit:1}),LOCAL_OWNER_USER_ID);const stored=getSqliteConnection().prepare(`SELECT code_hash,code_prefix FROM instance_enrolments WHERE id=?`).get(issued.id) as {code_hash:string;code_prefix:string};expect(stored.code_hash).toHaveLength(64);expect(stored.code_hash).not.toContain(issued.code);expect(stored.code_prefix).toBe(issued.codePrefix);expect(JSON.stringify(onboarding.listEnrolments())).not.toContain(issued.code);
    const redeemed=onboarding.redeemEnrolment({code:issued.code,deviceName:'Employee laptop',deviceFingerprint:'device-fingerprint-00000001'});expect(redeemed.user?.id).toBe(employee.id);expect(security.resolveSession(redeemed.sessionToken)?.id).toBe(employee.id);expect(onboarding.listDevices()).toHaveLength(1);expect(()=>onboarding.redeemEnrolment({code:issued.code,deviceName:'Second laptop',deviceFingerprint:'device-fingerprint-00000002'})).toThrow('device limit');
    onboarding.revokeDevice(redeemed.deviceId);expect(security.resolveSession(redeemed.sessionToken)).toBeNull();
  });

  it('keeps draft APIs private while allowing signed profile discovery and enrolment redemption',async()=>{
    const onboarding=repository();onboarding.saveDraft(validConfiguration(),LOCAL_OWNER_USER_ID);await onboarding.publish(LOCAL_OWNER_USER_ID);const security=new SecurityRepository();const employee=security.createUser({email:'route-employee@northstar.example',displayName:'Route Employee',roleKeys:['member']});const issued=onboarding.createEnrolment(CreateEnrolmentSchema.parse({userId:employee.id,deviceLimit:1}),LOCAL_OWNER_USER_ID);const ownerSession=security.createSession(LOCAL_OWNER_USER_ID);process.env.CRM_TRUST_LOCAL_USERS='false';let server:RunningServer|null=null;
    try{
      server=await startServer({host:'127.0.0.1',port:0});
      const publicProfile=await fetch(`${server.url}/api/onboarding/public-profile`);expect(publicProfile.status).toBe(200);expect((await publicProfile.json() as any).signature).toBeTruthy();
      const privateDraft=await fetch(`${server.url}/api/onboarding/workspace`);expect(privateDraft.status).toBe(401);
      const authorised=await fetch(`${server.url}/api/onboarding/workspace`,{headers:{authorization:`Bearer ${ownerSession.token}`}});expect(authorised.status).toBe(200);
      const redeemed=await fetch(`${server.url}/api/onboarding/enrolments/redeem`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:issued.code,deviceName:'Route laptop',deviceFingerprint:'route-device-fingerprint-0001'})});expect(redeemed.status).toBe(200);const redemption=await redeemed.json() as any;expect(redemption.sessionToken).toBeTruthy();
      await new Promise((resolve)=>setTimeout(resolve,20));const audit=security.listAudit({action:'post.onboarding'});expect(JSON.stringify(audit)).not.toContain(issued.code);expect(JSON.stringify(audit)).not.toContain(redemption.sessionToken);
    }finally{await server?.close();}
  });
});
