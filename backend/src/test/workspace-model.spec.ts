import path from 'node:path';
import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { DEFAULT_ONBOARDING_CONFIGURATION,type OnboardingConfiguration } from 'shared/onboarding';
import { CustomerRepository } from '../infrastructure/database/repositories/CustomerRepository';
import { CustomFieldRepository } from '../infrastructure/database/repositories/CustomFieldRepository';
import { CustomObjectRepository } from '../infrastructure/database/repositories/CustomObjectRepository';
import { OnboardingRepository } from '../infrastructure/database/OnboardingRepository';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { CredentialVault } from '../infrastructure/security/CredentialVault';
import { getRuntimePaths } from '../config/runtimePaths';
import { LOCAL_OWNER_USER_ID } from '../infrastructure/database/wi8Wi9Schema';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { startServer,type RunningServer } from '../server';

function childcareConfiguration():OnboardingConfiguration{
  const configuration=structuredClone(DEFAULT_ONBOARDING_CONFIGURATION);
  configuration.deployment={...configuration.deployment,mode:'standalone',instanceSlug:'bright-stars',distributionMethod:'standalone'};
  configuration.identity={...configuration.identity,displayName:'Bright Stars',legalName:'Bright Stars Limited',email:'owner@bright-stars.example',phone:'+353 1 555 0100',address:'Kildare, Ireland',supportEmail:'owner@bright-stars.example'};
  configuration.businessProfile={...configuration.businessProfile,sector:'after-school-childcare',customerType:'consumers',booksAppointments:true,confirmed:true};
  configuration.dataModel={mode:'template',templateKey:'after-school-childcare',appliedTemplateKey:'after-school-childcare'};
  configuration.security={...configuration.security,backupConfigured:true,backupEncryptionConfirmed:true,recoveryPlanConfirmed:true,restoreRehearsed:true,retentionPolicyReviewed:true};
  return configuration;
}

function onboarding(){
  const root=path.join(getRuntimePaths().dataDirectory,'workspace-model-vault');
  return new OnboardingRepository(getSqliteConnection(),new CredentialVault(root),async()=>path.join(getRuntimePaths().internalBackupDirectory,'workspace-model.db'));
}

describe('active workspace model',()=>{
  let server:RunningServer|null=null;
  beforeEach(()=>{setupTempDatabase();process.env.CRM_TRUST_LOCAL_USERS='true';});
  afterEach(async()=>{await server?.close();server=null;delete process.env.CRM_TRUST_LOCAL_USERS;cleanupTempDatabase();});

  it('publishes the selected specialist model as employee-facing workspace metadata',async()=>{
    const objects=new CustomObjectRepository();
    const fields=new CustomFieldRepository();
    const child=await objects.createDefinition({name:'Child',pluralName:'Children',apiName:'child',description:'A child connected to their guardian.'});
    await fields.createDefinition({entityType:'child',name:'first_name',label:'First name',type:'text',options:[],required:true});
    const customer=await new CustomerRepository().create({firstName:'Niamh',lastName:'Byrne',email:'niamh@example.test',tags:[]});
    const record=await objects.createRecord({objectDefinitionId:child.id!,customerId:customer.id!});
    await objects.saveRecordValues(record.id!,{first_name:'Saoirse'});
    const saved=onboarding().saveDraft(childcareConfiguration(),LOCAL_OWNER_USER_ID);
    await onboarding().publish(LOCAL_OWNER_USER_ID,saved.draft.checksum);

    server=await startServer({host:'127.0.0.1',port:0});
    const response=await fetch(`${server.url}/api/workspace/model`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      sector:'after-school-childcare',
      mode:'template',
      templateKey:'after-school-childcare',
      templateName:'After-school childcare',
      customerCount:1,
      customerSingular:'Parent or guardian',
      customerPlural:'Families & guardians',
      definitions:[{name:'Child',pluralName:'Children',apiName:'child',recordCount:1,fields:[{name:'first_name'}]}],
    });
  });

  it('keeps duplicate field names scoped to their own specialist record type',async()=>{
    const objects=new CustomObjectRepository();
    const fields=new CustomFieldRepository();
    const customer=await new CustomerRepository().create({firstName:'Parent',lastName:'One',email:'parent@example.test',tags:[]});
    const child=await objects.createDefinition({name:'Child',pluralName:'Children',apiName:'child',description:''});
    const attendance=await objects.createDefinition({name:'Attendance',pluralName:'Attendance',apiName:'childcare_attendance',description:''});
    await fields.createDefinition({entityType:'child',name:'child_name',label:'Child',type:'text',options:[],required:true});
    await fields.createDefinition({entityType:'childcare_attendance',name:'child_name',label:'Child',type:'text',options:[],required:true});
    const record=await objects.createRecord({objectDefinitionId:attendance.id!,customerId:customer.id!});
    await objects.saveRecordValues(record.id!,{child_name:'Saoirse'});

    expect(await objects.getRecordValues(record.id!)).toEqual({child_name:'Saoirse'});
    const stored=(getSqliteConnection().prepare(`SELECT count(*) AS count FROM custom_objects_values WHERE record_id=?`).get(record.id) as {count:number}).count;
    expect(stored).toBe(1);
    expect(child.id).not.toBe(attendance.id);
  });
});
