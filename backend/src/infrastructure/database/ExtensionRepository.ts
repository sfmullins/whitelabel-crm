import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { sqlite } from './connection';
import { BackupManager } from '../backup/BackupManager';
import { compareSemver,type ExtensionManifest,validateExtensionPackage } from '../../application/extensions/ExtensionManifest';

const timestamp=()=>new Date().toISOString();
function parseJson<T>(value:unknown,fallback:T):T{if(typeof value!=='string')return fallback;try{return JSON.parse(value) as T;}catch{return fallback;}}
function namespaceFor(packageKey:string):string{return packageKey.replace(/[.-]/g,'_');}
function contributionKey(type:string,...parts:string[]):string{return `${type}:${parts.join(':')}`;}

interface InstallContext {actorUserId:string;approvedCapabilities:string[];}

export class ExtensionRepository {
  constructor(private readonly connection:Database.Database=sqlite as Database.Database){}

  validate(input:unknown,approvedCapabilities:string[]){const result=validateExtensionPackage(input,approvedCapabilities);return {manifest:result.package.manifest,checksum:result.checksum,signatureStatus:result.signatureStatus,compatible:true};}

  listExtensions(){return (this.connection.prepare(`SELECT id FROM extensions ORDER BY system_managed DESC,name COLLATE NOCASE`).all() as Array<{id:string}>).map((row)=>this.getExtension(row.id)!);}

  getExtension(id:string){
    const row=this.connection.prepare(`SELECT e.*,u.display_name AS installed_by_name FROM extensions e LEFT JOIN users u ON u.id=e.installed_by_user_id WHERE e.id=?`).get(id) as Record<string,unknown>|undefined;if(!row)return null;
    const releases=this.connection.prepare(`SELECT id,version,checksum_sha256,signature_status,status,backup_filename,installed_by_user_id,installed_at,failure_details FROM extension_releases WHERE extension_id=? ORDER BY installed_at DESC`).all(id) as Array<Record<string,unknown>>;
    const activeRelease=releases.find((release)=>release.status==='active');const contributions=activeRelease?(this.connection.prepare(`SELECT id,contribution_type,contribution_key,definition_json,enabled,created_at FROM extension_contributions WHERE release_id=? ORDER BY contribution_type,contribution_key`).all(activeRelease.id) as Array<Record<string,unknown>>):[];
    const bindings=this.connection.prepare(`SELECT contribution_type,contribution_key,resource_type,resource_id,created_at,disabled_at,retired_at FROM extension_bindings WHERE extension_id=? ORDER BY contribution_type,contribution_key`).all(id) as Array<Record<string,unknown>>;
    return {id:row.id,packageKey:row.package_key,name:row.name,description:row.description,currentVersion:row.current_version,status:row.status,systemManaged:Boolean(row.system_managed),manifest:parseJson(row.manifest_json,{}),checksumSha256:row.checksum_sha256,signatureStatus:row.signature_status,capabilities:parseJson(row.capabilities_json,[]),installedByUserId:row.installed_by_user_id,installedByName:row.installed_by_name,installedAt:row.installed_at,updatedAt:row.updated_at,enabledAt:row.enabled_at,disabledAt:row.disabled_at,failureDetails:row.failure_details,releases,contributions:contributions.map((item)=>({id:item.id,type:item.contribution_type,key:item.contribution_key,definition:parseJson(item.definition_json,{}),enabled:Boolean(item.enabled),createdAt:item.created_at})),bindings:bindings.map((item)=>({contributionType:item.contribution_type,contributionKey:item.contribution_key,resourceType:item.resource_type,resourceId:item.resource_id,createdAt:item.created_at,disabledAt:item.disabled_at,retiredAt:item.retired_at}))};
  }

  getByPackageKey(packageKey:string){const row=this.connection.prepare(`SELECT id FROM extensions WHERE package_key=?`).get(packageKey) as {id:string}|undefined;return row?this.getExtension(row.id):null;}

  async install(packageInput:unknown,context:InstallContext){
    const validated=validateExtensionPackage(packageInput,context.approvedCapabilities);const manifest=validated.package.manifest;const existing=this.getByPackageKey(manifest.packageKey) as any;
    if(existing&&existing.checksumSha256===validated.checksum)return {...existing,reused:true};
    if(existing&&existing.systemManaged)throw new Error('System-managed extension packages cannot be upgraded through the package API');
    if(existing&&compareSemver(manifest.version,existing.currentVersion)<=0)throw new Error(`Extension version must be newer than ${existing.currentVersion}`);
    const schemaAffecting=manifest.contributions.customFields.length>0||manifest.contributions.customEntities.length>0;let backupFilename:string|null=null;
    const attemptId=crypto.randomUUID();const startedAt=timestamp();this.connection.prepare(`INSERT INTO extension_install_attempts(id,package_key,version,actor_user_id,checksum_sha256,status,backup_filename,started_at) VALUES(?,?,?,?,?,'running',NULL,?)`).run(attemptId,manifest.packageKey,manifest.version,context.actorUserId,validated.checksum,startedAt);
    try{
      if(schemaAffecting){backupFilename=await BackupManager.createBackup({isPreMigration:true});this.connection.prepare(`UPDATE extension_install_attempts SET backup_filename=? WHERE id=?`).run(backupFilename,attemptId);}
      const extensionId=existing?.id??crypto.randomUUID();const releaseId=crypto.randomUUID();const installedAt=timestamp();
      this.connection.transaction(()=>{
        if(existing)this.connection.prepare(`UPDATE extension_releases SET status='superseded' WHERE extension_id=? AND status='active'`).run(extensionId);
        if(existing)this.connection.prepare(`UPDATE extensions SET name=?,description=?,current_version=?,status='enabled',manifest_json=?,checksum_sha256=?,signature_status=?,capabilities_json=?,installed_by_user_id=?,updated_at=?,enabled_at=?,disabled_at=NULL,failure_details=NULL WHERE id=?`).run(manifest.name,manifest.description??null,manifest.version,validated.canonicalManifest,validated.checksum,validated.signatureStatus,JSON.stringify(manifest.capabilities),context.actorUserId,installedAt,installedAt,extensionId);
        else this.connection.prepare(`INSERT INTO extensions(id,package_key,name,description,current_version,status,system_managed,manifest_json,checksum_sha256,signature_status,capabilities_json,installed_by_user_id,installed_at,updated_at,enabled_at) VALUES(?,?,?,?,?,'enabled',0,?,?,?,?,?,?,?,?)`).run(extensionId,manifest.packageKey,manifest.name,manifest.description??null,manifest.version,validated.canonicalManifest,validated.checksum,validated.signatureStatus,JSON.stringify(manifest.capabilities),context.actorUserId,installedAt,installedAt,installedAt);
        this.connection.prepare(`INSERT INTO extension_releases(id,extension_id,version,checksum_sha256,manifest_json,signature_status,status,backup_filename,installed_by_user_id,installed_at) VALUES(?,?,?,?,?,?,'active',?,?,?)`).run(releaseId,extensionId,manifest.version,validated.checksum,validated.canonicalManifest,validated.signatureStatus,backupFilename,context.actorUserId,installedAt);
        this.connection.prepare(`UPDATE extension_contributions SET enabled=0 WHERE extension_id=?`).run(extensionId);
        this.persistContributions(extensionId,releaseId,manifest,installedAt);
        const activeBindingKeys=this.applyDeclarativeMigrations(extensionId,releaseId,manifest,installedAt);
        const bindings=this.connection.prepare(`SELECT contribution_type,contribution_key FROM extension_bindings WHERE extension_id=?`).all(extensionId) as Array<{contribution_type:string;contribution_key:string}>;const retire=this.connection.prepare(`UPDATE extension_bindings SET retired_at=coalesce(retired_at,?),disabled_at=NULL WHERE extension_id=? AND contribution_type=? AND contribution_key=?`);
        for(const binding of bindings)if(!activeBindingKeys.has(`${binding.contribution_type}|${binding.contribution_key}`))retire.run(installedAt,extensionId,binding.contribution_type,binding.contribution_key);
        this.connection.prepare(`UPDATE extension_install_attempts SET status='succeeded',completed_at=? WHERE id=?`).run(installedAt,attemptId);
      })();
      return {...this.getExtension(extensionId),reused:false,backupFilename};
    }catch(error){const message=error instanceof Error?error.message:String(error);this.connection.prepare(`UPDATE extension_install_attempts SET status='failed',failure_details=?,completed_at=? WHERE id=?`).run(message.slice(0,4000),timestamp(),attemptId);throw error;}
  }

  setEnabled(id:string,enabled:boolean){
    const extension=this.getExtension(id) as any;if(!extension)throw new Error('Extension not found');if(extension.systemManaged&&!enabled)throw new Error('The legacy customisation bridge cannot be disabled');const now=timestamp();
    this.connection.transaction(()=>{
      this.connection.prepare(`UPDATE extensions SET status=?,updated_at=?,enabled_at=?,disabled_at=?,failure_details=NULL WHERE id=?`).run(enabled?'enabled':'disabled',now,enabled?now:extension.enabledAt,enabled?null:now,id);
      this.connection.prepare(`UPDATE extension_contributions SET enabled=? WHERE extension_id=? AND release_id=(SELECT id FROM extension_releases WHERE extension_id=? AND status='active')`).run(enabled?1:0,id,id);
      this.connection.prepare(`UPDATE extension_bindings SET disabled_at=? WHERE extension_id=? AND retired_at IS NULL`).run(enabled?null:now,id);
    })();
    return this.getExtension(id)!;
  }

  exportExtension(id:string){
    const extension=this.getExtension(id) as any;if(!extension)throw new Error('Extension not found');const attempts=this.connection.prepare(`SELECT package_key,version,actor_user_id,checksum_sha256,status,backup_filename,failure_details,started_at,completed_at FROM extension_install_attempts WHERE package_key=? ORDER BY started_at`).all(extension.packageKey);
    const migrations=this.connection.prepare(`SELECT release_id,migration_key,operation_type,operation_json,rollback_json,status,applied_at,failure_details FROM extension_migrations WHERE extension_id=? ORDER BY applied_at,migration_key`).all(id) as Array<Record<string,unknown>>;
    return {formatVersion:1,exportedAt:timestamp(),extension,attempts,migrations:migrations.map((item)=>({releaseId:item.release_id,migrationKey:item.migration_key,operationType:item.operation_type,operation:parseJson(item.operation_json,{}),rollback:parseJson(item.rollback_json,null),status:item.status,appliedAt:item.applied_at,failureDetails:item.failure_details}))};
  }

  private persistContributions(extensionId:string,releaseId:string,manifest:ExtensionManifest,createdAt:string):void {
    const insert=this.connection.prepare(`INSERT INTO extension_contributions(id,extension_id,release_id,contribution_type,contribution_key,definition_json,enabled,created_at) VALUES(?,?,?,?,?,?,1,?)`);
    for(const item of manifest.contributions.customFields)insert.run(crypto.randomUUID(),extensionId,releaseId,'custom_field',contributionKey('field',item.entityType,item.key),JSON.stringify(item),createdAt);
    for(const item of manifest.contributions.customEntities)insert.run(crypto.randomUUID(),extensionId,releaseId,'custom_entity',contributionKey('entity',item.key),JSON.stringify(item),createdAt);
    const categories:Array<[string,Array<Record<string,unknown>>,string]>=[
      ['form',manifest.contributions.forms as Array<Record<string,unknown>>,'key'],['view',manifest.contributions.views as Array<Record<string,unknown>>,'key'],['navigation',manifest.contributions.navigation as Array<Record<string,unknown>>,'key'],['theme',manifest.contributions.themes as Array<Record<string,unknown>>,'key'],['report',manifest.contributions.reports as Array<Record<string,unknown>>,'key'],['workflow_template',manifest.contributions.workflowTemplates as Array<Record<string,unknown>>,'key'],['event_subscription',manifest.contributions.eventSubscriptions as Array<Record<string,unknown>>,'key'],['localisation',manifest.contributions.localisations as Array<Record<string,unknown>>,'locale'],['asset',manifest.contributions.assets as Array<Record<string,unknown>>,'key'],
    ];
    for(const [type,items,keyField] of categories)for(const item of items)insert.run(crypto.randomUUID(),extensionId,releaseId,type,String(item[keyField]),JSON.stringify(item),createdAt);
  }

  private applyDeclarativeMigrations(extensionId:string,releaseId:string,manifest:ExtensionManifest,appliedAt:string):Set<string> {
    const active=new Set<string>();const namespace=namespaceFor(manifest.packageKey);
    for(const entity of manifest.contributions.customEntities){
      const key=contributionKey('entity',entity.key);const apiName=`${namespace}__${entity.key}`;const entityId=this.upsertCustomEntity(extensionId,key,{name:entity.name,apiName,pluralName:entity.pluralName,description:entity.description??null},appliedAt);active.add(`custom_entity|${key}`);this.recordMigration(extensionId,releaseId,key,'upsert_custom_entity',{resourceId:entityId,apiName},appliedAt);
      for(const field of entity.fields){const fieldKey=contributionKey('entity_field',entity.key,field.key);const fieldId=this.upsertCustomField(extensionId,fieldKey,{entityType:apiName,name:`${namespace}__${field.key}`,label:field.label,type:field.type,options:field.options,required:field.required},appliedAt);active.add(`custom_field|${fieldKey}`);this.recordMigration(extensionId,releaseId,fieldKey,'upsert_custom_field',{resourceId:fieldId,entityType:apiName},appliedAt);}
    }
    for(const field of manifest.contributions.customFields){const key=contributionKey('field',field.entityType,field.key);const fieldId=this.upsertCustomField(extensionId,key,{entityType:field.entityType,name:`${namespace}__${field.key}`,label:field.label,type:field.type,options:field.options,required:field.required},appliedAt);active.add(`custom_field|${key}`);this.recordMigration(extensionId,releaseId,key,'upsert_custom_field',{resourceId:fieldId,entityType:field.entityType},appliedAt);}
    return active;
  }

  private upsertCustomEntity(extensionId:string,key:string,input:{name:string;apiName:string;pluralName:string;description:string|null},createdAt:string):string {
    const binding=this.connection.prepare(`SELECT resource_id FROM extension_bindings WHERE extension_id=? AND contribution_type='custom_entity' AND contribution_key=?`).get(extensionId,key) as {resource_id:string}|undefined;
    if(binding){const row=this.connection.prepare(`SELECT id FROM custom_objects_definition WHERE id=?`).get(binding.resource_id);if(!row)throw new Error(`Bound custom entity is missing: ${key}`);this.connection.prepare(`UPDATE custom_objects_definition SET name=?,plural_name=?,description=? WHERE id=?`).run(input.name,input.pluralName,input.description,binding.resource_id);this.connection.prepare(`UPDATE extension_bindings SET disabled_at=NULL,retired_at=NULL WHERE extension_id=? AND contribution_type='custom_entity' AND contribution_key=?`).run(extensionId,key);return binding.resource_id;}
    const conflict=this.connection.prepare(`SELECT id FROM custom_objects_definition WHERE api_name=?`).get(input.apiName);if(conflict)throw new Error(`Custom entity API name already exists: ${input.apiName}`);const id=crypto.randomUUID();this.connection.prepare(`INSERT INTO custom_objects_definition(id,name,api_name,plural_name,description,created_at) VALUES(?,?,?,?,?,?)`).run(id,input.name,input.apiName,input.pluralName,input.description,createdAt);this.connection.prepare(`INSERT INTO extension_bindings(id,extension_id,contribution_type,contribution_key,resource_type,resource_id,created_at,disabled_at,retired_at) VALUES(?,?,'custom_entity',?,'custom_entity',?,?,NULL,NULL)`).run(crypto.randomUUID(),extensionId,key,id,createdAt);return id;
  }

  private upsertCustomField(extensionId:string,key:string,input:{entityType:string;name:string;label:string;type:string;options:string[];required:boolean},createdAt:string):string {
    const binding=this.connection.prepare(`SELECT resource_id FROM extension_bindings WHERE extension_id=? AND contribution_type='custom_field' AND contribution_key=?`).get(extensionId,key) as {resource_id:string}|undefined;
    if(binding){const row=this.connection.prepare(`SELECT entity_type,name,type FROM custom_fields_definition WHERE id=?`).get(binding.resource_id) as {entity_type:string;name:string;type:string}|undefined;if(!row)throw new Error(`Bound custom field is missing: ${key}`);if(row.entity_type!==input.entityType||row.name!==input.name||row.type!==input.type)throw new Error(`Custom field identity or type cannot change during upgrade: ${key}`);this.connection.prepare(`UPDATE custom_fields_definition SET label=?,options=?,required=? WHERE id=?`).run(input.label,JSON.stringify(input.options),input.required?1:0,binding.resource_id);this.connection.prepare(`UPDATE extension_bindings SET disabled_at=NULL,retired_at=NULL WHERE extension_id=? AND contribution_type='custom_field' AND contribution_key=?`).run(extensionId,key);return binding.resource_id;}
    const conflict=this.connection.prepare(`SELECT id FROM custom_fields_definition WHERE entity_type=? AND name=?`).get(input.entityType,input.name);if(conflict)throw new Error(`Custom field already exists: ${input.entityType}.${input.name}`);const id=crypto.randomUUID();this.connection.prepare(`INSERT INTO custom_fields_definition(id,entity_type,name,label,type,options,required,created_at) VALUES(?,?,?,?,?,?,?,?)`).run(id,input.entityType,input.name,input.label,input.type,JSON.stringify(input.options),input.required?1:0,createdAt);this.connection.prepare(`INSERT INTO extension_bindings(id,extension_id,contribution_type,contribution_key,resource_type,resource_id,created_at,disabled_at,retired_at) VALUES(?,?,'custom_field',?,'custom_field',?,?,NULL,NULL)`).run(crypto.randomUUID(),extensionId,key,id,createdAt);return id;
  }

  private recordMigration(extensionId:string,releaseId:string,key:string,operationType:string,operation:unknown,appliedAt:string):void {this.connection.prepare(`INSERT INTO extension_migrations(id,extension_id,release_id,migration_key,operation_type,operation_json,rollback_json,status,applied_at) VALUES(?,?,?,?,?,?,NULL,'applied',?)`).run(crypto.randomUUID(),extensionId,releaseId,key,operationType,JSON.stringify(operation),appliedAt);}
}
