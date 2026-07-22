import type Database from 'better-sqlite3';

/** WI7 communications-hub extension. */
export function ensureCommunicationsHubSchema(connection: Database.Database): void {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS email_drafts (
      id TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL REFERENCES communication_accounts(id) ON DELETE CASCADE,
      thread_id TEXT REFERENCES email_threads(id) ON DELETE SET NULL,
      organisation_id TEXT REFERENCES organisations(id) ON DELETE SET NULL,
      contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      engagement_id TEXT REFERENCES engagements(id) ON DELETE SET NULL,
      mode TEXT NOT NULL DEFAULT 'new' CHECK(mode IN ('new','reply','reply_all','forward')),
      in_reply_to_message_id TEXT REFERENCES email_messages(id) ON DELETE SET NULL,
      to_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(to_json)),
      cc_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(cc_json)),
      bcc_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(bcc_json)),
      subject TEXT NOT NULL DEFAULT '',
      body_text TEXT NOT NULL DEFAULT '',
      body_html TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sending','sent','failed','discarded')),
      last_error TEXT,
      sent_message_id TEXT REFERENCES email_messages(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sent_at TEXT,
      discarded_at TEXT
    );

    CREATE TABLE IF NOT EXISTS email_draft_documents (
      id TEXT PRIMARY KEY NOT NULL,
      draft_id TEXT NOT NULL REFERENCES email_drafts(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      UNIQUE(draft_id, document_id)
    );

    CREATE TABLE IF NOT EXISTS outbound_email_attempts (
      id TEXT PRIMARY KEY NOT NULL,
      draft_id TEXT NOT NULL REFERENCES email_drafts(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES communication_accounts(id) ON DELETE CASCADE,
      explicit_confirmation INTEGER NOT NULL CHECK(explicit_confirmation = 1),
      status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed')),
      provider_message_key TEXT,
      rfc_message_id TEXT,
      error_summary TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS calendar_write_operations (
      id TEXT PRIMARY KEY NOT NULL,
      calendar_event_id TEXT REFERENCES calendar_events(id) ON DELETE SET NULL,
      calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
      operation TEXT NOT NULL CHECK(operation IN ('create','update','cancel','complete')),
      status TEXT NOT NULL CHECK(status IN ('running','succeeded','conflict','failed')),
      expected_etag TEXT,
      resulting_etag TEXT,
      provider_event_key TEXT,
      request_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(request_json)),
      error_summary TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS outbound_reconciliation_records (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('email','calendar')),
      source_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reconciled','failed')),
      error_summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      reconciled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS in_app_notifications (
      id TEXT PRIMARY KEY NOT NULL,
      reminder_id TEXT NOT NULL UNIQUE REFERENCES reminders(id) ON DELETE CASCADE,
      organisation_id TEXT REFERENCES organisations(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      route TEXT,
      status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','dismissed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      dismissed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS workflow_templates (
      id TEXT PRIMARY KEY NOT NULL,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      trigger_type TEXT NOT NULL,
      condition_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(condition_json)),
      action_json TEXT NOT NULL CHECK(json_valid(action_json)),
      built_in INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_policies (
      workflow_definition_id TEXT PRIMARY KEY REFERENCES workflow_definitions(id) ON DELETE CASCADE,
      max_runs_per_hour INTEGER NOT NULL DEFAULT 100 CHECK(max_runs_per_hour BETWEEN 1 AND 10000),
      timeout_ms INTEGER NOT NULL DEFAULT 10000 CHECK(timeout_ms BETWEEN 100 AND 300000),
      max_depth INTEGER NOT NULL DEFAULT 3 CHECK(max_depth BETWEEN 1 AND 20),
      dry_run INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS maintenance_runs (
      id TEXT PRIMARY KEY NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('document_integrity','search_reindex','communication_relink','storage_report')),
      status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed')),
      result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
      error_summary TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS email_draft_status_idx ON email_drafts(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS email_draft_org_idx ON email_drafts(organisation_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS outbound_attempt_status_idx ON outbound_email_attempts(status, started_at DESC);
    CREATE INDEX IF NOT EXISTS reconciliation_status_idx ON outbound_reconciliation_records(status, created_at);
    CREATE INDEX IF NOT EXISTS notification_status_idx ON in_app_notifications(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS calendar_write_status_idx ON calendar_write_operations(status, started_at DESC);
    CREATE INDEX IF NOT EXISTS maintenance_status_idx ON maintenance_runs(status, started_at DESC);
  `);

  const now = new Date().toISOString();
  const templates = [
    {key:'post_meeting_follow_up',name:'Post-meeting follow-up',description:'Create a follow-up task when a meeting is completed.',trigger:'meeting_completed',conditions:{},actions:[{type:'create_task',title:'Complete post-meeting follow-up',priority:'high'}]},
    {key:'important_email_review',name:'Important email review',description:'Create a review task for important inbound email.',trigger:'email_received',conditions:{subject:{contains:'important'}},actions:[{type:'create_task',title:'Review important email',priority:'high'}]},
    {key:'meeting_preparation',name:'Meeting preparation',description:'Create preparation work for a scheduled meeting.',trigger:'calendar_event_created',conditions:{},actions:[{type:'create_task',title:'Prepare for meeting',priority:'normal'}]},
    {key:'draft_customer_reply',name:'Draft customer reply',description:'Create a reviewable draft only. The workflow never sends it.',trigger:'email_received',conditions:{},actions:[{type:'create_email_draft',subject:'Re: {{subject}}',body:'Draft response for review.'}]},
  ];
  const statement = connection.prepare(`
    INSERT INTO workflow_templates(id,key,name,description,trigger_type,condition_json,action_json,built_in,created_at,updated_at)
    VALUES(@id,@key,@name,@description,@trigger,@conditions,@actions,1,@now,@now)
    ON CONFLICT(key) DO UPDATE SET name=excluded.name,description=excluded.description,trigger_type=excluded.trigger_type,
      condition_json=excluded.condition_json,action_json=excluded.action_json,updated_at=excluded.updated_at
  `);
  for (const template of templates) statement.run({id:`wi7-template-${template.key}`,key:template.key,name:template.name,description:template.description,trigger:template.trigger,conditions:JSON.stringify(template.conditions),actions:JSON.stringify(template.actions),now});
}
