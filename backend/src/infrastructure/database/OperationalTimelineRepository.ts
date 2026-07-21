import type Database from 'better-sqlite3';
import { sqlite } from './connection';

const timestamp = () => new Date().toISOString();
const day = () => timestamp().slice(0,10);

export class OperationalTimelineRepository {
  constructor(private readonly connection: Database.Database = sqlite as Database.Database) {}

  list(organisationId: string,limit=100) {
    const organisation = this.connection.prepare('SELECT id FROM organisations WHERE id=?').get(organisationId);
    if (!organisation) throw new Error('Organisation not found');
    const rows = this.connection.prepare(`
      SELECT * FROM (
        SELECT 'task' AS event_type,id,coalesce(completed_at,created_at) AS occurred_at,title,
          coalesce(description,'') AS description,'/work?taskId=' || id AS source_route,status AS metadata
        FROM tasks WHERE organisation_id=@organisationId AND archived_at IS NULL
        UNION ALL
        SELECT 'document',d.id,d.created_at,d.title,coalesce(d.description,d.current_filename),
          '/documents?documentId=' || d.id,d.mime_type
        FROM documents d JOIN document_links l ON l.document_id=d.id AND l.entity_type='organisation'
        WHERE l.entity_id=@organisationId AND d.archived_at IS NULL
        UNION ALL
        SELECT 'communication',id,occurred_at,coalesce(subject,upper(substr(channel,1,1)) || substr(channel,2)),body,
          '/communications?communicationId=' || id,channel
        FROM communications WHERE organisation_id=@organisationId AND archived_at IS NULL
        UNION ALL
        SELECT 'workflow',r.id,r.started_at,w.name,coalesce(r.output_summary,''),'/automation?runId=' || r.id,r.status
        FROM workflow_runs r JOIN workflow_definitions w ON w.id=r.workflow_definition_id
        WHERE r.source_type='organisation' AND r.source_id=@organisationId
      ) ORDER BY occurred_at DESC LIMIT @limit
    `).all({ organisationId,limit }) as Array<Record<string,unknown>>;
    return rows.map((row) => ({
      eventType: row.event_type,
      id: row.id,
      occurredAt: row.occurred_at,
      title: row.title,
      description: row.description,
      sourceRoute: row.source_route,
      metadata: row.metadata,
    }));
  }

  summary() {
    const scalar = (sql: string,params: unknown[] = []) => (this.connection.prepare(sql).get(...params) as { value: number }).value;
    return {
      openTasks: scalar(`SELECT count(*) AS value FROM tasks WHERE archived_at IS NULL AND status NOT IN ('completed','cancelled')`),
      overdueTasks: scalar(`SELECT count(*) AS value FROM tasks WHERE archived_at IS NULL AND status NOT IN ('completed','cancelled') AND due_at IS NOT NULL AND substr(due_at,1,10)<?`,[day()]),
      dueReminders: scalar(`SELECT count(*) AS value FROM reminders WHERE status='pending' AND scheduled_at<=?`,[timestamp()]),
      documents: scalar(`SELECT count(*) AS value FROM documents WHERE archived_at IS NULL`),
      communications: scalar(`SELECT count(*) AS value FROM communications WHERE archived_at IS NULL`),
      failedWorkflowRuns: scalar(`SELECT count(*) AS value FROM workflow_runs WHERE status IN ('failed','partially_failed')`),
    };
  }
}
