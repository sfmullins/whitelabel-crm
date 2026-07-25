import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { runSeed } from '../infrastructure/database/seed';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { SecurityRepository } from '../infrastructure/database/SecurityRepository';
import { ReportBuilderRepository } from '../infrastructure/database/ReportBuilderRepository';
import { WORKSPACE_TEMPLATE_CATALOG,workspacePresentation } from '../application/workspaceTemplateCatalog';
import { startServer,type RunningServer } from '../server';

const CHILD='91000000-0000-4000-8000-000000000001';
const CHILD_FIELD='91000000-0000-4000-8000-000000000002';
const CHILD_RECORD='91000000-0000-4000-8000-000000000003';
const CHILD_VALUE='91000000-0000-4000-8000-000000000004';

describe('template-driven workspaces and report builder',()=>{
  beforeEach(async()=>{
    setupTempDatabase();await runSeed();const connection=getSqliteConnection();const timestamp=new Date().toISOString();
    const customer=connection.prepare(`SELECT id FROM customers ORDER BY created_at LIMIT 1`).get() as {id:string};
    connection.prepare(`INSERT INTO custom_objects_definition(id,name,api_name,plural_name,description,created_at) VALUES(?,?,?,?,?,?)`).run(CHILD,'Child','child','Children','Child record',timestamp);
    connection.prepare(`INSERT INTO custom_fields_definition(id,entity_type,name,label,type,options,required,created_at) VALUES(?,?,?,?,?,'[]',0,?)`).run(CHILD_FIELD,'child','school','School','text',timestamp);
    connection.prepare(`INSERT INTO custom_objects_records(id,object_definition_id,customer_id,created_at,updated_at) VALUES(?,?,?,?,?)`).run(CHILD_RECORD,CHILD,customer.id,timestamp,timestamp);
    connection.prepare(`INSERT INTO custom_objects_values(id,record_id,field_id,value,created_at,updated_at) VALUES(?,?,?,?,?,?)`).run(CHILD_VALUE,CHILD_RECORD,CHILD_FIELD,'Riverbank School',timestamp,timestamp);
  });
  afterEach(cleanupTempDatabase);

  it('defines navigation, dashboard actions and starter reports for every selectable template',()=>{
    const selectable=['b2b-services','b2c-services','ecommerce','physical-retail','after-school-childcare','pet-behaviour','veterinary-practice','pet-grooming','simple-crm'];
    expect(Object.keys(WORKSPACE_TEMPLATE_CATALOG).sort()).toEqual(selectable.sort());
    for(const key of selectable){
      const presentation=workspacePresentation(key);
      expect(presentation.navigation.length).toBeGreaterThan(0);
      if(key!=='simple-crm'){
        expect(presentation.dashboardCards.length).toBeGreaterThan(0);
        expect(presentation.quickActions.length).toBeGreaterThan(0);
        expect(presentation.starterReports.length).toBeGreaterThan(0);
      }
    }
    expect(workspacePresentation('after-school-childcare').starterReports.map((report)=>report.sourceKey)).toEqual(expect.arrayContaining(['childcare_enrolment','childcare_attendance','childcare_incident']));
  });

  it('discovers model fields, filters records, groups results and exports the selected columns',()=>{
    const reports=new ReportBuilderRepository();const catalog=reports.catalog();expect(catalog.sources.find((source)=>source.key==='child')?.columns).toEqual(expect.arrayContaining([expect.objectContaining({key:'school',label:'School'})]));
    const definition={sourceKey:'child',columns:['customer_name','school'],filters:[{field:'school',operator:'contains' as const,value:'riverbank'}],groupBy:'school'};
    const result=reports.run(definition);expect(result.total).toBe(1);expect(result.rows[0]).toMatchObject({school:'Riverbank School'});expect(result.groups).toEqual([{name:'Riverbank School',value:1}]);
    const exported=reports.exportCsv(definition);expect(exported.content).toContain('Customer,School');expect(exported.content).toContain('Riverbank School');
  });

  it('saves reports with visibility controls and rejects unknown fields',()=>{
    const security=new SecurityRepository();const reports=new ReportBuilderRepository();const owner=security.resolveLocalUser()!;
    const viewer=security.createUser({email:'builder-viewer@example.test',displayName:'Builder Viewer',roleKeys:['viewer'],password:'builder viewer password'});const viewerIdentity=security.resolveLocalUser(viewer.id)!;
    const definition={sourceKey:'child',columns:['customer_name','school'],filters:[],groupBy:null};
    const saved=reports.create(owner,{name:'Children by school',definition,visibility:'private'});expect(reports.get(owner,saved.id).name).toBe('Children by school');expect(reports.list(viewerIdentity)).toHaveLength(0);
    expect(()=>reports.run({...definition,columns:['private_sql_column']})).toThrow('Choose at least one');
    expect(()=>reports.run({...definition,filters:[{field:'private_sql_column',operator:'equals',value:'x'}]})).toThrow('Unsupported report filter');
  });

  it('creates a reviewable email draft forcibly scoped to the selected customer',async()=>{
    const connection=getSqliteConnection();const security=new SecurityRepository();const owner=security.resolveLocalUser()!;const session=security.createSession(owner.id);
    const customer=connection.prepare(`SELECT c.id,c.email FROM customers c JOIN custom_objects_records r ON r.customer_id=c.id WHERE r.id=?`).get(CHILD_RECORD) as {id:string;email:string};
    const account=connection.prepare(`SELECT id FROM communication_accounts WHERE kind='email' LIMIT 1`).get() as {id:string};
    process.env.CRM_TRUST_LOCAL_USERS='false';let server:RunningServer|null=null;
    try{
      server=await startServer({host:'127.0.0.1',port:0});
      const response=await fetch(`${server.url}/api/reporting/builder/email-draft`,{method:'POST',headers:{authorization:`Bearer ${session.token}`,'content-type':'application/json'},body:JSON.stringify({accountId:account.id,targetCustomerId:customer.id,subject:'Child record report',definition:{sourceKey:'child',columns:['customer_name','school'],filters:[],groupBy:null}})});
      expect(response.status).toBe(201);const payload=await response.json() as any;expect(payload.report.total).toBe(1);
      const draft=connection.prepare(`SELECT to_json,body_text,status FROM email_drafts WHERE id=?`).get(payload.draft.id) as {to_json:string;body_text:string;status:string};
      expect(JSON.parse(draft.to_json)[0].address).toBe(customer.email);expect(draft.body_text).toContain('Riverbank School');expect(draft.status).toBe('draft');
    }finally{await server?.close();delete process.env.CRM_TRUST_LOCAL_USERS;}
  });

  it('lets report readers run previews without granting save or export permissions',async()=>{
    const security=new SecurityRepository();const viewer=security.createUser({email:'report-reader@example.test',displayName:'Report Reader',roleKeys:['viewer'],password:'report reader password'});const session=security.createSession(viewer.id);
    process.env.CRM_TRUST_LOCAL_USERS='false';let server:RunningServer|null=null;const body={sourceKey:'child',columns:['customer_name','school'],filters:[],groupBy:null};
    try{
      server=await startServer({host:'127.0.0.1',port:0});const headers={authorization:`Bearer ${session.token}`,'content-type':'application/json'};
      const preview=await fetch(`${server.url}/api/reporting/builder/run`,{method:'POST',headers,body:JSON.stringify(body)});expect(preview.status).toBe(200);
      const saved=await fetch(`${server.url}/api/reporting/builder/saved`,{method:'POST',headers,body:JSON.stringify({name:'Denied save',definition:body})});expect(saved.status).toBe(403);
      const exported=await fetch(`${server.url}/api/reporting/builder/export.csv`,{method:'POST',headers,body:JSON.stringify(body)});expect(exported.status).toBe(403);
    }finally{await server?.close();delete process.env.CRM_TRUST_LOCAL_USERS;}
  });
});
