import type Database from 'better-sqlite3';

export function ensureTemplateReportingSchema(connection:Database.Database):void{
  connection.exec(`
    CREATE TABLE IF NOT EXISTS report_builder_definitions (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK(length(trim(name))>0),
      description TEXT,
      source_key TEXT NOT NULL,
      columns_json TEXT NOT NULL CHECK(json_valid(columns_json)),
      filters_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(filters_json)),
      group_by TEXT,
      visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','team','all')),
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      owner_team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );
    CREATE INDEX IF NOT EXISTS report_builder_owner_idx
      ON report_builder_definitions(owner_user_id,owner_team_id,updated_at DESC);
  `);
}
