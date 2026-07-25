import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { runSeed } from '../infrastructure/database/seed';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { SecurityRepository } from '../infrastructure/database/SecurityRepository';
import { ensureWi11ExtensionSchema } from '../infrastructure/database/wi11ExtensionSchema';
import { startServer,type RunningServer } from '../server';

describe('workspace design, navigation and bulk import',()=>{
  let server:RunningServer|null=null;
  beforeEach(async()=>{
    setupTempDatabase();
    await runSeed();
    process.env.CRM_TRUST_LOCAL_USERS='true';
    server=await startServer({host:'127.0.0.1',port:0});
  });
  afterEach(async()=>{
    await server?.close();server=null;delete process.env.CRM_TRUST_LOCAL_USERS;cleanupTempDatabase();
  });
  const json=async(path:string,method='GET',body?:unknown,userId?:string)=>{
    const response=await fetch(`${server!.url}${path}`,{
      method,headers:{'content-type':'application/json',...(userId?{'x-crm-user-id':userId}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    });
    let payload:any=null;try{payload=await response.json();}catch{}
    return {response,payload};
  };

  it('lets an administrator build fields and working record relationships',async()=>{
    const vehicle=(await json('/api/custom-objects/definitions','POST',{name:'Vehicle',pluralName:'Vehicles',apiName:'vehicle',description:'Fleet vehicle'})).payload;
    const course=(await json('/api/custom-objects/definitions','POST',{name:'Course',pluralName:'Courses',apiName:'course',description:'Training course'})).payload;
    expect((await json(`/api/custom-objects/definitions/${vehicle.id}/fields`,'POST',{name:'registration',label:'Registration',type:'text',required:true,options:[]})).response.status).toBe(201);
    const relationship=await json('/api/workspace-design/relationships','POST',{sourceDefinitionId:vehicle.id,targetType:'custom_object',targetDefinitionId:course.id,name:'assigned_course',label:'Assigned course',cardinality:'many-to-one'});
    expect(relationship.response.status).toBe(201);
    const connection=getSqliteConnection();const customer=connection.prepare(`SELECT id FROM customers ORDER BY created_at LIMIT 1`).get() as {id:string};
    const target=(await json('/api/custom-objects/records','POST',{objectDefinitionId:course.id,customerId:customer.id,values:{}})).payload;
    const source=await json('/api/custom-objects/records','POST',{objectDefinitionId:vehicle.id,customerId:customer.id,values:{registration:'241-D-1'},relationships:{[relationship.payload.id]:target.id}});
    expect(source.response.status).toBe(201);
    expect(source.payload).toMatchObject({values:{registration:'241-D-1'},relationships:{[relationship.payload.id]:target.id}});
    const model=await json('/api/workspace/model');
    expect(model.payload.definitions.find((item:any)=>item.id===vehicle.id).relationships).toEqual([expect.objectContaining({label:'Assigned course',targetDefinitionId:course.id})]);
  });

  it('allows personal navigation for members but protects the organisation default',async()=>{
    const security=new SecurityRepository();const member=security.createUser({email:'agent@example.test',displayName:'Agent',roleKeys:['member'],password:'agent password long enough'});
    const personal=await json('/api/workspace-design/navigation','PUT',{scope:'personal',orderedKeys:['/contacts','/','/work']},member.id);
    expect(personal.response.status).toBe(200);
    const read=await json('/api/workspace-design/navigation','GET',undefined,member.id);
    expect(read.payload).toMatchObject({personalOrder:['/contacts','/','/work'],canManageOrganisation:false});
    const organisationDenied=await json('/api/workspace-design/navigation','PUT',{scope:'organisation',orderedKeys:['/work','/']},member.id);
    expect(organisationDenied.response.status).toBe(403);
    const schemaDenied=await json('/api/custom-objects/definitions','POST',{name:'Denied',pluralName:'Denied',apiName:'denied',description:''},member.id);
    expect(schemaDenied.response.status).toBe(403);
    const importDenied=await json('/api/bulk-import/preview','POST',{targetKey:'customers',filename:'denied.csv',csvData:'First,Last,Email\nA,B,a@example.test\n',mapping:{}},member.id);
    expect(importDenied.response.status).toBe(403);
    const organisation=await json('/api/workspace-design/navigation','PUT',{scope:'organisation',orderedKeys:['/reporting','/']});
    expect(organisation.response.status).toBe(200);
  });

  it('previews mapped CSV data and imports customers and custom-object records with row-level rejections',async()=>{
    const organisationsCsv='Account,Industry\nBulk Import Test Org 76,Consulting\n';
    const organisations=await json('/api/bulk-import/execute','POST',{targetKey:'organisations',filename:'organisations.csv',csvData:organisationsCsv,mapping:{name:'Account',industry:'Industry'}});
    expect(organisations.payload).toMatchObject({importedCount:1,rejectedCount:0});
    const contactsCsv='Account,First,Last,Email\nBulk Import Test Org 76,Stephen,Mullins,stephen@example.test\nMissing Org,A,Person,a.person@example.test\n';
    const contacts=await json('/api/bulk-import/execute','POST',{targetKey:'contacts',filename:'contacts.csv',csvData:contactsCsv,mapping:{organisationName:'Account',firstName:'First',lastName:'Last',email:'Email'}});
    expect(contacts.payload).toMatchObject({importedCount:1,rejectedCount:1});

    const customersCsv='Given name,Surname,Email address\nAisling,Byrne,aisling@example.test\nMissing,Email,not-an-email\n';
    const preview=await json('/api/bulk-import/preview','POST',{targetKey:'customers',filename:'customers.csv',csvData:customersCsv,mapping:{firstName:'Given name',lastName:'Surname',email:'Email address'}});
    expect({status:preview.response.status,payload:preview.payload}).toMatchObject({status:200});expect(preview.payload).toMatchObject({rowCount:2,validRowCount:1});
    const imported=await json('/api/bulk-import/execute','POST',{targetKey:'customers',filename:'customers.csv',csvData:customersCsv,mapping:{firstName:'Given name',lastName:'Surname',email:'Email address'}});
    expect(imported.payload).toMatchObject({importedCount:1,rejectedCount:1});

    const object=(await json('/api/custom-objects/definitions','POST',{name:'Vehicle',pluralName:'Vehicles',apiName:'vehicle',description:''})).payload;
    await json(`/api/custom-objects/definitions/${object.id}/fields`,'POST',{name:'registration',label:'Registration',type:'text',required:true,options:[]});
    const recordsCsv='Customer email,Registration\naisling@example.test,241-D-1\nunknown@example.test,242-D-2\n';
    const records=await json('/api/bulk-import/execute','POST',{targetKey:'object:vehicle',filename:'vehicles.csv',csvData:recordsCsv,mapping:{customerEmail:'Customer email','custom:registration':'Registration'}});
    expect(records.payload).toMatchObject({importedCount:1,rejectedCount:1});
    expect((getSqliteConnection().prepare(`SELECT count(*) AS count FROM custom_objects_records WHERE object_definition_id=?`).get(object.id) as {count:number}).count).toBe(1);
  });

  it('requires exact confirmation and permanently removes records, fields and relationships',async()=>{
    const source=(await json('/api/custom-objects/definitions','POST',{name:'SDS',pluralName:'SDS records',apiName:'sds',description:''})).payload;
    const target=(await json('/api/custom-objects/definitions','POST',{name:'Target',pluralName:'Targets',apiName:'target',description:''})).payload;
    await json(`/api/custom-objects/definitions/${source.id}/fields`,'POST',{name:'value',label:'Value',type:'text',required:false,options:[]});
    await json('/api/workspace-design/relationships','POST',{sourceDefinitionId:source.id,targetType:'custom_object',targetDefinitionId:target.id,name:'target',label:'Target',cardinality:'many-to-one'});
    const customer=getSqliteConnection().prepare(`SELECT id FROM customers ORDER BY created_at LIMIT 1`).get() as {id:string};
    await json('/api/custom-objects/records','POST',{objectDefinitionId:source.id,customerId:customer.id,values:{value:'remove me'}});
    ensureWi11ExtensionSchema(getSqliteConnection());
    expect(getSqliteConnection().prepare(`
      SELECT e.package_key FROM extension_bindings b
      JOIN extensions e ON e.id=b.extension_id
      WHERE b.resource_type='custom_entity' AND b.resource_id=?
    `).get(source.id)).toMatchObject({package_key:'legacy-customisations'});
    const impact=await json(`/api/custom-objects/definitions/${source.id}/impact`);
    expect(impact.payload).toMatchObject({name:'SDS',apiName:'sds',recordCount:1,fieldCount:1,relationshipCount:1,managedByExtension:null});
    expect((await json(`/api/custom-objects/definitions/${source.id}`,'DELETE',{permanent:true,confirmation:'sds'})).response.status).toBe(409);
    expect((await json(`/api/custom-objects/definitions/${source.id}`,'DELETE',{permanent:true,confirmation:'SDS'})).response.status).toBe(204);
    const connection=getSqliteConnection();
    expect(connection.prepare(`SELECT 1 FROM custom_objects_definition WHERE id=?`).get(source.id)).toBeUndefined();
    expect(connection.prepare(`SELECT 1 FROM custom_fields_definition WHERE entity_type='sds'`).get()).toBeUndefined();
    expect(connection.prepare(`SELECT 1 FROM extension_bindings WHERE resource_id=?`).get(source.id)).toBeUndefined();
    expect(connection.pragma('integrity_check',{simple:true})).toBe('ok');
  });
});
