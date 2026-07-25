import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { parseCSV } from '../../infrastructure/import/CSVImporter';
import { getSqliteConnection } from '../../infrastructure/database/connection';
import type { CrmRequest } from '../middleware/security';

const router = Router();
const requestSchema = z.object({
  targetKey: z.string().trim().min(1),
  filename: z.string().trim().min(1).max(240),
  csvData: z.string().min(1).max(10_000_000),
  mapping: z.record(z.string(), z.string()).default({}),
});

interface ImportField {
  key:string;
  label:string;
  required:boolean;
  kind:'standard'|'custom'|'connection';
  fieldId?:string;
}
interface ImportTarget {
  key:string;
  label:string;
  definitionId:string|null;
  fields:ImportField[];
}
interface ImportIssue {row:number;field:string;message:string;}

const customerStandard:ImportField[]=[
  {key:'firstName',label:'First name',required:true,kind:'standard'},
  {key:'lastName',label:'Last name',required:true,kind:'standard'},
  {key:'email',label:'Email',required:true,kind:'standard'},
  {key:'company',label:'Company',required:false,kind:'standard'},
  {key:'phone',label:'Phone',required:false,kind:'standard'},
  {key:'mobile',label:'Mobile',required:false,kind:'standard'},
  {key:'address',label:'Address',required:false,kind:'standard'},
  {key:'notes',label:'Notes',required:false,kind:'standard'},
  {key:'tags',label:'Tags',required:false,kind:'standard'},
];
const organisationStandard:ImportField[]=[
  {key:'name',label:'Organisation name',required:true,kind:'standard'},
  {key:'legalName',label:'Legal name',required:false,kind:'standard'},
  {key:'website',label:'Website',required:false,kind:'standard'},
  {key:'industry',label:'Industry',required:false,kind:'standard'},
  {key:'employeeBand',label:'Employee band',required:false,kind:'standard'},
  {key:'annualRevenueBand',label:'Annual revenue band',required:false,kind:'standard'},
  {key:'country',label:'Country',required:false,kind:'standard'},
  {key:'status',label:'Status',required:false,kind:'standard'},
  {key:'source',label:'Source',required:false,kind:'standard'},
];
const contactStandard:ImportField[]=[
  {key:'organisationName',label:'Organisation name',required:true,kind:'connection'},
  {key:'firstName',label:'First name',required:false,kind:'standard'},
  {key:'lastName',label:'Last name',required:false,kind:'standard'},
  {key:'jobTitle',label:'Job title',required:false,kind:'standard'},
  {key:'email',label:'Email',required:false,kind:'standard'},
  {key:'phone',label:'Phone',required:false,kind:'standard'},
  {key:'status',label:'Status',required:false,kind:'standard'},
];

function targets():ImportTarget[]{
  const connection=getSqliteConnection();
  const fieldRows=connection.prepare(`
    SELECT id,entity_type AS entityType,name,label,required FROM custom_fields_definition ORDER BY created_at
  `).all() as Array<{id:string;entityType:string;name:string;label:string;required:number}>;
  const customerFields=fieldRows.filter((field)=>field.entityType==='customer')
    .map((field)=>({key:`custom:${field.name}`,label:field.label,required:Boolean(field.required),kind:'custom' as const,fieldId:field.id}));
  const definitions=connection.prepare(`
    SELECT id,api_name AS apiName,plural_name AS pluralName FROM custom_objects_definition ORDER BY plural_name
  `).all() as Array<{id:string;apiName:string;pluralName:string}>;
  return [
    {key:'organisations',label:'Organisations',definitionId:null,fields:organisationStandard},
    {key:'contacts',label:'Contacts',definitionId:null,fields:contactStandard},
    {key:'customers',label:'Customers',definitionId:null,fields:[...customerStandard,...customerFields]},
    ...definitions.map((definition)=>({
      key:`object:${definition.apiName}`,
      label:definition.pluralName,
      definitionId:definition.id,
      fields:[
        {key:'customerEmail',label:'Connected customer email',required:true,kind:'connection' as const},
        ...fieldRows.filter((field)=>field.entityType===definition.apiName)
          .map((field)=>({key:`custom:${field.name}`,label:field.label,required:Boolean(field.required),kind:'custom' as const,fieldId:field.id})),
      ],
    })),
  ];
}

function normalize(value:string):string{return value.toLowerCase().replace(/[^a-z0-9]/g,'');}
function inferredMapping(headers:string[],fields:ImportField[]):Record<string,string>{
  const result:Record<string,string>={};
  for(const field of fields){
    const candidates=[field.key.replace(/^custom:/,''),field.label];
    const match=headers.find((header)=>candidates.some((candidate)=>normalize(candidate)===normalize(header)));
    if(match)result[field.key]=match;
  }
  return result;
}
function valueFor(row:Record<string,string>,mapping:Record<string,string>,key:string):string{
  return String(row[mapping[key]??'']??'').trim();
}
function validateRows(rows:Record<string,string>[],target:ImportTarget,mapping:Record<string,string>):ImportIssue[]{
  const issues:ImportIssue[]=[];
  rows.forEach((row,index)=>{
    for(const field of target.fields){
      const value=valueFor(row,mapping,field.key);
      if(field.required&&!value)issues.push({row:index+2,field:field.label,message:'Required value is missing'});
      if((field.key==='email'||field.key==='customerEmail')&&value&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)){
        issues.push({row:index+2,field:field.label,message:'Enter a valid email address'});
      }
    }
    if(target.key==='contacts'&&!['firstName','lastName','email'].some((key)=>valueFor(row,mapping,key))){
      issues.push({row:index+2,field:'Contact identity',message:'Provide a first name, last name or email address'});
    }
    const status=valueFor(row,mapping,'status');
    if(target.key==='organisations'&&status&&!['prospect','active_client','past_client','partner','inactive'].includes(status)){
      issues.push({row:index+2,field:'Status',message:'Use prospect, active_client, past_client, partner or inactive'});
    }
    if(target.key==='contacts'&&status&&!['active','inactive'].includes(status)){
      issues.push({row:index+2,field:'Status',message:'Use active or inactive'});
    }
  });
  return issues;
}
function selectedTarget(key:string):ImportTarget{
  const target=targets().find((item)=>item.key===key);
  if(!target)throw new Error('The selected import target is no longer available');
  return target;
}

router.get('/targets',(_request,response,next)=>{
  try{response.json(targets());}catch(error){next(error);}
});

router.post('/preview',async(request,response,next)=>{
  try{
    const input=requestSchema.parse(request.body);
    const target=selectedTarget(input.targetKey);
    const rows=await parseCSV(input.csvData);
    if(!rows.length)return response.status(400).json({error:'EMPTY_IMPORT',message:'The CSV has a header but no data rows'});
    if(rows.length>10_000)return response.status(413).json({error:'IMPORT_TOO_LARGE',message:'Import at most 10,000 rows at a time'});
    const headers=Object.keys(rows[0]??{});
    const mapping=Object.keys(input.mapping).length?input.mapping:inferredMapping(headers,target.fields);
    const issues=validateRows(rows,target,mapping);
    response.json({
      target,headers,mapping,rowCount:rows.length,validRowCount:rows.length-new Set(issues.map((issue)=>issue.row)).size,
      issues:issues.slice(0,500),previewRows:rows.slice(0,8),
    });
  }catch(error){next(error);}
});

router.post('/execute',async(request:CrmRequest,response,next)=>{
  try{
    const input=requestSchema.parse(request.body);
    const target=selectedTarget(input.targetKey);
    const rows=await parseCSV(input.csvData);
    if(!rows.length)return response.status(400).json({error:'EMPTY_IMPORT',message:'The CSV has no data rows'});
    if(rows.length>10_000)return response.status(413).json({error:'IMPORT_TOO_LARGE',message:'Import at most 10,000 rows at a time'});
    const issues=validateRows(rows,target,input.mapping);
    const invalidRows=new Set(issues.map((issue)=>issue.row));
    const connection=getSqliteConnection();
    const now=new Date().toISOString();
    let importedCount=0;
    const importIssues=[...issues];
    const writeRow=connection.transaction((row:Record<string,string>)=>{
      if(target.key==='organisations'){
        const id=crypto.randomUUID();
        const standard=Object.fromEntries(organisationStandard.map((field)=>[field.key,valueFor(row,input.mapping,field.key)]));
        const owner=request.crm?.identity;
        connection.prepare(`
          INSERT INTO organisations(
            id,name,legal_name,website,industry,employee_band,annual_revenue_band,country,status,source,
            created_at,updated_at,archived_at,owner_user_id,owner_team_id
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?)
        `).run(id,standard.name,standard.legalName||null,standard.website||null,standard.industry||null,
          standard.employeeBand||null,standard.annualRevenueBand||null,standard.country||null,standard.status||'prospect',
          standard.source||'bulk_import',now,now,owner?.id??null,owner?.teams[0]?.id??null);
        return;
      }
      if(target.key==='contacts'){
        const organisationName=valueFor(row,input.mapping,'organisationName');
        const organisations=connection.prepare(`
          SELECT id FROM organisations WHERE lower(name)=lower(?) AND archived_at IS NULL
        `).all(organisationName) as Array<{id:string}>;
        if(organisations.length!==1)throw new Error(organisations.length?'More than one organisation has this name':'No organisation with this name exists');
        const standard=Object.fromEntries(contactStandard.map((field)=>[field.key,valueFor(row,input.mapping,field.key)]));
        connection.prepare(`
          INSERT INTO contacts(
            id,organisation_id,first_name,last_name,job_title,email,phone,is_primary,status,created_at,updated_at,archived_at
          ) VALUES(?,?,?,?,?,?,?,0,?,?,?,NULL)
        `).run(crypto.randomUUID(),organisations[0].id,standard.firstName||null,standard.lastName||null,
          standard.jobTitle||null,standard.email||null,standard.phone||null,standard.status||'active',now,now);
        return;
      }
      if(target.key==='customers'){
        const id=crypto.randomUUID();
        const standard=Object.fromEntries(customerStandard.map((field)=>[field.key,valueFor(row,input.mapping,field.key)]));
        connection.prepare(`
          INSERT INTO customers(id,first_name,last_name,email,company,phone,mobile,address,notes,tags,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(id,standard.firstName,standard.lastName,standard.email,standard.company||null,standard.phone||null,
          standard.mobile||null,standard.address||null,standard.notes||null,
          JSON.stringify(standard.tags?standard.tags.split(',').map((tag)=>tag.trim()).filter(Boolean):[]),now,now);
        saveValues(connection,id,'custom_fields_values',target.fields,row,input.mapping,now);
        return;
      }
      const customerEmail=valueFor(row,input.mapping,'customerEmail').toLowerCase();
      const customer=connection.prepare(`SELECT id FROM customers WHERE lower(email)=? ORDER BY created_at LIMIT 1`).get(customerEmail) as {id:string}|undefined;
      if(!customer)throw new Error('No customer with this email exists');
      const recordId=crypto.randomUUID();
      connection.prepare(`
        INSERT INTO custom_objects_records(id,object_definition_id,customer_id,created_at,updated_at) VALUES(?,?,?,?,?)
      `).run(recordId,target.definitionId,customer.id,now,now);
      saveValues(connection,recordId,'custom_objects_values',target.fields,row,input.mapping,now);
    });
    connection.transaction(()=>{
      for(let index=0;index<rows.length;index+=1){
        const rowNumber=index+2;
        if(invalidRows.has(rowNumber))continue;
        const row=rows[index];
        try{
          writeRow(row);
          importedCount+=1;
        }catch(error){
          invalidRows.add(rowNumber);
          const message=error instanceof Error?error.message:'Row could not be imported';
          const connectionError=message.includes('organisation')?'Organisation name':message==='No customer with this email exists'?'Connected customer email':'Row';
          importIssues.push({row:rowNumber,field:connectionError,message});
        }
      }
      connection.prepare(`
        INSERT INTO bulk_import_runs(
          id,target_key,filename,imported_count,rejected_count,mapping_json,issues_json,created_by_user_id,created_at
        ) VALUES(?,?,?,?,?,?,?,?,?)
      `).run(crypto.randomUUID(),target.key,input.filename,importedCount,invalidRows.size,
        JSON.stringify(input.mapping),JSON.stringify(importIssues.slice(0,2000)),request.crm?.identity?.id??null,now);
    })();
    response.status(201).json({importedCount,rejectedCount:invalidRows.size,issues:importIssues.slice(0,500)});
  }catch(error){next(error);}
});

router.get('/history',(_request,response,next)=>{
  try{
    const rows=getSqliteConnection().prepare(`
      SELECT id,target_key AS targetKey,filename,imported_count AS importedCount,rejected_count AS rejectedCount,
        created_by_user_id AS createdByUserId,created_at AS createdAt
      FROM bulk_import_runs ORDER BY created_at DESC LIMIT 25
    `).all();
    response.json(rows);
  }catch(error){next(error);}
});

function saveValues(
  connection:ReturnType<typeof getSqliteConnection>,entityId:string,table:'custom_fields_values'|'custom_objects_values',
  fields:ImportField[],row:Record<string,string>,mapping:Record<string,string>,timestamp:string,
):void{
  const idColumn=table==='custom_fields_values'?'entity_id':'record_id';
  const entityFields=fields.filter((field)=>field.kind==='custom');
  for(const field of entityFields){
    const value=valueFor(row,mapping,field.key);
    if(!value)continue;
    if(!field.fieldId)continue;
    connection.prepare(`
      INSERT INTO ${table}(id,${idColumn},field_id,value,created_at,updated_at) VALUES(?,?,?,?,?,?)
    `).run(crypto.randomUUID(),entityId,field.fieldId,value,timestamp,timestamp);
  }
}

export default router;
