import type Database from 'better-sqlite3';

/**
 * WI5–WI7 prelaunch schema bootstrap.
 *
 * The product has no production data yet, so the operational model is established
 * directly and development databases are reset rather than carrying a compatibility
 * migration/backfill chain.
 */
export function ensureOperationalSchema(connection: Database.Database): void {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL CHECK(length(trim(title)) > 0),
      current_filename TEXT NOT NULL CHECK(length(trim(current_filename)) > 0),
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL CHECK(byte_size >= 0),
      checksum TEXT NOT NULL,
      storage_provider TEXT NOT NULL DEFAULT 'local' CHECK(storage_provider IN ('local')),
      storage_key TEXT NOT NULL UNIQUE,
      description TEXT,
      category TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY NOT NULL,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL CHECK(version_number > 0),
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL CHECK(byte_size >= 0),
      checksum TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      version_note TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(document_id, version_number)
    );

    CREATE TABLE IF NOT EXISTS document_links (
      id TEXT PRIMARY KEY NOT NULL,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('organisation','contact','engagement','activity','task','communication','calendar_event')),
      entity_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(document_id, entity_type, entity_id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      engagement_id TEXT REFERENCES engagements(id) ON DELETE SET NULL,
      activity_id TEXT REFERENCES activities(id) ON DELETE SET NULL,
      source_type TEXT,
      source_id TEXT,
      title TEXT NOT NULL CHECK(length(trim(title)) > 0),
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','blocked','completed','cancelled')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
      due_at TEXT,
      reminder_at TEXT,
      recurrence_rule TEXT,
      assigned_to TEXT,
      created_by_source TEXT NOT NULL DEFAULT 'user' CHECK(created_by_source IN ('user','workflow','system')),
      workflow_run_id TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT,
      CHECK((status = 'completed' AND completed_at IS NOT NULL) OR (status <> 'completed' AND completed_at IS NULL))
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('task','activity','communication','calendar_event','engagement','invoice')),
      source_id TEXT NOT NULL,
      organisation_id TEXT REFERENCES organisations(id) ON DELETE CASCADE,
      scheduled_at TEXT NOT NULL,
      delivery_method TEXT NOT NULL DEFAULT 'in_app' CHECK(delivery_method IN ('in_app','desktop')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','dismissed','failed','cancelled')),
      attempted_at TEXT,
      delivered_at TEXT,
      dismissed_at TEXT,
      failure_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS communications (
      id TEXT PRIMARY KEY NOT NULL,
      organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      engagement_id TEXT REFERENCES engagements(id) ON DELETE SET NULL,
      channel TEXT NOT NULL CHECK(channel IN ('email','meeting','phone','sms','whatsapp','teams','slack','voip','other')),
      direction TEXT NOT NULL DEFAULT 'internal' CHECK(direction IN ('inbound','outbound','internal')),
      subject TEXT,
      body TEXT NOT NULL CHECK(length(trim(body)) > 0),
      occurred_at TEXT NOT NULL,
      external_id TEXT,
      thread_key TEXT,
      status TEXT NOT NULL DEFAULT 'logged' CHECK(status IN ('logged','matched','unmatched','ignored','draft','sent','failed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT,
      UNIQUE(channel, external_id)
    );

    CREATE TABLE IF NOT EXISTS workflow_definitions (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK(length(trim(name)) > 0),
      description TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
      trigger_type TEXT NOT NULL,
      condition_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(condition_json)),
      action_json TEXT NOT NULL CHECK(json_valid(action_json)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY NOT NULL,
      workflow_definition_id TEXT NOT NULL REFERENCES workflow_definitions(id) ON DELETE RESTRICT,
      workflow_version INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('running','succeeded','partially_failed','failed','cancelled')),
      output_summary TEXT,
      failure_details TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS workflow_action_runs (
      id TEXT PRIMARY KEY NOT NULL,
      workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      action_index INTEGER NOT NULL CHECK(action_index >= 0),
      action_type TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','running','succeeded','failed','skipped')),
      output_json TEXT CHECK(output_json IS NULL OR json_valid(output_json)),
      failure_details TEXT,
      started_at TEXT,
      completed_at TEXT,
      UNIQUE(workflow_run_id, action_index)
    );

    CREATE INDEX IF NOT EXISTS document_updated_idx ON documents(updated_at DESC);
    CREATE INDEX IF NOT EXISTS document_link_entity_idx ON document_links(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS task_queue_idx ON tasks(status, due_at, priority);
    CREATE INDEX IF NOT EXISTS task_organisation_idx ON tasks(organisation_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS reminder_due_idx ON reminders(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS communication_org_idx ON communications(organisation_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS workflow_enabled_trigger_idx ON workflow_definitions(enabled, trigger_type);
    CREATE INDEX IF NOT EXISTS workflow_run_status_idx ON workflow_runs(status, started_at DESC);
  `);

  const hasSearch = connection.prepare(`
    SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'search_documents'
  `).get();
  if (!hasSearch) return;

  connection.exec(`
    CREATE TRIGGER IF NOT EXISTS wi5_tasks_search_ai AFTER INSERT ON tasks BEGIN
      INSERT INTO search_documents(id, entity_type, entity_id, organisation_id, title, subtitle, body, route, updated_at, archived_at)
      VALUES('task:' || new.id, 'task', new.id, new.organisation_id, new.title,
        upper(new.priority) || ' · ' || replace(new.status, '_', ' '), coalesce(new.description, ''),
        '/work?taskId=' || new.id, new.updated_at, new.archived_at)
      ON CONFLICT(entity_type, entity_id) DO UPDATE SET organisation_id=excluded.organisation_id, title=excluded.title,
        subtitle=excluded.subtitle, body=excluded.body, route=excluded.route, updated_at=excluded.updated_at, archived_at=excluded.archived_at;
    END;
    CREATE TRIGGER IF NOT EXISTS wi5_tasks_search_au AFTER UPDATE ON tasks BEGIN
      INSERT INTO search_documents(id, entity_type, entity_id, organisation_id, title, subtitle, body, route, updated_at, archived_at)
      VALUES('task:' || new.id, 'task', new.id, new.organisation_id, new.title,
        upper(new.priority) || ' · ' || replace(new.status, '_', ' '), coalesce(new.description, ''),
        '/work?taskId=' || new.id, new.updated_at, new.archived_at)
      ON CONFLICT(entity_type, entity_id) DO UPDATE SET organisation_id=excluded.organisation_id, title=excluded.title,
        subtitle=excluded.subtitle, body=excluded.body, route=excluded.route, updated_at=excluded.updated_at, archived_at=excluded.archived_at;
    END;
    CREATE TRIGGER IF NOT EXISTS wi5_tasks_search_ad AFTER DELETE ON tasks BEGIN
      DELETE FROM search_documents WHERE entity_type='task' AND entity_id=old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS wi5_documents_search_ai AFTER INSERT ON documents BEGIN
      INSERT INTO search_documents(id, entity_type, entity_id, organisation_id, title, subtitle, body, route, updated_at, archived_at)
      VALUES('document:' || new.id, 'document', new.id,
        (SELECT entity_id FROM document_links WHERE document_id=new.id AND entity_type='organisation' LIMIT 1),
        new.title, new.current_filename || ' · ' || new.mime_type, trim(coalesce(new.description,'') || ' ' || coalesce(new.category,'')),
        '/documents?documentId=' || new.id, new.updated_at, new.archived_at)
      ON CONFLICT(entity_type, entity_id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle,
        body=excluded.body, route=excluded.route, updated_at=excluded.updated_at, archived_at=excluded.archived_at;
    END;
    CREATE TRIGGER IF NOT EXISTS wi5_documents_search_au AFTER UPDATE ON documents BEGIN
      INSERT INTO search_documents(id, entity_type, entity_id, organisation_id, title, subtitle, body, route, updated_at, archived_at)
      VALUES('document:' || new.id, 'document', new.id,
        (SELECT entity_id FROM document_links WHERE document_id=new.id AND entity_type='organisation' LIMIT 1),
        new.title, new.current_filename || ' · ' || new.mime_type, trim(coalesce(new.description,'') || ' ' || coalesce(new.category,'')),
        '/documents?documentId=' || new.id, new.updated_at, new.archived_at)
      ON CONFLICT(entity_type, entity_id) DO UPDATE SET title=excluded.title, subtitle=excluded.subtitle,
        body=excluded.body, route=excluded.route, updated_at=excluded.updated_at, archived_at=excluded.archived_at;
    END;
    CREATE TRIGGER IF NOT EXISTS wi5_document_links_search_ai AFTER INSERT ON document_links WHEN new.entity_type='organisation' BEGIN
      UPDATE search_documents SET organisation_id=new.entity_id WHERE entity_type='document' AND entity_id=new.document_id;
    END;
    CREATE TRIGGER IF NOT EXISTS wi5_documents_search_ad AFTER DELETE ON documents BEGIN
      DELETE FROM search_documents WHERE entity_type='document' AND entity_id=old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS wi5_communications_search_ai AFTER INSERT ON communications BEGIN
      INSERT INTO search_documents(id, entity_type, entity_id, organisation_id, title, subtitle, body, route, updated_at, archived_at)
      VALUES('communication:' || new.id, 'communication', new.id, new.organisation_id,
        coalesce(nullif(trim(new.subject), ''), upper(substr(new.channel,1,1)) || substr(new.channel,2)),
        upper(new.direction) || ' · ' || replace(new.channel, '_', ' '), new.body,
        '/communications?communicationId=' || new.id, new.updated_at, new.archived_at)
      ON CONFLICT(entity_type, entity_id) DO UPDATE SET organisation_id=excluded.organisation_id, title=excluded.title,
        subtitle=excluded.subtitle, body=excluded.body, route=excluded.route, updated_at=excluded.updated_at, archived_at=excluded.archived_at;
    END;
    CREATE TRIGGER IF NOT EXISTS wi5_communications_search_au AFTER UPDATE ON communications BEGIN
      INSERT INTO search_documents(id, entity_type, entity_id, organisation_id, title, subtitle, body, route, updated_at, archived_at)
      VALUES('communication:' || new.id, 'communication', new.id, new.organisation_id,
        coalesce(nullif(trim(new.subject), ''), upper(substr(new.channel,1,1)) || substr(new.channel,2)),
        upper(new.direction) || ' · ' || replace(new.channel, '_', ' '), new.body,
        '/communications?communicationId=' || new.id, new.updated_at, new.archived_at)
      ON CONFLICT(entity_type, entity_id) DO UPDATE SET organisation_id=excluded.organisation_id, title=excluded.title,
        subtitle=excluded.subtitle, body=excluded.body, route=excluded.route, updated_at=excluded.updated_at, archived_at=excluded.archived_at;
    END;
    CREATE TRIGGER IF NOT EXISTS wi5_communications_search_ad AFTER DELETE ON communications BEGIN
      DELETE FROM search_documents WHERE entity_type='communication' AND entity_id=old.id;
    END;
  `);
}
