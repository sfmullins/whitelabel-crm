import type Database from 'better-sqlite3';

export const WORKSPACE_DESIGN_PERMISSIONS = [
  ['schema.manage', 'Workspace design', 'Create, change and permanently remove CRM objects, fields and relationships'],
  ['data.import', 'Workspace design', 'Preview and execute bulk CRM imports'],
] as const;

export function ensureWorkspaceDesignSchema(connection: Database.Database): void {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS workspace_navigation_preferences (
      scope_key TEXT PRIMARY KEY NOT NULL,
      scope_type TEXT NOT NULL CHECK(scope_type IN ('organisation','user')),
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      ordered_keys_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(ordered_keys_json)),
      updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK(
        (scope_type='organisation' AND scope_key='organisation' AND user_id IS NULL)
        OR
        (scope_type='user' AND scope_key='user:' || user_id AND user_id IS NOT NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS custom_object_relationships (
      id TEXT PRIMARY KEY NOT NULL,
      source_definition_id TEXT NOT NULL REFERENCES custom_objects_definition(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK(target_type IN ('customer','custom_object')),
      target_definition_id TEXT REFERENCES custom_objects_definition(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK(length(trim(name))>0),
      label TEXT NOT NULL CHECK(length(trim(label))>0),
      cardinality TEXT NOT NULL CHECK(cardinality IN ('many-to-one','one-to-many','one-to-one')),
      created_at TEXT NOT NULL,
      UNIQUE(source_definition_id,name),
      CHECK(
        (target_type='customer' AND target_definition_id IS NULL)
        OR
        (target_type='custom_object' AND target_definition_id IS NOT NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS custom_object_record_relationships (
      relationship_id TEXT NOT NULL REFERENCES custom_object_relationships(id) ON DELETE CASCADE,
      source_record_id TEXT NOT NULL REFERENCES custom_objects_records(id) ON DELETE CASCADE,
      target_customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
      target_record_id TEXT REFERENCES custom_objects_records(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY(relationship_id,source_record_id),
      CHECK(
        (target_customer_id IS NOT NULL AND target_record_id IS NULL)
        OR
        (target_customer_id IS NULL AND target_record_id IS NOT NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS relationship_source_idx
      ON custom_object_relationships(source_definition_id);
    CREATE INDEX IF NOT EXISTS record_relationship_target_record_idx
      ON custom_object_record_relationships(target_record_id);
    CREATE INDEX IF NOT EXISTS record_relationship_target_customer_idx
      ON custom_object_record_relationships(target_customer_id);

    CREATE TABLE IF NOT EXISTS bulk_import_runs (
      id TEXT PRIMARY KEY NOT NULL,
      target_key TEXT NOT NULL,
      filename TEXT NOT NULL,
      imported_count INTEGER NOT NULL DEFAULT 0 CHECK(imported_count>=0),
      rejected_count INTEGER NOT NULL DEFAULT 0 CHECK(rejected_count>=0),
      mapping_json TEXT NOT NULL CHECK(json_valid(mapping_json)),
      issues_json TEXT NOT NULL CHECK(json_valid(issues_json)),
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );
  `);

  const timestamp = new Date().toISOString();
  const insertPermission = connection.prepare(`
    INSERT INTO permissions(key,category,description) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET category=excluded.category,description=excluded.description
  `);
  for (const permission of WORKSPACE_DESIGN_PERMISSIONS) insertPermission.run(...permission);

  const roles = connection.prepare(`
    SELECT id,key FROM roles WHERE key IN ('owner','administrator','manager')
  `).all() as Array<{ id: string; key: string }>;
  const assign = connection.prepare(`
    INSERT OR IGNORE INTO role_permissions(role_id,permission_key,created_at) VALUES(?,?,?)
  `);
  for (const role of roles) {
    if (role.key === 'owner' || role.key === 'administrator') {
      assign.run(role.id, 'schema.manage', timestamp);
    }
    assign.run(role.id, 'data.import', timestamp);
  }
}
