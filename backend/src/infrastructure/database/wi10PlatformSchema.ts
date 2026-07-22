import type Database from 'better-sqlite3';

export const WI10_PERMISSIONS=[
  ['api.manage','Platform','Create, inspect and revoke API tokens'],
  ['webhooks.manage','Platform','Manage webhook subscriptions and deliveries'],
  ['platform.read','Platform','Inspect public API metadata and platform diagnostics'],
] as const;

export const WI10_TOKEN_SCOPES=[
  'crm.read',
  'crm.write',
  'crm.delete',
  'reports.read',
  'reports.export',
] as const;

export const WI10_EVENT_TYPES=[
  'organisation.created.v1',
  'organisation.updated.v1',
  'organisation.archived.v1',
  'contact.created.v1',
  'contact.updated.v1',
  'contact.archived.v1',
  'engagement.created.v1',
  'engagement.updated.v1',
  'engagement.archived.v1',
  'activity.created.v1',
  'activity.updated.v1',
  'activity.archived.v1',
] as const;

export function ensureWi10PlatformSchema(connection:Database.Database):void {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY NOT NULL,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK(length(trim(name))>0),
      token_prefix TEXT NOT NULL UNIQUE CHECK(length(token_prefix)>=8),
      token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
      scopes_json TEXT NOT NULL CHECK(json_valid(scopes_json)),
      created_at TEXT NOT NULL,
      expires_at TEXT,
      last_used_at TEXT,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS webhook_subscriptions (
      id TEXT PRIMARY KEY NOT NULL,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      name TEXT NOT NULL CHECK(length(trim(name))>0),
      endpoint_url TEXT NOT NULL CHECK(length(trim(endpoint_url))>0),
      event_types_json TEXT NOT NULL CHECK(json_valid(event_types_json)),
      credential_key TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
      consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK(consecutive_failures>=0),
      last_success_at TEXT,
      last_failure_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS platform_events (
      id TEXT PRIMARY KEY NOT NULL,
      event_type TEXT NOT NULL,
      event_version INTEGER NOT NULL DEFAULT 1 CHECK(event_version=1),
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT,
      actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      api_token_id TEXT REFERENCES api_tokens(id) ON DELETE SET NULL,
      request_id TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(payload_json)),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY NOT NULL,
      subscription_id TEXT NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL REFERENCES platform_events(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','succeeded','failed','dead')),
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
      next_attempt_at TEXT NOT NULL,
      response_status INTEGER,
      error_summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      delivered_at TEXT,
      UNIQUE(subscription_id,event_id)
    );

    CREATE INDEX IF NOT EXISTS api_token_owner_idx ON api_tokens(owner_user_id,revoked_at,expires_at);
    CREATE INDEX IF NOT EXISTS webhook_subscription_owner_idx ON webhook_subscriptions(owner_user_id,archived_at,enabled);
    CREATE INDEX IF NOT EXISTS platform_event_created_idx ON platform_events(created_at DESC,id DESC);
    CREATE INDEX IF NOT EXISTS platform_event_aggregate_idx ON platform_events(aggregate_type,aggregate_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS webhook_delivery_due_idx ON webhook_deliveries(status,next_attempt_at);
    CREATE INDEX IF NOT EXISTS webhook_delivery_subscription_idx ON webhook_deliveries(subscription_id,created_at DESC);

    CREATE TRIGGER IF NOT EXISTS platform_events_immutable_update
    BEFORE UPDATE ON platform_events BEGIN
      SELECT RAISE(ABORT,'Platform events are immutable');
    END;
    CREATE TRIGGER IF NOT EXISTS platform_events_immutable_delete
    BEFORE DELETE ON platform_events BEGIN
      SELECT RAISE(ABORT,'Platform events are immutable');
    END;
  `);

  const timestamp=new Date().toISOString();
  const permissionStatement=connection.prepare(`INSERT INTO permissions(key,category,description) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET category=excluded.category,description=excluded.description`);
  for(const permission of WI10_PERMISSIONS)permissionStatement.run(...permission);

  const roleRows=connection.prepare(`SELECT id,key FROM roles WHERE key IN ('owner','administrator','manager')`).all() as Array<{id:string;key:string}>;
  const mappingStatement=connection.prepare(`INSERT OR IGNORE INTO role_permissions(role_id,permission_key,created_at) VALUES(?,?,?)`);
  for(const role of roleRows){
    if(role.key==='owner'||role.key==='administrator')for(const permission of WI10_PERMISSIONS)mappingStatement.run(role.id,permission[0],timestamp);
    if(role.key==='manager')mappingStatement.run(role.id,'platform.read',timestamp);
  }
}
