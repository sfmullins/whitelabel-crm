import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  OnboardingImportCommitRequestSchema,
  OnboardingImportMappingSchema,
  OnboardingImportPreviewRequestSchema,
  OnboardingImportPreviewSchema,
  OnboardingImportResultSchema,
  type OnboardingImportCommitRequest,
  type OnboardingImportMapping,
  type OnboardingImportPreview,
  type OnboardingImportPreviewRequest,
  type OnboardingImportResult,
} from 'shared/onboarding-import';
import { ValidationError } from '../../application/errors';
import { parseCSV,type CSVImportRow } from '../../infrastructure/import/CSVImporter';
import { sqlite } from '../../infrastructure/database/connection';
import { DEFAULT_INSTANCE_ID } from '../../infrastructure/database/wi12OnboardingSchema';
import { canonicalJson } from '../../infrastructure/database/OnboardingRepository';

const MAX_ROWS=10_000;
const statusValues=new Set(['prospect','active_client','past_client','partner','inactive']);
const now=()=>new Date().toISOString();
const sha256=(value:string)=>crypto.createHash('sha256').update(value,'utf8').digest('hex');
const normalize=(value:string)=>value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
const clean=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():null;
const lower=(value:string)=>value.trim().toLocaleLowerCase('en');
const truthy=new Set(['1','true','yes','y','primary']);

const aliases:Record<keyof OnboardingImportMapping,string[]>={
  organisationName:['organisation','organisationname','organization','organizationname','company','companyname','account','accountname','client','clientname'],
  organisationLegalName:['legalname','organisationlegalname','organizationlegalname','registeredname'],
  organisationWebsite:['website','url','companywebsite','organisationwebsite'],
  organisationIndustry:['industry','sector','vertical'],
  organisationCountry:['country','countrycode'],
  organisationStatus:['status','organisationstatus','accountstatus'],
  contactFirstName:['firstname','contactfirstname','givenname'],
  contactLastName:['lastname','contactlastname','surname','familyname'],
  contactEmail:['email','emailaddress','contactemail'],
  contactPhone:['phone','telephone','contactphone','mobile'],
  contactJobTitle:['jobtitle','title','role','contacttitle'],
  contactIsPrimary:['isprimary','primarycontact','primary'],
};

function headers(rows:CSVImportRow[]):string[]{return rows.length?Object.keys(rows[0]):[];}
function suggestedMapping(columns:string[]):OnboardingImportMapping{
  const indexed=new Map(columns.map((column)=>[normalize(column),column]));
  const guess=(key:keyof OnboardingImportMapping)=>aliases[key].map((alias)=>indexed.get(alias)).find(Boolean)??null;
  const organisationName=guess('organisationName');
  if(!organisationName)throw new ValidationError('No organisation-name column could be detected. Select the correct column before previewing.');
  return OnboardingImportMappingSchema.parse({
    organisationName,
    organisationLegalName:guess('organisationLegalName'),organisationWebsite:guess('organisationWebsite'),organisationIndustry:guess('organisationIndustry'),organisationCountry:guess('organisationCountry'),organisationStatus:guess('organisationStatus'),
    contactFirstName:guess('contactFirstName'),contactLastName:guess('contactLastName'),contactEmail:guess('contactEmail'),contactPhone:guess('contactPhone'),contactJobTitle:guess('contactJobTitle'),contactIsPrimary:guess('contactIsPrimary'),
  });
}
function mappedValue(row:CSVImportRow,column:string|null):string|null{return column?clean(row[column]):null;}
function normalizeStatus(value:string|null):string{
  if(!value)return 'prospect';
  const normalized=value.trim().toLowerCase().replace(/[ -]+/g,'_');
  const aliases:Record<string,string>={active:'active_client',client:'active_client',past:'past_client',former:'past_client'};
  return aliases[normalized]??normalized;
}
function validUrl(value:string|null):boolean{if(!value)return true;try{const url=new URL(value);return url.protocol==='http:'||url.protocol==='https:';}catch{return false;}}
function validCountry(value:string|null):boolean{return !value||/^[A-Za-z]{2}$/.test(value);}
function validEmail(value:string|null):boolean{return !value||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);}
function fingerprint(input:{csvData:string;mapping:OnboardingImportMapping;duplicateStrategy:string;target:string}):string{return sha256(canonicalJson(input));}

interface NormalizedRow {
  rowNumber:number;
  organisationName:string;
  legalName:string|null;
  website:string|null;
  industry:string|null;
  country:string|null;
  status:string;
  firstName:string|null;
  lastName:string|null;
  email:string|null;
  phone:string|null;
  jobTitle:string|null;
  isPrimary:boolean;
  hasContact:boolean;
}

export class OnboardingImportService {
  constructor(private readonly connection:Database.Database=sqlite as Database.Database){}

  async preview(value:unknown):Promise<OnboardingImportPreview>{
    const input=OnboardingImportPreviewRequestSchema.parse(value) as OnboardingImportPreviewRequest;
    const rows=await parseCSV(input.csvData);
    if(!rows.length)throw new ValidationError('The CSV file is empty or has no data rows');
    if(rows.length>MAX_ROWS)throw new ValidationError(`Onboarding import is limited to ${MAX_ROWS.toLocaleString()} rows per run`);
    const columns=headers(rows);
    const detected=suggestedMapping(columns);
    const mapping=OnboardingImportMappingSchema.parse({...detected,...(input.mapping??{})});
    for(const [key,column] of Object.entries(mapping))if(column&&!columns.includes(column))throw new ValidationError(`Mapped column "${column}" for ${key} does not exist in the CSV header`);
    return this.buildPreview(rows,input.csvData,mapping,input.duplicateStrategy,input.target);
  }

  async commit(value:unknown,actorUserId:string|null):Promise<OnboardingImportResult>{
    const input=OnboardingImportCommitRequestSchema.parse(value) as OnboardingImportCommitRequest;
    const rows=await parseCSV(input.csvData);
    if(!rows.length||rows.length>MAX_ROWS)throw new ValidationError('The CSV row count is outside the supported onboarding import range');
    const preview=this.buildPreview(rows,input.csvData,input.mapping,input.duplicateStrategy,input.target);
    if(preview.checksum!==input.previewChecksum)throw new ValidationError('The CSV, mapping or duplicate strategy changed after preview. Preview the import again.');
    const blocking=preview.issues.filter((issue)=>issue.severity==='error');
    if(blocking.length)throw new ValidationError('The import contains release-blocking row errors',blocking);

    const normalized=this.normalizeRows(rows,input.mapping);
    const runId=crypto.randomUUID();const completedAt=now();let organisationsCreated=0;let contactsCreated=0;let duplicatesSkipped=0;
    this.connection.transaction(()=>{
      const existingOrganisations=new Map((this.connection.prepare(`SELECT id,name FROM organisations WHERE archived_at IS NULL`).all() as Array<{id:string;name:string}>).map((row)=>[lower(row.name),row.id]));
      const existingEmails=new Set((this.connection.prepare(`SELECT lower(email) AS email FROM contacts WHERE archived_at IS NULL AND email IS NOT NULL`).all() as Array<{email:string}>).map((row)=>row.email));
      const primaryByOrganisation=new Set((this.connection.prepare(`SELECT organisation_id FROM contacts WHERE archived_at IS NULL AND status='active' AND is_primary=1`).all() as Array<{organisation_id:string}>).map((row)=>row.organisation_id));
      const insertedOrganisations=new Map<string,string>();
      const insertOrganisation=this.connection.prepare(`INSERT INTO organisations(id,name,legal_name,website,industry,employee_band,annual_revenue_band,country,status,source,created_at,updated_at,archived_at) VALUES(@id,@name,@legalName,@website,@industry,NULL,NULL,@country,@status,'onboarding-import',@createdAt,@updatedAt,NULL)`);
      const insertContact=this.connection.prepare(`INSERT INTO contacts(id,organisation_id,first_name,last_name,job_title,email,phone,is_primary,status,created_at,updated_at,archived_at) VALUES(@id,@organisationId,@firstName,@lastName,@jobTitle,@email,@phone,@isPrimary,'active',@createdAt,@updatedAt,NULL)`);
      for(const row of normalized){
        const organisationKey=lower(row.organisationName);let organisationId=insertedOrganisations.get(organisationKey)??existingOrganisations.get(organisationKey)??null;
        if(!organisationId){
          organisationId=crypto.randomUUID();insertOrganisation.run({id:organisationId,name:row.organisationName,legalName:row.legalName,website:row.website,industry:row.industry,country:row.country?.toUpperCase()??null,status:row.status,createdAt:completedAt,updatedAt:completedAt});insertedOrganisations.set(organisationKey,organisationId);organisationsCreated+=1;
        }else if(existingOrganisations.has(organisationKey)&&!insertedOrganisations.has(organisationKey)){
          if(input.duplicateStrategy==='reject')throw new ValidationError(`Organisation "${row.organisationName}" already exists`);
          duplicatesSkipped+=1;continue;
        }
        if(!row.hasContact)continue;
        if(row.email&&existingEmails.has(lower(row.email))){if(input.duplicateStrategy==='reject')throw new ValidationError(`Contact email "${row.email}" already exists`);duplicatesSkipped+=1;continue;}
        const isPrimary=row.isPrimary&&!primaryByOrganisation.has(organisationId);insertContact.run({id:crypto.randomUUID(),organisationId,firstName:row.firstName,lastName:row.lastName,jobTitle:row.jobTitle,email:row.email?.toLowerCase()??null,phone:row.phone,isPrimary:isPrimary?1:0,createdAt:completedAt,updatedAt:completedAt});if(row.email)existingEmails.add(lower(row.email));if(isPrimary)primaryByOrganisation.add(organisationId);contactsCreated+=1;
      }
      const result={runId,checksum:preview.checksum,organisationsCreated,contactsCreated,duplicatesSkipped,completedAt};
      this.connection.prepare(`INSERT INTO instance_import_runs(id,instance_id,target,checksum,mapping_json,duplicate_strategy,status,row_count,organisations_created,contacts_created,duplicates_skipped,result_json,created_by_user_id,created_at,completed_at) VALUES(?,?,?,?,?,?,'completed',?,?,?,?,?,?,?,?)`).run(runId,DEFAULT_INSTANCE_ID,input.target,preview.checksum,canonicalJson(input.mapping),input.duplicateStrategy,rows.length,organisationsCreated,contactsCreated,duplicatesSkipped,canonicalJson(result),actorUserId,completedAt,completedAt);
    })();
    return OnboardingImportResultSchema.parse({runId,checksum:preview.checksum,organisationsCreated,contactsCreated,duplicatesSkipped,completedAt});
  }

  history(limit=50):unknown[]{
    return (this.connection.prepare(`SELECT id,target,checksum,duplicate_strategy,status,row_count,organisations_created,contacts_created,duplicates_skipped,created_at,completed_at FROM instance_import_runs WHERE instance_id=? ORDER BY created_at DESC LIMIT ?`).all(DEFAULT_INSTANCE_ID,Math.max(1,Math.min(200,limit))) as Array<Record<string,unknown>>).map((row)=>({id:row.id,target:row.target,checksum:row.checksum,duplicateStrategy:row.duplicate_strategy,status:row.status,rowCount:row.row_count,organisationsCreated:row.organisations_created,contactsCreated:row.contacts_created,duplicatesSkipped:row.duplicates_skipped,createdAt:row.created_at,completedAt:row.completed_at}));
  }

  private buildPreview(rows:CSVImportRow[],csvData:string,mapping:OnboardingImportMapping,duplicateStrategy:'skip'|'reject',target:'organisations-and-contacts'):OnboardingImportPreview{
    const normalized=this.normalizeRows(rows,mapping);const issues:Array<{row:number;field:string;severity:'error'|'warning';message:string}>=[];
    const existingOrganisations=new Set((this.connection.prepare(`SELECT lower(name) AS name FROM organisations WHERE archived_at IS NULL`).all() as Array<{name:string}>).map((row)=>row.name));
    const existingEmails=new Set((this.connection.prepare(`SELECT lower(email) AS email FROM contacts WHERE archived_at IS NULL AND email IS NOT NULL`).all() as Array<{email:string}>).map((row)=>row.email));
    const newOrganisations=new Set<string>();const newEmails=new Set<string>();const primaryCounts=new Map<string,number>();let duplicates=0;let contacts=0;
    for(const row of normalized){
      if(!row.organisationName)issues.push({row:row.rowNumber,field:'organisationName',severity:'error',message:'Organisation name is required'});
      if(!validUrl(row.website))issues.push({row:row.rowNumber,field:'organisationWebsite',severity:'error',message:'Website must be an absolute HTTP or HTTPS URL'});
      if(!validCountry(row.country))issues.push({row:row.rowNumber,field:'organisationCountry',severity:'error',message:'Country must be a two-letter code'});
      if(!statusValues.has(row.status))issues.push({row:row.rowNumber,field:'organisationStatus',severity:'error',message:`Unsupported organisation status: ${row.status}`});
      if(!validEmail(row.email))issues.push({row:row.rowNumber,field:'contactEmail',severity:'error',message:'Contact email is not valid'});
      if(row.hasContact&&!row.firstName&&!row.lastName&&!row.email)issues.push({row:row.rowNumber,field:'contact',severity:'error',message:'A contact requires a first name, last name or email'});
      const orgKey=lower(row.organisationName);if(existingOrganisations.has(orgKey)){duplicates+=1;issues.push({row:row.rowNumber,field:'organisationName',severity:duplicateStrategy==='reject'?'error':'warning',message:`Organisation "${row.organisationName}" already exists and will ${duplicateStrategy==='skip'?'be skipped':'block the import'}`});}else newOrganisations.add(orgKey);
      if(row.email){const emailKey=lower(row.email);if(existingEmails.has(emailKey)||newEmails.has(emailKey)){duplicates+=1;issues.push({row:row.rowNumber,field:'contactEmail',severity:duplicateStrategy==='reject'?'error':'warning',message:`Contact email "${row.email}" is duplicated and will ${duplicateStrategy==='skip'?'be skipped':'block the import'}`});}else newEmails.add(emailKey);}
      if(row.hasContact)contacts+=1;if(row.isPrimary){const count=(primaryCounts.get(orgKey)??0)+1;primaryCounts.set(orgKey,count);if(count>1)issues.push({row:row.rowNumber,field:'contactIsPrimary',severity:'error',message:'Only one imported contact may be primary for an organisation'});}
    }
    const invalidRows=new Set(issues.filter((issue)=>issue.severity==='error').map((issue)=>issue.row)).size;
    return OnboardingImportPreviewSchema.parse({checksum:fingerprint({csvData,mapping,duplicateStrategy,target}),target,headers:headers(rows),mapping,rowCount:rows.length,validRows:rows.length-invalidRows,invalidRows,organisationsToCreate:newOrganisations.size,contactsToCreate:Math.max(0,contacts-duplicates),duplicatesToSkip:duplicateStrategy==='skip'?duplicates:0,issues,sample:rows.slice(0,8),previewedAt:now()});
  }

  private normalizeRows(rows:CSVImportRow[],mapping:OnboardingImportMapping):NormalizedRow[]{
    return rows.map((row,index)=>{const firstName=mappedValue(row,mapping.contactFirstName);const lastName=mappedValue(row,mapping.contactLastName);const email=mappedValue(row,mapping.contactEmail);const phone=mappedValue(row,mapping.contactPhone);const jobTitle=mappedValue(row,mapping.contactJobTitle);return {rowNumber:index+1,organisationName:mappedValue(row,mapping.organisationName)??'',legalName:mappedValue(row,mapping.organisationLegalName),website:mappedValue(row,mapping.organisationWebsite),industry:mappedValue(row,mapping.organisationIndustry),country:mappedValue(row,mapping.organisationCountry),status:normalizeStatus(mappedValue(row,mapping.organisationStatus)),firstName,lastName,email,phone,jobTitle,isPrimary:truthy.has((mappedValue(row,mapping.contactIsPrimary)??'').toLowerCase()),hasContact:Boolean(firstName||lastName||email||phone||jobTitle)};});
  }
}
