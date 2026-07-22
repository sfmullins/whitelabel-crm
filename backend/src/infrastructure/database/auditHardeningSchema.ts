import type Database from 'better-sqlite3';

function auditHasForeignKeys(connection:Database.Database):boolean{
  return (connection.prepare(`PRAGMA foreign_key_list(audit_events)`).all() as Array<unknown>).length>0;
}

export function ensureAuditHardeningSchema(connection:Database.Database):void{
  if(auditHasForeignKeys(connection)){
    connection.transaction(()=>{
      connection.exec(`
        DROP TRIGGER IF EXISTS audit_events_immutable_update;
        DROP TRIGGER IF EXISTS audit_events_immutable_delete;
        ALTER TABLE audit_events RENAME TO audit_events_legacy_fk;
        CREATE TABLE audit_events (
          id TEXT PRIMARY KEY NOT NULL,
          actor_user_id TEXT,
          action TEXT NOT NULL,
          entity_type TEXT,
          entity_id TEXT,
          organisation_id TEXT,
          request_id TEXT NOT NULL,
          route TEXT NOT NULL,
          method TEXT NOT NULL,
          before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
          after_json TEXT CHECK(after_json IS NULL OR json_valid(after_json)),
          metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
          occurred_at TEXT NOT NULL
        );
        INSERT INTO audit_events(id,actor_user_id,action,entity_type,entity_id,organisation_id,request_id,route,method,before_json,after_json,metadata_json,occurred_at)
        SELECT id,actor_user_id,action,entity_type,entity_id,organisation_id,request_id,route,method,before_json,after_json,metadata_json,occurred_at FROM audit_events_legacy_fk;
        DROP TABLE audit_events_legacy_fk;
      `);
    })();
  }
  connection.exec(`
    CREATE INDEX IF NOT EXISTS audit_occurred_idx ON audit_events(occurred_at DESC);
    CREATE INDEX IF NOT EXISTS audit_actor_idx ON audit_events(actor_user_id,occurred_at DESC);
    CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_events(entity_type,entity_id,occurred_at DESC);
    CREATE TRIGGER IF NOT EXISTS audit_events_immutable_update
    BEFORE UPDATE ON audit_events BEGIN
      SELECT RAISE(ABORT,'Audit events are immutable');
    END;
    CREATE TRIGGER IF NOT EXISTS audit_events_immutable_delete
    BEFORE DELETE ON audit_events BEGIN
      SELECT RAISE(ABORT,'Audit events are immutable');
    END;
  `);
}
