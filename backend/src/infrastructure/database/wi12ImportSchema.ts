import type Database from 'better-sqlite3';

export function ensureWi12ImportSchema(connection:Database.Database):void{
  connection.exec(`
    CREATE TABLE IF NOT EXISTS instance_import_runs (
      id TEXT PRIMARY KEY NOT NULL,
      instance_id TEXT NOT NULL REFERENCES crm_instances(id) ON DELETE CASCADE,
      target TEXT NOT NULL CHECK(target IN ('organisations-and-contacts')),
      checksum TEXT NOT NULL CHECK(length(checksum)=64),
      mapping_json TEXT NOT NULL CHECK(json_valid(mapping_json)),
      duplicate_strategy TEXT NOT NULL CHECK(duplicate_strategy IN ('skip','reject')),
      status TEXT NOT NULL CHECK(status IN ('previewed','completed','failed')),
      row_count INTEGER NOT NULL DEFAULT 0 CHECK(row_count>=0),
      organisations_created INTEGER NOT NULL DEFAULT 0 CHECK(organisations_created>=0),
      contacts_created INTEGER NOT NULL DEFAULT 0 CHECK(contacts_created>=0),
      duplicates_skipped INTEGER NOT NULL DEFAULT 0 CHECK(duplicates_skipped>=0),
      result_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(result_json)),
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS instance_import_history_idx
      ON instance_import_runs(instance_id,created_at DESC);
  `);
}
