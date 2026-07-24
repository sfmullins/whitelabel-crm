import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { DEFAULT_ONBOARDING_CONFIGURATION,OnboardingConfigurationSchema,type OnboardingConfiguration } from 'shared/onboarding';
import { LOCAL_OWNER_USER_ID } from './wi8Wi9Schema';
import { CredentialVault } from '../security/CredentialVault';

export const DEFAULT_INSTANCE_ID='00000000-0000-4000-8000-000000001200';
export const WI12_PERMISSIONS=[
  ['onboarding.read','Onboarding','View instance onboarding, readiness and published deployment information'],
  ['onboarding.manage','Onboarding','Edit draft instance configuration and run readiness validation'],
  ['deployment.publish','Onboarding','Publish, roll back and export signed deployment profiles'],
  ['devices.manage','Onboarding','Issue employee enrolments and revoke registered devices'],
] as const;

const now=()=>new Date().toISOString();
const checksum=(value:string)=>crypto.createHash('sha256').update(value,'utf8').digest('hex');
function clone<T>(value:T):T{return JSON.parse(JSON.stringify(value)) as T;}
function slugify(value:string):string{
  const normalized=value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64);
  return normalized.length>=2?normalized:'my-business';
}
function legacyConfiguration(connection:Database.Database):OnboardingConfiguration|null{
  const row=connection.prepare(`SELECT business_name,logo_url,primary_color,secondary_color,accent_color,address,phone,email,website,invoice_footer,default_tax_rate,currency,timezone,date_format FROM settings WHERE id='default'`).get() as Record<string,unknown>|undefined;
  if(!row)return null;
  const configuration=clone(DEFAULT_ONBOARDING_CONFIGURATION);
  configuration.identity.displayName=String(row.business_name||'Local CRM');
  configuration.identity.legalName=configuration.identity.displayName;
  configuration.identity.address=String(row.address||'Not supplied');
  configuration.identity.phone=String(row.phone||'Not supplied');
  configuration.identity.email=String(row.email||'owner@local.crm');
  configuration.identity.website=String(row.website||'');
  configuration.identity.supportEmail=configuration.identity.email;
  configuration.branding.logoUrl=String(row.logo_url||'');
  configuration.branding.primaryColor=String(row.primary_color||'#0f172a');
  configuration.branding.secondaryColor=String(row.secondary_color||'#3b82f6');
  configuration.branding.accentColor=String(row.accent_color||'#10b981');
  configuration.locale.currency=String(row.currency||'EUR').toUpperCase();
  configuration.locale.timezone=String(row.timezone||'Europe/Dublin');
  const dateFormat=String(row.date_format||'DD/MM/YYYY');
  configuration.locale.dateFormat=(['DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD'].includes(dateFormat)?dateFormat:'DD/MM/YYYY') as OnboardingConfiguration['locale']['dateFormat'];
  configuration.financial.invoiceFooter=String(row.invoice_footer||'Thank you for your business.');
  configuration.financial.defaultTaxRate=Number(row.default_tax_rate||0);
  configuration.deployment.instanceSlug=slugify(configuration.identity.displayName);
  configuration.deployment.mode='standalone';
  configuration.deployment.distributionMethod='standalone';
  configuration.security.backupConfigured=false;
  configuration.security.backupEncryptionConfirmed=false;
  configuration.security.restoreRehearsed=false;
  configuration.security.recoveryPlanConfirmed=false;
  configuration.security.retentionPolicyReviewed=false;
  return OnboardingConfigurationSchema.parse(configuration);
}

export interface Wi12OnboardingBootstrapOptions { initialConfiguration?:OnboardingConfiguration; }

export function ensureWi12OnboardingSchema(connection:Database.Database,options:Wi12OnboardingBootstrapOptions={}):void{
  connection.exec(`
    CREATE TABLE IF NOT EXISTS crm_instances (
      id TEXT PRIMARY KEY NOT NULL,
      slug TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK(length(trim(slug))>=2),
      status TEXT NOT NULL DEFAULT 'provisioning' CHECK(status IN ('provisioning','active','suspended')),
      deployment_mode TEXT NOT NULL DEFAULT 'managed' CHECK(deployment_mode IN ('managed','standalone')),
      current_published_revision_id TEXT,
      signing_credential_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS instance_configuration_revisions (
      id TEXT PRIMARY KEY NOT NULL,
      instance_id TEXT NOT NULL REFERENCES crm_instances(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK(revision>0),
      state TEXT NOT NULL CHECK(state IN ('draft','published','superseded','rolled_back')),
      configuration_json TEXT NOT NULL CHECK(json_valid(configuration_json)),
      checksum TEXT NOT NULL CHECK(length(checksum)=64),
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT,
      UNIQUE(instance_id,revision)
    );

    CREATE TABLE IF NOT EXISTS instance_publications (
      id TEXT PRIMARY KEY NOT NULL,
      instance_id TEXT NOT NULL REFERENCES crm_instances(id) ON DELETE RESTRICT,
      revision_id TEXT NOT NULL UNIQUE REFERENCES instance_configuration_revisions(id) ON DELETE RESTRICT,
      profile_json TEXT NOT NULL CHECK(json_valid(profile_json)),
      checksum TEXT NOT NULL CHECK(length(checksum)=64),
      signature TEXT NOT NULL,
      public_key TEXT NOT NULL,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      published_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS instance_readiness_runs (
      id TEXT PRIMARY KEY NOT NULL,
      instance_id TEXT NOT NULL REFERENCES crm_instances(id) ON DELETE CASCADE,
      revision_id TEXT NOT NULL REFERENCES instance_configuration_revisions(id) ON DELETE CASCADE,
      result_json TEXT NOT NULL CHECK(json_valid(result_json)),
      score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
      publishable INTEGER NOT NULL CHECK(publishable IN (0,1)),
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      validated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS instance_enrolments (
      id TEXT PRIMARY KEY NOT NULL,
      instance_id TEXT NOT NULL REFERENCES crm_instances(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_prefix TEXT NOT NULL,
      code_hash TEXT NOT NULL UNIQUE,
      device_limit INTEGER NOT NULL DEFAULT 1 CHECK(device_limit BETWEEN 1 AND 20),
      redeemed_count INTEGER NOT NULL DEFAULT 0 CHECK(redeemed_count>=0),
      expires_at TEXT NOT NULL,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      last_redeemed_at TEXT,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS instance_devices (
      id TEXT PRIMARY KEY NOT NULL,
      instance_id TEXT NOT NULL REFERENCES crm_instances(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      enrolment_id TEXT REFERENCES instance_enrolments(id) ON DELETE SET NULL,
      device_name TEXT NOT NULL CHECK(length(trim(device_name))>0),
      fingerprint_hash TEXT NOT NULL,
      registered_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      revoked_at TEXT,
      UNIQUE(instance_id,fingerprint_hash)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS instance_one_draft_idx ON instance_configuration_revisions(instance_id) WHERE state='draft';
    CREATE INDEX IF NOT EXISTS instance_revision_history_idx ON instance_configuration_revisions(instance_id,revision DESC);
    CREATE INDEX IF NOT EXISTS readiness_revision_idx ON instance_readiness_runs(revision_id,validated_at DESC);
    CREATE INDEX IF NOT EXISTS enrolment_expiry_idx ON instance_enrolments(instance_id,expires_at,revoked_at);
    CREATE INDEX IF NOT EXISTS device_user_idx ON instance_devices(instance_id,user_id,revoked_at);

    CREATE TRIGGER IF NOT EXISTS published_revision_payload_immutable
    BEFORE UPDATE OF revision,configuration_json,checksum,instance_id ON instance_configuration_revisions
    WHEN OLD.state!='draft'
    BEGIN SELECT RAISE(ABORT,'Published configuration payloads are immutable'); END;

    CREATE TRIGGER IF NOT EXISTS instance_publications_immutable_update
    BEFORE UPDATE ON instance_publications
    BEGIN SELECT RAISE(ABORT,'Instance publications are immutable'); END;

    CREATE TRIGGER IF NOT EXISTS instance_publications_immutable_delete
    BEFORE DELETE ON instance_publications
    BEGIN SELECT RAISE(ABORT,'Instance publications are immutable'); END;
  `);

  const timestamp=now();
  const permissionStatement=connection.prepare(`INSERT INTO permissions(key,category,description) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET category=excluded.category,description=excluded.description`);
  for(const permission of WI12_PERMISSIONS)permissionStatement.run(...permission);
  const roleRows=connection.prepare(`SELECT id,key FROM roles WHERE key IN ('owner','administrator')`).all() as Array<{id:string;key:string}>;
  const rolePermissionStatement=connection.prepare(`INSERT OR IGNORE INTO role_permissions(role_id,permission_key,created_at) VALUES(?,?,?)`);
  for(const role of roleRows)for(const permission of WI12_PERMISSIONS)rolePermissionStatement.run(role.id,permission[0],timestamp);

  const existing=connection.prepare(`SELECT id FROM crm_instances LIMIT 1`).get() as {id:string}|undefined;
  if(existing)return;
  const initial=options.initialConfiguration?clone(options.initialConfiguration):(legacyConfiguration(connection)??clone(DEFAULT_ONBOARDING_CONFIGURATION));
  const instanceId=DEFAULT_INSTANCE_ID;
  const serialized=JSON.stringify(initial);
  connection.prepare(`INSERT INTO crm_instances(id,slug,status,deployment_mode,current_published_revision_id,signing_credential_key,created_at,updated_at) VALUES(?,?, 'provisioning', ?,NULL,?,?,?)`).run(instanceId,initial.deployment.instanceSlug,initial.deployment.mode,`instance_signing_${instanceId.replace(/-/g,'')}`,timestamp,timestamp);
  connection.prepare(`INSERT INTO instance_configuration_revisions(id,instance_id,revision,state,configuration_json,checksum,created_by_user_id,created_at,updated_at,published_at) VALUES(?,?,1,'draft',?,?,?,?,?,NULL)`).run(crypto.randomUUID(),instanceId,serialized,checksum(serialized),LOCAL_OWNER_USER_ID,timestamp,timestamp);
}


export function resetWi12OnboardingState(connection:Database.Database,initialConfiguration?:OnboardingConfiguration):void{
  const existing=connection.prepare(`SELECT signing_credential_key FROM crm_instances LIMIT 1`).get() as {signing_credential_key:string}|undefined;
  connection.exec(`
    DROP TRIGGER IF EXISTS instance_publications_immutable_delete;
    DROP TRIGGER IF EXISTS instance_publications_immutable_update;
    DROP TRIGGER IF EXISTS published_revision_payload_immutable;
    DELETE FROM instance_import_runs;
    DELETE FROM instance_devices;
    DELETE FROM instance_enrolments;
    DELETE FROM instance_readiness_runs;
    DELETE FROM instance_publications;
    DELETE FROM instance_configuration_revisions;
    DELETE FROM crm_instances;
  `);
  if(existing){
    try{new CredentialVault().remove(existing.signing_credential_key);}catch{/* Development reset may run before a vault exists. */}
  }
  ensureWi12OnboardingSchema(connection,{initialConfiguration});
}
