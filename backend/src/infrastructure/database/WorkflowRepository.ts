import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { sqlite } from './connection';
import { WorkRepository, type TaskPriority } from './WorkRepository';

export interface WorkflowAction {
  type: 'create_task' | 'create_reminder' | 'create_activity';
  organisationId?: string;
  title?: string;
  description?: string;
  priority?: TaskPriority;
  dueAt?: string;
  sourceType?: string;
  sourceId?: string;
  scheduledAt?: string;
  deliveryMethod?: string;
  activityType?: 'note' | 'call' | 'email' | 'meeting' | 'message' | 'other';
  body?: string;
  contactId?: string;
  engagementId?: string;
}

const timestamp = () => new Date().toISOString();

function parseJson<T>(value: unknown,fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export class WorkflowRepository {
  private readonly work: WorkRepository;

  constructor(private readonly connection: Database.Database = sqlite as Database.Database) {
    this.work = new WorkRepository(connection);
  }

  createDefinition(input: { name: string; description?: string | null; enabled?: boolean; triggerType: string; conditions?: unknown; actions: WorkflowAction[] }) {
    const id = randomUUID();
    const now = timestamp();
    this.connection.prepare(`
      INSERT INTO workflow_definitions(id,name,description,enabled,version,trigger_type,condition_json,action_json,created_at,updated_at,archived_at)
      VALUES(@id,@name,@description,@enabled,1,@triggerType,@conditions,@actions,@now,@now,NULL)
    `).run({
      id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      enabled: input.enabled === false ? 0 : 1,
      triggerType: input.triggerType,
      conditions: JSON.stringify(input.conditions ?? {}),
      actions: JSON.stringify(input.actions),
      now,
    });
    return this.getDefinition(id)!;
  }

  getDefinition(id: string) {
    const row = this.connection.prepare('SELECT * FROM workflow_definitions WHERE id=?').get(id) as Record<string, unknown> | undefined;
    return row ? {
      id: row.id,
      name: row.name,
      description: row.description,
      enabled: Boolean(row.enabled),
      version: row.version,
      triggerType: row.trigger_type,
      conditions: parseJson(row.condition_json,{}),
      actions: parseJson<WorkflowAction[]>(row.action_json,[]),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archivedAt: row.archived_at,
    } : null;
  }

  listDefinitions() {
    const rows = this.connection.prepare('SELECT id FROM workflow_definitions WHERE archived_at IS NULL ORDER BY name').all() as Array<{ id: string }>;
    return rows.map((row) => this.getDefinition(row.id)!);
  }

  setEnabled(id: string,enabled: boolean) {
    const result = this.connection.prepare('UPDATE workflow_definitions SET enabled=?,updated_at=? WHERE id=? AND archived_at IS NULL').run(enabled ? 1 : 0,timestamp(),id);
    if (!result.changes) throw new Error('Workflow not found');
    return this.getDefinition(id)!;
  }

  archiveDefinition(id: string) {
    const now = timestamp();
    const result = this.connection.prepare('UPDATE workflow_definitions SET archived_at=coalesce(archived_at,?),enabled=0,updated_at=? WHERE id=?').run(now,now,id);
    if (!result.changes) throw new Error('Workflow not found');
    return this.getDefinition(id)!;
  }

  run(input: { workflowId: string; sourceType: string; sourceId: string; triggerEvent: string; idempotencyKey: string; context: Record<string,unknown> }) {
    const existing = this.connection.prepare('SELECT id FROM workflow_runs WHERE idempotency_key=?').get(input.idempotencyKey) as { id: string } | undefined;
    if (existing) return { ...this.getRun(existing.id),reused: true };
    const workflow = this.getDefinition(input.workflowId);
    if (!workflow || workflow.archivedAt || !workflow.enabled) throw new Error('Workflow is not available');

    const runId = randomUUID();
    const startedAt = timestamp();
    this.connection.prepare(`
      INSERT INTO workflow_runs(id,workflow_definition_id,workflow_version,source_type,source_id,trigger_event,idempotency_key,status,started_at)
      VALUES(?,?,?,?,?,?,?,'running',?)
    `).run(runId,input.workflowId,workflow.version,input.sourceType,input.sourceId,input.triggerEvent,input.idempotencyKey,startedAt);

    let failures = 0;
    const outputs: unknown[] = [];
    for (const [index,action] of workflow.actions.entries()) {
      const actionRunId = randomUUID();
      const actionStartedAt = timestamp();
      this.connection.prepare(`
        INSERT INTO workflow_action_runs(id,workflow_run_id,action_index,action_type,status,started_at)
        VALUES(?,?,?,?,'running',?)
      `).run(actionRunId,runId,index,action.type,actionStartedAt);
      try {
        const organisationId = action.organisationId ?? String(input.context.organisationId ?? '');
        let output: unknown;
        if (action.type === 'create_task') {
          output = this.work.createTask({
            organisationId,
            title: action.title ?? 'Workflow task',
            description: action.description ?? null,
            priority: action.priority ?? 'normal',
            dueAt: action.dueAt ?? null,
            createdBySource: 'workflow',
            workflowRunId: runId,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
          });
        } else if (action.type === 'create_reminder') {
          output = this.work.createReminder({
            sourceType: action.sourceType ?? input.sourceType,
            sourceId: action.sourceId ?? input.sourceId,
            organisationId: organisationId || null,
            scheduledAt: action.scheduledAt ?? String(input.context.scheduledAt ?? timestamp()),
            deliveryMethod: action.deliveryMethod ?? 'in_app',
          });
        } else if (action.type === 'create_activity') {
          if (!organisationId) throw new Error('create_activity requires organisationId');
          const organisation = this.connection.prepare('SELECT id FROM organisations WHERE id=? AND archived_at IS NULL').get(organisationId);
          if (!organisation) throw new Error('Organisation not found or archived');
          const id = randomUUID();
          const now = timestamp();
          this.connection.prepare(`
            INSERT INTO activities(id,organisation_id,contact_id,engagement_id,type,body,author,occurred_at,
              follow_up_date,follow_up_completed_at,source,source_reference,created_at,updated_at,archived_at)
            VALUES(@id,@organisationId,@contactId,@engagementId,@type,@body,'Workflow automation',@now,
              NULL,NULL,'system',@sourceReference,@now,@now,NULL)
          `).run({
            id,
            organisationId,
            contactId: action.contactId ?? null,
            engagementId: action.engagementId ?? null,
            type: action.activityType ?? 'note',
            body: action.body ?? 'Workflow activity',
            sourceReference: `workflow:${runId}:${index}`,
            now,
          });
          output = { id,organisationId };
        } else {
          throw new Error(`Unsupported workflow action: ${String(action.type)}`);
        }
        outputs.push(output);
        this.connection.prepare(`UPDATE workflow_action_runs SET status='succeeded',output_json=?,completed_at=? WHERE id=?`).run(JSON.stringify(output),timestamp(),actionRunId);
      } catch (error) {
        failures += 1;
        const message = error instanceof Error ? error.message : String(error);
        this.connection.prepare(`UPDATE workflow_action_runs SET status='failed',failure_details=?,completed_at=? WHERE id=?`).run(message,timestamp(),actionRunId);
      }
    }

    const status = failures === 0 ? 'succeeded' : failures === workflow.actions.length ? 'failed' : 'partially_failed';
    this.connection.prepare(`UPDATE workflow_runs SET status=?,output_summary=?,failure_details=?,completed_at=? WHERE id=?`).run(
      status,JSON.stringify(outputs),failures ? `${failures} action(s) failed` : null,timestamp(),runId,
    );
    return { ...this.getRun(runId),reused: false };
  }

  getRun(id: string) {
    const row = this.connection.prepare(`
      SELECT r.*,w.name AS workflow_name FROM workflow_runs r JOIN workflow_definitions w ON w.id=r.workflow_definition_id WHERE r.id=?
    `).get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    const actions = this.connection.prepare('SELECT * FROM workflow_action_runs WHERE workflow_run_id=? ORDER BY action_index').all(id) as Array<Record<string, unknown>>;
    return {
      id: row.id,
      workflowDefinitionId: row.workflow_definition_id,
      workflowName: row.workflow_name,
      workflowVersion: row.workflow_version,
      sourceType: row.source_type,
      sourceId: row.source_id,
      triggerEvent: row.trigger_event,
      idempotencyKey: row.idempotency_key,
      status: row.status,
      outputSummary: parseJson(row.output_summary,[]),
      failureDetails: row.failure_details,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      actions: actions.map((action) => ({
        id: action.id,
        actionIndex: action.action_index,
        actionType: action.action_type,
        status: action.status,
        output: parseJson(action.output_json,null),
        failureDetails: action.failure_details,
        startedAt: action.started_at,
        completedAt: action.completed_at,
      })),
    };
  }

  listRuns(limit=100) {
    const rows = this.connection.prepare('SELECT id FROM workflow_runs ORDER BY started_at DESC LIMIT ?').all(limit) as Array<{ id: string }>;
    return rows.map((row) => this.getRun(row.id)!);
  }
}
