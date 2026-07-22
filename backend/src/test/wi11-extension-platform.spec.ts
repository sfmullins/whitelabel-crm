import crypto from 'node:crypto';
import fs from 'node:fs';
import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { runSeed } from '../infrastructure/database/seed';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { SecurityRepository } from '../infrastructure/database/SecurityRepository';
import { ExtensionRepository } from '../infrastructure/database/ExtensionRepository';
import { ExtensionRuntimeRepository } from '../infrastructure/database/ExtensionRuntimeRepository';
import { ensureWi11ExtensionSchema } from '../infrastructure/database/wi11ExtensionSchema';
import { CustomFieldRepository } from '../infrastructure/database/repositories/CustomFieldRepository';
import { LOCAL_OWNER_USER_ID } from '../infrastructure/database/wi8Wi9Schema';
import { canonicalJson } from '../application/extensions/ExtensionManifest';
import { startServer,type RunningServer } from '../server';

function extensionPackage(version='1.0.0',label='Case reference'){
  return {manifest:{formatVersion:1 as const,packageKey:'good-order.case-management',name:'Good Order Case Management',description:'Declarative case metadata',version,application:{minVersion:'1.0.0'},capabilities:['custom_fields','custom_entities','themes','workflow_templates'],contributions:{
    customFields:[{entityType:'organisation',key:'case_reference',label,type:'text',options:[],required:false}],
    customEntities:[{key:'case_file',name:'Case file',pluralName:'Case files',description:'Customer-linked case record',fields:[{key:'reference',label:'Reference',type:'text',options:[],required:true}]}],
    forms:[],views:[],navigation:[],themes:[{key:'calm',label:'Calm',tokens:{accent:'#445566'}}],reports:[],
    workflowTemplates:[{key:'case_follow_up',name:'Case follow-up',description:'Creates a task for a case',triggerType:'manual',conditions:{},actions:[{type:'create_task',title:'Review {{caseReference}}',priority:'normal'}]}],
    eventSubscriptions:[],localisations:[],assets:[],
  }},files:[]};
}

function runtimePackage(){
  const content=Buffer.from(JSON.stringify({kind:'extension-help',version:1}));const sha256=crypto.createHash('sha256').update(content).digest('hex');
  return {manifest:{formatVersion:1 as const,packageKey:'good-order.runtime-pack',name:'Good Order Runtime Pack',version:'1.0.0',application:{minVersion:'1.0.0'},capabilities:['navigation','forms','views','reports','workflow_templates','localisation','static_assets'],contributions:{customFields:[],customEntities:[],forms:[{key:'intake',title:'Intake form',entityType:'organisation',fields:['name'],placement:'detail'}],views:[{key:'active',title:'Active organisations',entityType:'organisation',columns:['name','status'],defaultFilters:{status:'active_client'}}],navigation:[{key:'workspace',label:'Runtime workspace',route:'/extensions/good-order.runtime-pack/workspace',order:10}],themes:[],reports:[{key:'pipeline_snapshot',name:'Pipeline snapshot',baseReportKey:'pipeline',defaultFilters:{},columns:['organisationStatus']}],workflowTemplates:[{key:'review',name:'Review organisation',triggerType:'manual',conditions:{},actions:[{type:'create_task',title:'Review organisation',priority:'normal'}]}],eventSubscriptions:[],localisations:[{locale:'en',messages:{'navigation.good-order.runtime-pack.workspace':'Specialist runtime'}}],assets:[{key:'help',path:'help/runtime.json',mediaType:'application/json',sha256,sizeBytes:content.length}]}},files:[{path:'help/runtime.json',contentBase64:content.toString('base64')}]};
}

const approved=['custom_fields','custom_entities','themes','workflow_templates'];
const bearer=(token:string)=>({authorization:`Bearer ${token}`,'content-type':'application/json'});

describe('WI11 extension platform',()=>{
  beforeEach(async()=>{setupTempDatabase();await runSeed();});afterEach(()=>cleanupTempDatabase());

  it('validates capability approval, asset integrity and optional Ed25519 signatures',()=>{
    const repository=new ExtensionRepository();const unsigned=extensionPackage();expect(()=>repository.validate(unsigned,['custom_fields'])).toThrow('was not approved');
    const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');const canonical=canonicalJson(unsigned.manifest);const signed={...unsigned,signature:{algorithm:'ed25519' as const,publicKeyPem:publicKey.export({format:'pem',type:'spki'}).toString(),signatureBase64:crypto.sign(null,Buffer.from(canonical),privateKey).toString('base64')}};const result=repository.validate(signed,approved);expect(result.signatureStatus).toBe('verified');expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);signed.signature.signatureBase64=Buffer.from('tampered').toString('base64');expect(()=>repository.validate(signed,approved)).toThrow('signature verification failed');
    const assetPackage=runtimePackage();assetPackage.files[0].contentBase64=Buffer.from('tampered').toString('base64');expect(()=>repository.validate(assetPackage,assetPackage.manifest.capabilities)).toThrow(/size|checksum/);
  });

  it('installs and upgrades declarative contributions with backup and release history',async()=>{
    const security=new SecurityRepository();const owner=security.resolveLocalUser(LOCAL_OWNER_USER_ID)!;const repository=new ExtensionRepository();const installed=await repository.install(extensionPackage(),{actorUserId:owner.id,approvedCapabilities:approved}) as any;
    expect(installed.status).toBe('enabled');expect(installed.backupFilename).toContain('pre-migration-');expect(installed.releases).toHaveLength(1);
    const field=getSqliteConnection().prepare(`SELECT id,name,label FROM custom_fields_definition WHERE entity_type='organisation' AND name='good_order_case_management__case_reference'`).get() as {id:string;name:string;label:string};expect(field.label).toBe('Case reference');
    const entity=getSqliteConnection().prepare(`SELECT id,api_name FROM custom_objects_definition WHERE api_name='good_order_case_management__case_file'`).get() as {id:string;api_name:string};expect(entity.api_name).toContain('case_file');expect((await new CustomFieldRepository().getDefinitions('organisation')).some((definition)=>definition.id===field.id)).toBe(true);
    repository.setEnabled(installed.id,false);expect((await new CustomFieldRepository().getDefinitions('organisation')).some((definition)=>definition.id===field.id)).toBe(false);repository.setEnabled(installed.id,true);expect((await new CustomFieldRepository().getDefinitions('organisation')).some((definition)=>definition.id===field.id)).toBe(true);
    const upgraded=await repository.install(extensionPackage('1.1.0','Case number'),{actorUserId:owner.id,approvedCapabilities:approved}) as any;expect(upgraded.currentVersion).toBe('1.1.0');expect(upgraded.releases).toHaveLength(2);expect(upgraded.releases.filter((release:any)=>release.status==='active')).toHaveLength(1);expect((getSqliteConnection().prepare(`SELECT label FROM custom_fields_definition WHERE id=?`).get(field.id) as {label:string}).label).toBe('Case number');
    const attempts=getSqliteConnection().prepare(`SELECT status FROM extension_install_attempts WHERE package_key='good-order.case-management'`).all() as Array<{status:string}>;expect(attempts).toHaveLength(2);expect(attempts.every((attempt)=>attempt.status==='succeeded')).toBe(true);
  });

  it('resolves runtime metadata, executes reports, instantiates disabled workflows and verifies stored assets',async()=>{
    const security=new SecurityRepository();const owner=security.resolveLocalUser(LOCAL_OWNER_USER_ID)!;const repository=new ExtensionRepository();const packageInput=runtimePackage();const installed=await repository.install(packageInput,{actorUserId:owner.id,approvedCapabilities:packageInput.manifest.capabilities}) as any;const runtime=new ExtensionRuntimeRepository();
    const registry=runtime.runtime('en');expect(registry.messages['navigation.good-order.runtime-pack.workspace']).toBe('Specialist runtime');expect(registry.navigation).toHaveLength(1);expect(registry.forms).toHaveLength(1);expect(registry.views).toHaveLength(1);expect(registry.assets).toHaveLength(1);
    const report=runtime.runReport(installed.id,'pipeline_snapshot') as any;expect(report.report.key).toBe('pipeline');
    const workflow=runtime.instantiateWorkflow(installed.id,'review') as any;expect(workflow.enabled).toBe(false);expect(workflow.reused).toBe(false);expect((runtime.instantiateWorkflow(installed.id,'review') as any).reused).toBe(true);
    const asset=runtime.asset(installed.id,'help');expect(JSON.parse(fs.readFileSync(asset.path,'utf8')).kind).toBe('extension-help');
  });

  it('exports and purges extension-owned data only after disable and exact confirmation',async()=>{
    const security=new SecurityRepository();const owner=security.resolveLocalUser(LOCAL_OWNER_USER_ID)!;const repository=new ExtensionRepository();const installed=await repository.install(extensionPackage(),{actorUserId:owner.id,approvedCapabilities:approved}) as any;const runtime=new ExtensionRuntimeRepository();const field=getSqliteConnection().prepare(`SELECT id FROM custom_fields_definition WHERE name='good_order_case_management__case_reference'`).get() as {id:string};getSqliteConnection().prepare(`INSERT INTO custom_fields_values(id,entity_id,field_id,value,created_at,updated_at) VALUES(?,?,?,?,?,?)`).run(crypto.randomUUID(),crypto.randomUUID(),field.id,'CASE-1',new Date().toISOString(),new Date().toISOString());
    expect((runtime.exportData(installed.id) as any).customFields.values).toHaveLength(1);await expect(runtime.purgeData(installed.id,owner.id,`PURGE ${installed.packageKey}`)).rejects.toThrow('must be disabled');repository.setEnabled(installed.id,false);await expect(runtime.purgeData(installed.id,owner.id,'PURGE wrong')).rejects.toThrow('Confirmation must exactly match');const purged=await runtime.purgeData(installed.id,owner.id,`PURGE ${installed.packageKey}`);expect(purged.summary.fieldValues).toBe(1);expect((runtime.exportData(installed.id) as any).customFields.values).toHaveLength(0);
  });

  it('bridges pre-WI11 customisations without deleting data',()=>{const connection=getSqliteConnection();const id=crypto.randomUUID();connection.prepare(`INSERT INTO custom_fields_definition(id,entity_type,name,label,type,options,required,created_at) VALUES(?,?,?,?,?,'[]',0,?)`).run(id,'customer','legacy_code','Legacy code','text',new Date().toISOString());ensureWi11ExtensionSchema(connection);const binding=connection.prepare(`SELECT e.package_key,b.resource_id FROM extension_bindings b JOIN extensions e ON e.id=b.extension_id WHERE b.resource_type='custom_field' AND b.resource_id=?`).get(id) as {package_key:string;resource_id:string};expect(binding.package_key).toBe('legacy-customisations');expect(binding.resource_id).toBe(id);expect(()=>connection.prepare(`SELECT id FROM custom_fields_definition WHERE id=?`).get(id)).not.toThrow();});

  it('enforces runtime, read and manage permissions over the extension API',async()=>{
    const security=new SecurityRepository();const owner=security.resolveLocalUser(LOCAL_OWNER_USER_ID)!;const ownerSession=security.createSession(owner.id);const manager=security.createUser({email:'wi11-manager@example.test',displayName:'WI11 Manager',roleKeys:['manager'],password:'manager password long enough'});const managerSession=security.createSession(manager.id);const viewer=security.createUser({email:'wi11-viewer@example.test',displayName:'WI11 Viewer',roleKeys:['viewer'],password:'viewer password long enough'});const viewerSession=security.createSession(viewer.id);let server:RunningServer|null=null;
    try{server=await startServer({host:'127.0.0.1',port:0});expect((await fetch(`${server.url}/api/extensions/runtime`,{headers:bearer(viewerSession.token)})).status).toBe(200);expect((await fetch(`${server.url}/api/extensions`,{headers:bearer(viewerSession.token)})).status).toBe(403);expect((await fetch(`${server.url}/api/extensions`,{headers:bearer(managerSession.token)})).status).toBe(200);expect((await fetch(`${server.url}/api/extensions/validate`,{method:'POST',headers:bearer(managerSession.token),body:JSON.stringify({package:extensionPackage(),approvedCapabilities:approved})})).status).toBe(403);const installed=await fetch(`${server.url}/api/extensions/install`,{method:'POST',headers:bearer(ownerSession.token),body:JSON.stringify({package:extensionPackage(),approvedCapabilities:approved})});expect(installed.status).toBe(201);const body=await installed.json() as any;expect(body.packageKey).toBe('good-order.case-management');const event=getSqliteConnection().prepare(`SELECT event_type,aggregate_id FROM platform_events WHERE event_type='extension.installed.v1'`).get() as {event_type:string;aggregate_id:string};expect(event.aggregate_id).toBe(body.id);}finally{await server?.close();}
  });
});
