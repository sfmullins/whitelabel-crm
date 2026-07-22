import crypto from 'node:crypto';
import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { runSeed } from '../infrastructure/database/seed';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { SecurityRepository } from '../infrastructure/database/SecurityRepository';
import { ExtensionRepository } from '../infrastructure/database/ExtensionRepository';
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
  }}};
}

const approved=['custom_fields','custom_entities','themes','workflow_templates'];
const bearer=(token:string)=>({authorization:`Bearer ${token}`,'content-type':'application/json'});

describe('WI11 extension platform',()=>{
  beforeEach(async()=>{setupTempDatabase();await runSeed();});
  afterEach(()=>cleanupTempDatabase());

  it('validates capability approval, unique keys and optional Ed25519 signatures',()=>{
    const repository=new ExtensionRepository();const unsigned=extensionPackage();
    expect(()=>repository.validate(unsigned,['custom_fields'])).toThrow('was not approved');
    const duplicate=structuredClone(unsigned);duplicate.manifest.contributions.customFields.push({...duplicate.manifest.contributions.customFields[0]});expect(()=>repository.validate(duplicate,approved)).toThrow('Duplicate custom field key');
    const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');const canonical=canonicalJson(unsigned.manifest);const signed={...unsigned,signature:{algorithm:'ed25519' as const,publicKeyPem:publicKey.export({format:'pem',type:'spki'}).toString(),signatureBase64:crypto.sign(null,Buffer.from(canonical),privateKey).toString('base64')}};
    const result=repository.validate(signed,approved);expect(result.signatureStatus).toBe('verified');expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    const tampered=Buffer.from(signed.signature.signatureBase64,'base64');tampered[0]^=1;signed.signature.signatureBase64=tampered.toString('base64');expect(()=>repository.validate(signed,approved)).toThrow('signature verification failed');
  });

  it('installs, upgrades, retires and rolls back declarative contributions',async()=>{
    const security=new SecurityRepository();const owner=security.resolveLocalUser(LOCAL_OWNER_USER_ID)!;const repository=new ExtensionRepository();const fields=new CustomFieldRepository();
    const installed=await repository.install(extensionPackage(),{actorUserId:owner.id,approvedCapabilities:approved}) as any;
    expect(installed.status).toBe('enabled');expect(installed.backupFilename).toContain('pre-migration-');expect(installed.releases).toHaveLength(1);
    const field=getSqliteConnection().prepare(`SELECT id,name,label FROM custom_fields_definition WHERE entity_type='organisation' AND name='good_order_case_management__case_reference'`).get() as {id:string;name:string;label:string};expect(field.label).toBe('Case reference');
    const entity=getSqliteConnection().prepare(`SELECT id,api_name FROM custom_objects_definition WHERE api_name='good_order_case_management__case_file'`).get() as {id:string;api_name:string};expect(entity.api_name).toContain('case_file');
    expect((await fields.getDefinitions('organisation')).some((definition)=>definition.id===field.id)).toBe(true);
    repository.setEnabled(installed.id,false);expect((await fields.getDefinitions('organisation')).some((definition)=>definition.id===field.id)).toBe(false);
    repository.setEnabled(installed.id,true);expect((await fields.getDefinitions('organisation')).some((definition)=>definition.id===field.id)).toBe(true);

    const upgraded=await repository.install(extensionPackage('1.1.0','Case number'),{actorUserId:owner.id,approvedCapabilities:approved}) as any;expect(upgraded.currentVersion).toBe('1.1.0');expect(upgraded.releases).toHaveLength(2);expect(upgraded.releases.filter((release:any)=>release.status==='active')).toHaveLength(1);
    expect((getSqliteConnection().prepare(`SELECT label FROM custom_fields_definition WHERE id=?`).get(field.id) as {label:string}).label).toBe('Case number');

    const retiring=extensionPackage('1.2.0','Case number');retiring.manifest.contributions.customFields=[];const retired=await repository.install(retiring,{actorUserId:owner.id,approvedCapabilities:approved}) as any;expect(retired.currentVersion).toBe('1.2.0');expect((await fields.getDefinitions('organisation')).some((definition)=>definition.id===field.id)).toBe(false);
    repository.setEnabled(retired.id,false);repository.setEnabled(retired.id,true);expect((await fields.getDefinitions('organisation')).some((definition)=>definition.id===field.id)).toBe(false);
    expect((getSqliteConnection().prepare(`SELECT retired_at FROM extension_bindings WHERE resource_id=?`).get(field.id) as {retired_at:string|null}).retired_at).toBeTruthy();

    const broken=extensionPackage('1.3.0','Invalid type change');broken.manifest.contributions.customFields[0].type='number';await expect(repository.install(broken,{actorUserId:owner.id,approvedCapabilities:approved})).rejects.toThrow('identity or type cannot change');
    const afterFailure=repository.getByPackageKey('good-order.case-management') as any;expect(afterFailure.currentVersion).toBe('1.2.0');expect(afterFailure.releases.filter((release:any)=>release.status==='active')).toHaveLength(1);
    const attempts=getSqliteConnection().prepare(`SELECT version,status,backup_filename,failure_details FROM extension_install_attempts WHERE package_key='good-order.case-management' ORDER BY started_at`).all() as Array<{version:string;status:string;backup_filename:string|null;failure_details:string|null}>;expect(attempts).toHaveLength(4);expect(attempts.slice(0,3).every((attempt)=>attempt.status==='succeeded')).toBe(true);expect(attempts[3].status).toBe('failed');expect(attempts[3].backup_filename).toContain('pre-migration-');expect(attempts[3].failure_details).toContain('identity or type cannot change');
  });

  it('bridges pre-WI11 customisations without deleting data',()=>{
    const connection=getSqliteConnection();const id=crypto.randomUUID();connection.prepare(`INSERT INTO custom_fields_definition(id,entity_type,name,label,type,options,required,created_at) VALUES(?,?,?,?,?,'[]',0,?)`).run(id,'customer','legacy_code','Legacy code','text',new Date().toISOString());
    ensureWi11ExtensionSchema(connection);
    const binding=connection.prepare(`SELECT e.package_key,b.resource_id FROM extension_bindings b JOIN extensions e ON e.id=b.extension_id WHERE b.resource_type='custom_field' AND b.resource_id=?`).get(id) as {package_key:string;resource_id:string};expect(binding.package_key).toBe('legacy-customisations');expect(binding.resource_id).toBe(id);
    expect(()=>connection.prepare(`SELECT id FROM custom_fields_definition WHERE id=?`).get(id)).not.toThrow();
  });

  it('enforces read and manage permissions over the extension API',async()=>{
    const security=new SecurityRepository();const owner=security.resolveLocalUser(LOCAL_OWNER_USER_ID)!;const ownerSession=security.createSession(owner.id);const manager=security.createUser({email:'wi11-manager@example.test',displayName:'WI11 Manager',roleKeys:['manager'],password:'manager password long enough'});const managerSession=security.createSession(manager.id);const viewer=security.createUser({email:'wi11-viewer@example.test',displayName:'WI11 Viewer',roleKeys:['viewer'],password:'viewer password long enough'});const viewerSession=security.createSession(viewer.id);let server:RunningServer|null=null;
    try{
      server=await startServer({host:'127.0.0.1',port:0});
      expect((await fetch(`${server.url}/api/extensions`,{headers:bearer(viewerSession.token)})).status).toBe(403);
      expect((await fetch(`${server.url}/api/extensions`,{headers:bearer(managerSession.token)})).status).toBe(200);
      expect((await fetch(`${server.url}/api/extensions/validate`,{method:'POST',headers:bearer(managerSession.token),body:JSON.stringify({package:extensionPackage(),approvedCapabilities:approved})})).status).toBe(403);
      const installed=await fetch(`${server.url}/api/extensions/install`,{method:'POST',headers:bearer(ownerSession.token),body:JSON.stringify({package:extensionPackage(),approvedCapabilities:approved})});expect(installed.status).toBe(201);const body=await installed.json() as any;expect(body.packageKey).toBe('good-order.case-management');
      const event=getSqliteConnection().prepare(`SELECT event_type,aggregate_id FROM platform_events WHERE event_type='extension.installed.v1'`).get() as {event_type:string;aggregate_id:string};expect(event.aggregate_id).toBe(body.id);
    }finally{await server?.close();}
  });
});
