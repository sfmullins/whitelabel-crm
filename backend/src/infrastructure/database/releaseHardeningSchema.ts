import type Database from 'better-sqlite3';

export function ensureReleaseHardeningSchema(connection:Database.Database):void {
  connection.exec(`
    CREATE TRIGGER IF NOT EXISTS release_email_reconciliation_cleanup
    AFTER DELETE ON email_drafts BEGIN
      DELETE FROM outbound_reconciliation_records WHERE kind='email' AND source_id=old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS release_calendar_reconciliation_cleanup
    AFTER DELETE ON calendar_write_operations BEGIN
      DELETE FROM outbound_reconciliation_records WHERE kind='calendar' AND source_id=old.id;
    END;
  `);
}
