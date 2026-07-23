import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { OnboardingImportService } from '../application/services/OnboardingImportService';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { LOCAL_OWNER_USER_ID } from '../infrastructure/database/wi8Wi9Schema';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';

const csv=`Company,Legal Name,Website,Industry,Country,Status,First Name,Last Name,Email,Phone,Job Title,Primary
Northstar Operations,Northstar Operations Limited,https://northstar.example,Consulting,IE,Active Client,Ada,Lovelace,ada@northstar.example,+35315550100,Managing Director,yes
Northstar Operations,Northstar Operations Limited,https://northstar.example,Consulting,IE,Active Client,Grace,Hopper,grace@northstar.example,+35315550101,Operations Lead,no
Acme Field Services,Acme Field Services Limited,https://acme.example,Field Services,GB,Prospect,Sam,Rivera,sam@acme.example,+44205550100,Owner,yes`;

const mapping={organisationName:'Company',organisationLegalName:'Legal Name',organisationWebsite:'Website',organisationIndustry:'Industry',organisationCountry:'Country',organisationStatus:'Status',contactFirstName:'First Name',contactLastName:'Last Name',contactEmail:'Email',contactPhone:'Phone',contactJobTitle:'Job Title',contactIsPrimary:'Primary'};

describe('WI12 guided onboarding import',()=>{
  beforeEach(()=>setupTempDatabase());
  afterEach(()=>cleanupTempDatabase());

  it('detects columns, validates rows and previews one organisation with multiple contacts',async()=>{
    const service=new OnboardingImportService(getSqliteConnection());
    const preview=await service.preview({csvData:csv,duplicateStrategy:'skip'});
    expect(preview.headers).toContain('Company');
    expect(preview.mapping.organisationName).toBe('Company');
    expect(preview.rowCount).toBe(3);
    expect(preview.invalidRows).toBe(0);
    expect(preview.organisationsToCreate).toBe(2);
    expect(preview.checksum).toHaveLength(64);
  });

  it('requires an unchanged preview and commits the entire import transactionally',async()=>{
    const connection=getSqliteConnection();const service=new OnboardingImportService(connection);
    const preview=await service.preview({csvData:csv,mapping,duplicateStrategy:'skip'});
    const result=await service.commit({csvData:csv,mapping,duplicateStrategy:'skip',previewChecksum:preview.checksum},LOCAL_OWNER_USER_ID);
    expect(result.organisationsCreated).toBe(2);
    expect(result.contactsCreated).toBe(3);
    expect((connection.prepare(`SELECT count(*) AS count FROM organisations WHERE source='onboarding-import'`).get() as {count:number}).count).toBe(2);
    expect((connection.prepare(`SELECT count(*) AS count FROM contacts WHERE email LIKE '%@northstar.example'`).get() as {count:number}).count).toBe(2);
    expect(service.history()).toEqual([expect.objectContaining({id:result.runId,status:'completed',rowCount:3,organisationsCreated:2,contactsCreated:3})]);
    await expect(service.commit({csvData:`${csv}\nChanged Company,,,,,,,,,,,`,mapping,duplicateStrategy:'skip',previewChecksum:preview.checksum},LOCAL_OWNER_USER_ID)).rejects.toThrow('changed after preview');
  });

  it('reports blocking validation errors without partially mutating the database',async()=>{
    const connection=getSqliteConnection();const service=new OnboardingImportService(connection);
    const invalid=`Company,Website,Email\nBroken,not-a-url,not-an-email\nValid,https://valid.example,valid@example.test`;
    const preview=await service.preview({csvData:invalid,mapping:{organisationName:'Company',organisationWebsite:'Website',contactEmail:'Email'},duplicateStrategy:'reject'});
    expect(preview.invalidRows).toBe(1);
    await expect(service.commit({csvData:invalid,mapping:preview.mapping,duplicateStrategy:'reject',previewChecksum:preview.checksum},LOCAL_OWNER_USER_ID)).rejects.toThrow('release-blocking');
    expect((connection.prepare(`SELECT count(*) AS count FROM organisations WHERE source='onboarding-import'`).get() as {count:number}).count).toBe(0);
  });

  it('detects existing organisations and supports explicit skip or reject behaviour',async()=>{
    const connection=getSqliteConnection();connection.prepare(`INSERT INTO organisations(id,name,status,created_at,updated_at) VALUES('00000000-0000-4000-8000-000000009999','Northstar Operations','active_client',datetime('now'),datetime('now'))`).run();const service=new OnboardingImportService(connection);
    const skipped=await service.preview({csvData:csv,mapping,duplicateStrategy:'skip'});expect(skipped.duplicatesToSkip).toBeGreaterThan(0);expect(skipped.issues.some((issue)=>issue.severity==='warning')).toBe(true);
    const rejected=await service.preview({csvData:csv,mapping,duplicateStrategy:'reject'});expect(rejected.issues.some((issue)=>issue.severity==='error'&&issue.field==='organisationName')).toBe(true);
  });
});
