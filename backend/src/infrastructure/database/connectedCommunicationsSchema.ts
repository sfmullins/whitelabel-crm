import type Database from 'better-sqlite3';

/** WI6 connected-communications schema. */
export function ensureConnectedCommunicationsSchema(connection: Database.Database): void {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS communication_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('email','calendar')),
      name TEXT NOT NULL CHECK(length(trim(name)) > 0),
      server_url TEXT NOT NULL CHECK(length(trim(server_url)) > 0),
      username TEXT NOT NULL CHECK(length(trim(username)) > 0),
      credential_key TEXT NOT NULL UNIQUE,
      settings_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(settings_json)),
      enabled INTEGER NOT NULL DEFAULT 1,
      health_status TEXT NOT NULL DEFAULT 'unverified' CHECK(health_status IN ('unverified','healthy','degraded','failed','paused')),
      sync_cursor TEXT,
      last_sync_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS email_threads (
      id TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL REFERENCES communication_accounts(id) ON DELETE CASCADE,
      provider_thread_key TEXT NOT NULL,
      subject TEXT,
      latest_message_at TEXT NOT NULL,
      organisation_id TEXT REFERENCES organisations(id) ON DELETE SET NULL,
      contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      match_status TEXT NOT NULL DEFAULT 'unmatched' CHECK(match_status IN ('matched','suggested','unmatched','ignored')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(account_id, provider_thread_key)
    );

    CREATE TABLE IF NOT EXISTS email_messages (
      id TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL REFERENCES communication_accounts(id) ON DELETE CASCADE,
      thread_id TEXT NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
      provider_message_key TEXT NOT NULL,
      rfc_message_id TEXT,
      direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
      sender_json TEXT NOT NULL CHECK(json_valid(sender_json)),
      recipients_json TEXT NOT NULL CHECK(json_valid(recipients_json)),
      subject TEXT,
      body_text TEXT NOT NULL DEFAULT '',
      body_html TEXT,
      sent_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      raw_headers_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(raw_headers_json)),
      communication_id TEXT REFERENCES communications(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(account_id, provider_message_key),
      UNIQUE(account_id, rfc_message_id)
    );

    CREATE TABLE IF NOT EXISTS email_ingestion_state (
      email_message_id TEXT PRIMARY KEY NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','complete','failed')),
      error_summary TEXT,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS email_attachments (
      id TEXT PRIMARY KEY NOT NULL,
      email_message_id TEXT NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
      content_id TEXT,
      inline INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(email_message_id, document_id)
    );

    CREATE TABLE IF NOT EXISTS email_attachment_imports (
      email_message_id TEXT NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
      source_fingerprint TEXT NOT NULL,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      PRIMARY KEY(email_message_id, source_fingerprint)
    );

    CREATE TABLE IF NOT EXISTS calendars (
      id TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL REFERENCES communication_accounts(id) ON DELETE CASCADE,
      provider_calendar_key TEXT NOT NULL,
      display_name TEXT NOT NULL,
      color TEXT,
      selected INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(account_id, provider_calendar_key)
    );

    CREATE TABLE IF NOT EXISTS calendar_sync_state (
      calendar_id TEXT PRIMARY KEY NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
      sync_token TEXT,
      last_sync_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY NOT NULL,
      calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
      provider_event_key TEXT NOT NULL,
      etag TEXT,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      recurrence_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(recurrence_json)),
      attendees_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(attendees_json)),
      cancelled INTEGER NOT NULL DEFAULT 0,
      organisation_id TEXT REFERENCES organisations(id) ON DELETE SET NULL,
      contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      engagement_id TEXT REFERENCES engagements(id) ON DELETE SET NULL,
      match_status TEXT NOT NULL DEFAULT 'unmatched' CHECK(match_status IN ('matched','suggested','unmatched','ignored')),
      communication_id TEXT REFERENCES communications(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(calendar_id, provider_event_key)
    );

    CREATE TABLE IF NOT EXISTS calendar_event_resources (
      calendar_event_id TEXT PRIMARY KEY NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
      calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
      resource_href TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(calendar_id, resource_href)
    );

    CREATE TABLE IF NOT EXISTS synchronization_runs (
      id TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL REFERENCES communication_accounts(id) ON DELETE CASCADE,
      sync_type TEXT NOT NULL CHECK(sync_type IN ('email','calendar','account_test')),
      status TEXT NOT NULL CHECK(status IN ('running','succeeded','partially_failed','failed')),
      cursor_before TEXT,
      cursor_after TEXT,
      fetched_count INTEGER NOT NULL DEFAULT 0,
      created_count INTEGER NOT NULL DEFAULT 0,
      updated_count INTEGER NOT NULL DEFAULT 0,
      matched_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      error_summary TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS match_suggestions (
      id TEXT PRIMARY KEY NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('email_thread','calendar_event')),
      source_id TEXT NOT NULL,
      suggested_organisation_id TEXT REFERENCES organisations(id) ON DELETE CASCADE,
      suggested_contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      confidence INTEGER NOT NULL CHECK(confidence BETWEEN 0 AND 100),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','expired')),
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      UNIQUE(source_type, source_id, suggested_organisation_id, suggested_contact_id)
    );

    CREATE INDEX IF NOT EXISTS account_kind_health_idx ON communication_accounts(kind, health_status, enabled);
    CREATE INDEX IF NOT EXISTS email_thread_match_idx ON email_threads(match_status, latest_message_at DESC);
    CREATE INDEX IF NOT EXISTS email_message_thread_idx ON email_messages(thread_id, sent_at DESC);
    CREATE INDEX IF NOT EXISTS email_ingestion_status_idx ON email_ingestion_state(status, updated_at);
    CREATE INDEX IF NOT EXISTS calendar_event_time_idx ON calendar_events(starts_at, ends_at);
    CREATE INDEX IF NOT EXISTS calendar_event_match_idx ON calendar_events(match_status, starts_at);
    CREATE INDEX IF NOT EXISTS calendar_resource_href_idx ON calendar_event_resources(calendar_id, resource_href);
    CREATE INDEX IF NOT EXISTS synchronization_account_idx ON synchronization_runs(account_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS match_suggestion_pending_idx ON match_suggestions(status, confidence DESC);
  `);
}
