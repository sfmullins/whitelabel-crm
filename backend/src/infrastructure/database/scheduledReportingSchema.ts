import type Database from 'better-sqlite3';

export function ensureScheduledReportingSchema(connection:Database.Database):void{
  connection.exec(`
    CREATE TABLE IF NOT EXISTS report_schedule_runs (
      id TEXT PRIMARY KEY NOT NULL,
      schedule_id TEXT NOT NULL REFERENCES report_schedules(id) ON DELETE CASCADE,
      saved_report_id TEXT NOT NULL REFERENCES saved_reports(id) ON DELETE CASCADE,
      report_key TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed')),
      filename TEXT,
      storage_path TEXT,
      byte_size INTEGER,
      error_summary TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      expires_at TEXT
    );
    CREATE INDEX IF NOT EXISTS report_schedule_run_status_idx ON report_schedule_runs(status,started_at DESC);
    CREATE INDEX IF NOT EXISTS report_schedule_run_report_idx ON report_schedule_runs(saved_report_id,started_at DESC);
  `);
}
