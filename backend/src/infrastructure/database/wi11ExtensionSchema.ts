import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

export const WI11_PERMISSIONS=[
  ['extensions.read','Extensions','Inspect installed extension packages and contributions'],
  ['extensions.manage','Extensions','Validate, install, upgrade, enable and disable extension packages'],
] as const;

const LEGACY_EXTENSION_ID='00000000-0000-4000-8110-000000000001';
const LEGACY_RELEASE_ID='00000000-0000-4000-8110-000000000002';

function tableExists(connection:Database.Database,name:string):boolean{return Boolean(connection.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(name));}
function columnExists(connection:Database.Database,table:string,column:string):boolean{return (connection.prepare(`PRAGMA table_info(${table})`).all() as Array<{name:string}>).some((item)=>item.name===column);}
function stableKey(parts:string[]):string{return parts.map((part)=>part.trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'')||'item').join(':');}

function bridgeLegacyCustomisations(connection:Database.Database):void {
  if(!tableExists(connection,'custom_fields_definition')||!tableExists(connection,'custom_objects_definition'))return;
  const fields=connection.prepare(`SELECT id,entity_type,name,label,type,options,required,created_at FROM custom_fields_definition WHERE id NOT IN (SELECT resource_id FROM extension_bindings WHERE resource_type='custom_field') ORDER BY created_at,id`).all() as Array<Record<string,unknown>>;
  const entities=connection.prepare(`SELECT id,name,api_name,plural_name,description,created_at FROM custom_objects_definition WHERE id NOT IN (SELECT resource_id FROM extension_bindings WHERE resource_type='custom_entity') ORDER BY created_at,id`).all() as Array<Record<string,unknown>>;
  if(!fields.length&&!entities.length)return;
  const timestamp=new Date().toISOString();const manifest={formatVersion:1,packageKey:'legacy-customisations',name:'Legacy customisations',description:'System-managed compatibility bridge for custom fields and custom objects created before WI11.',version:'1.0.0',application:{minVersion:'1.0.0'},capabilities:['custom_fields','custom_entities'],contributions:{customFields:fields.length,customEntities:entities.length}};const manifestJson=JSON.stringify(manifest);const checksum=crypto.createHash('sha256').update(manifestJson).digest('hex');
  connection.prepare(`INSERT OR IGNORE INTO extensions(id,package_key,name,description,current_version,status,system_managed,manifest_json,checksum_sha256,signature_status,capabilities_json,installed_at,updated_at,enabled_at) VALUES(?,?,?,?,?,'enabled',1,?,?,'unsigned',?,?,?,?)`).run(LEGACY_EXTENSION_ID,'legacy-customisations','Legacy customisations','Compatibility bridge for pre-WI11 customisations','1.0.0',manifestJson,checksum,JSON.stringify(['custom_fields','custom_entities']),timestamp,timestamp,timestamp);
  connection.prepare(`INSERT OR IGNORE INTO extension_releases(id,extension_id,version,checksum_sha256,manifest_json,signature_status,status,installed_at) VALUES(?,?,?,?,?,'unsigned','active',?)`).run(LEGACY_RELEASE_ID,LEGACY_EXTENSION_ID,'1.0.0',checksum,manifestJson,timestamp);
  const contribution=connection.prepare(`INSERT OR IGNORE INTO extension_contributions(id,extension_id,release_id,contribution_type,contribution_key,definition_json,enabled,created_at) VALUES(?,?,?,?,?,?,1,?)`);const binding=connection.prepare(`INSERT OR IGNORE INTO extension_bindings(id,extension_id,contribution_type,contribution_key,resource_type,resource_id,created_at,disabled_at,retired_at) VALUES(?,?,?,?,?,?,?,NULL,NULL)`);
  for(const row of entities){const key=stableKey(['entity',String(row.api_name)]);contribution.run(crypto.randomUUID(),LEGACY_EXTENSION_ID,LEGACY_RELEASE_ID,'custom_entity',key,JSON.stringify(row),timestamp);binding.run(crypto.randomUUID(),LEGACY_EXTENSION_ID,'custom_entity',key,'custom_entity',row.id,timestamp);}
  for(const row of fields){const key=stableKey(['field',String(row.entity_type),String(row.name)]);contribution.run(crypto.randomUUID(),LEGACY_EXTENSION_ID,LEGACY_RELEASE_ID,'custom_field',key,JSON.stringify(row),timestamp);binding.run(crypto.randomUUID(),LEGACY_EXTENSION_ID,'custom_field',key,'custom_field',row.id,timestamp);}
}

export function ensureWi11ExtensionSchema(connection:Database.Database):void {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS extensions (
      id TEXT PRIMARY KEY NOT NULL,
      package_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      current_version TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('enabled','disabled','failed')),
      system_managed INTEGER NOT NULL DEFAULT 0 CHECK(system_managed IN (0,1)),
      manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
      checksum_sha256 TEXT NOT NULL CHECK(length(checksum_sha256)=64),
      signature_status TEXT NOT NULL CHECK(signature_status IN ('unsigned','verified')),
      capabilities_json TEXT NOT NULL CHECK(json_valid(capabilities_json)),
      installed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      installed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      enabled_at TEXT,
      disabled_at TEXT,
      failure_details TEXT
    );

    CREATE TABLE IF NOT EXISTS extension_releases (
      id TEXT PRIMARY KEY NOT NULL,
      extension_id TEXT NOT NULL REFERENCES extensions(id) ON DELETE RESTRICT,
      version TEXT NOT NULL,
      checksum_sha256 TEXT NOT NULL CHECK(length(checksum_sha256)=64),
      manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
      signature_status TEXT NOT NULL CHECK(signature_status IN ('unsigned','verified')),
      status TEXT NOT NULL CHECK(status IN ('active','superseded','failed')),
      backup_filename TEXT,
      installed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      installed_at TEXT NOT NULL,
      failure_details TEXT,
      UNIQUE(extension_id,version)
    );

    CREATE TABLE IF NOT EXISTS extension_contributions (
      id TEXT PRIMARY KEY NOT NULL,
      extension_id TEXT NOT NULL REFERENCES extensions(id) ON DELETE RESTRICT,
      release_id TEXT NOT NULL REFERENCES extension_releases(id) ON DELETE RESTRICT,
      contribution_type TEXT NOT NULL,
      contribution_key TEXT NOT NULL,
      definition_json TEXT NOT NULL CHECK(json_valid(definition_json)),
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
      created_at TEXT NOT NULL,
      UNIQUE(release_id,contribution_type,contribution_key)
    );

    CREATE TABLE IF NOT EXISTS extension_bindings (
      id TEXT PRIMARY KEY NOT NULL,
      extension_id TEXT NOT NULL REFERENCES extensions(id) ON DELETE RESTRICT,
      contribution_type TEXT NOT NULL,
      contribution_key TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      disabled_at TEXT,
      retired_at TEXT,
      UNIQUE(extension_id,contribution_type,contribution_key),
      UNIQUE(resource_type,resource_id)
    );

    CREATE TABLE IF NOT EXISTS extension_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      extension_id TEXT NOT NULL REFERENCES extensions(id) ON DELETE RESTRICT,
      release_id TEXT NOT NULL REFERENCES extension_releases(id) ON DELETE RESTRICT,
      migration_key TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      operation_json TEXT NOT NULL CHECK(json_valid(operation_json)),
      rollback_json TEXT CHECK(rollback_json IS NULL OR json_valid(rollback_json)),
      status TEXT NOT NULL CHECK(status IN ('applied','failed')),
      applied_at TEXT NOT NULL,
      failure_details TEXT,
      UNIQUE(extension_id,release_id,migration_key)
    );

    CREATE TABLE IF NOT EXISTS extension_install_attempts (
      id TEXT PRIMARY KEY NOT NULL,
      package_key TEXT NOT NULL,
      version TEXT NOT NULL,
      actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      checksum_sha256 TEXT NOT NULL CHECK(length(checksum_sha256)=64),
      status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed')),
      backup_filename TEXT,
      failure_details TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS extension_status_idx ON extensions(status,package_key);
    CREATE INDEX IF NOT EXISTS extension_release_idx ON extension_releases(extension_id,status,installed_at DESC);
    CREATE INDEX IF NOT EXISTS extension_contribution_idx ON extension_contributions(extension_id,release_id,contribution_type,enabled);
    CREATE INDEX IF NOT EXISTS extension_attempt_idx ON extension_install_attempts(package_key,started_at DESC);
  `);
  if(!columnExists(connection,'extension_bindings','retired_at'))connection.exec(`ALTER TABLE extension_bindings ADD COLUMN retired_at TEXT`);
  connection.exec(`CREATE INDEX IF NOT EXISTS extension_binding_idx ON extension_bindings(extension_id,resource_type,disabled_at,retired_at)`);

  const timestamp=new Date().toISOString();const permission=connection.prepare(`INSERT INTO permissions(key,category,description) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET category=excluded.category,description=excluded.description`);for(const row of WI11_PERMISSIONS)permission.run(...row);
  const roles=connection.prepare(`SELECT id,key FROM roles WHERE key IN ('owner','administrator','manager')`).all() as Array<{id:string;key:string}>;const assign=connection.prepare(`INSERT OR IGNORE INTO role_permissions(role_id,permission_key,created_at) VALUES(?,?,?)`);
  for(const role of roles){if(role.key==='owner'||role.key==='administrator')for(const row of WI11_PERMISSIONS)assign.run(role.id,row[0],timestamp);if(role.key==='manager')assign.run(role.id,'extensions.read',timestamp);}
  bridgeLegacyCustomisations(connection);
}
