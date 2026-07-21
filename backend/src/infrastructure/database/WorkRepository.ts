import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { sqlite } from './connection';

export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type WorkBucket = 'overdue' | 'today' | 'upcoming' | 'completed' | 'open' | 'all';

export interface TaskInput {
  organisationId: string;
  contactId?: string | null;
  engagementId?: string | null;
  activityId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: string | null;
  reminderAt?: string | null;
  recurrenceRule?: string | null;
  assignedTo?: string | null;
  createdBySource?: 'user' | 'workflow' | 'system';
  workflowRunId?: string | null;
}

export interface TaskPatch {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: string | null;
  reminderAt?: string | null;
  recurrenceRule?: string | null;
  assignedTo?: string | null;
}

const timestamp = () => new Date().toISOString();
const currentDay = () => timestamp().slice(0, 10);

function mapTask(row: Record<string, unknown>) {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    organisationName: row.organisation_name,
    contactId: row.contact_id,
    engagementId: row.engagement_id,
    activityId: row.activity_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at,
    reminderAt: row.reminder_at,
    recurrenceRule: row.recurrence_rule,
    assignedTo: row.assigned_to,
    createdBySource: row.created_by_source,
    workflowRunId: row.workflow_run_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export class WorkRepository {
  constructor(private readonly connection: Database.Database = sqlite as Database.Database) {}

  private requireOrganisation(organisationId: string): void {
    const row = this.connection.prepare('SELECT id FROM organisations WHERE id=? AND archived_at IS NULL').get(organisationId);
    if (!row) throw new Error('Organisation not found or archived');
  }

  listWork(input: { bucket?: WorkBucket; organisationId?: string; limit?: number; offset?: number } = {}) {
    const params = {
      bucket: input.bucket ?? 'open',
      organisationId: input.organisationId ?? null,
      today: currentDay(),
      limit: input.limit ?? 100,
      offset: input.offset ?? 0,
    };
    const cte = `
      WITH work_items AS (
        SELECT 'task' AS work_type,t.id AS source_id,t.organisation_id,o.name AS organisation_name,
          t.contact_id,t.engagement_id,t.title,coalesce(t.description,'') AS description,t.priority,t.status,
          t.due_at,t.completed_at,t.updated_at,'/work?taskId=' || t.id AS source_route
        FROM tasks t JOIN organisations o ON o.id=t.organisation_id WHERE t.archived_at IS NULL
        UNION ALL
        SELECT 'follow_up',a.id,a.organisation_id,o.name,a.contact_id,a.engagement_id,
          upper(substr(a.type,1,1)) || substr(a.type,2) || ' follow-up',a.body,'normal',
          CASE WHEN a.follow_up_completed_at IS NULL THEN 'open' ELSE 'completed' END,
          CASE WHEN a.follow_up_date IS NULL THEN NULL ELSE a.follow_up_date || 'T09:00:00.000Z' END,
          a.follow_up_completed_at,a.updated_at,
          '/organisations/' || a.organisation_id || '?tab=timeline&activityId=' || a.id
        FROM activities a JOIN organisations o ON o.id=a.organisation_id
        WHERE a.archived_at IS NULL AND a.follow_up_date IS NOT NULL
      )`;
    const filter = `
      WHERE (@organisationId IS NULL OR organisation_id=@organisationId)
        AND (
          @bucket='all'
          OR (@bucket='completed' AND status='completed')
          OR (@bucket='open' AND status NOT IN ('completed','cancelled'))
          OR (@bucket='overdue' AND status NOT IN ('completed','cancelled') AND due_at IS NOT NULL AND substr(due_at,1,10)<@today)
          OR (@bucket='today' AND status NOT IN ('completed','cancelled') AND substr(due_at,1,10)=@today)
          OR (@bucket='upcoming' AND status NOT IN ('completed','cancelled') AND due_at IS NOT NULL AND substr(due_at,1,10)>@today)
        )`;
    const rows = this.connection.prepare(`${cte}
      SELECT * FROM work_items ${filter}
      ORDER BY CASE WHEN status IN ('completed','cancelled') THEN 1 ELSE 0 END,
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        CASE WHEN due_at IS NULL THEN 1 ELSE 0 END,due_at,updated_at DESC
      LIMIT @limit OFFSET @offset
    `).all(params) as Array<Record<string, unknown>>;
    const total = (this.connection.prepare(`${cte} SELECT count(*) AS total FROM work_items ${filter}`).get(params) as { total: number }).total;
    return {
      items: rows.map((row) => ({
        workType: row.work_type,
        sourceId: row.source_id,
        organisationId: row.organisation_id,
        organisationName: row.organisation_name,
        contactId: row.contact_id,
        engagementId: row.engagement_id,
        title: row.title,
        description: row.description,
        priority: row.priority,
        status: row.status,
        dueAt: row.due_at,
        completedAt: row.completed_at,
        updatedAt: row.updated_at,
        sourceRoute: row.source_route,
      })),
      total,
      limit: params.limit,
      offset: params.offset,
      today: params.today,
    };
  }

  listTasks(input: { organisationId?: string; includeArchived?: boolean } = {}) {
    const rows = this.connection.prepare(`
      SELECT t.*,o.name AS organisation_name FROM tasks t JOIN organisations o ON o.id=t.organisation_id
      WHERE (@organisationId IS NULL OR t.organisation_id=@organisationId)
        AND (@includeArchived=1 OR t.archived_at IS NULL)
      ORDER BY CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,t.due_at,t.updated_at DESC
    `).all({ organisationId: input.organisationId ?? null, includeArchived: input.includeArchived ? 1 : 0 }) as Array<Record<string, unknown>>;
    return rows.map(mapTask);
  }

  getTask(id: string) {
    const row = this.connection.prepare(`SELECT t.*,o.name AS organisation_name FROM tasks t JOIN organisations o ON o.id=t.organisation_id WHERE t.id=?`).get(id) as Record<string, unknown> | undefined;
    return row ? mapTask(row) : null;
  }

  createTask(input: TaskInput) {
    this.requireOrganisation(input.organisationId);
    const id = randomUUID();
    const now = timestamp();
    const status = input.status ?? 'open';
    this.connection.prepare(`
      INSERT INTO tasks(id,organisation_id,contact_id,engagement_id,activity_id,source_type,source_id,title,description,
        status,priority,due_at,reminder_at,recurrence_rule,assigned_to,created_by_source,workflow_run_id,completed_at,
        created_at,updated_at,archived_at)
      VALUES(@id,@organisationId,@contactId,@engagementId,@activityId,@sourceType,@sourceId,@title,@description,
        @status,@priority,@dueAt,@reminderAt,@recurrenceRule,@assignedTo,@createdBySource,@workflowRunId,@completedAt,
        @now,@now,NULL)
    `).run({
      id,
      organisationId: input.organisationId,
      contactId: input.contactId ?? null,
      engagementId: input.engagementId ?? null,
      activityId: input.activityId ?? null,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status,
      priority: input.priority ?? 'normal',
      dueAt: input.dueAt ?? null,
      reminderAt: input.reminderAt ?? null,
      recurrenceRule: input.recurrenceRule ?? null,
      assignedTo: input.assignedTo?.trim() || null,
      createdBySource: input.createdBySource ?? 'user',
      workflowRunId: input.workflowRunId ?? null,
      completedAt: status === 'completed' ? now : null,
      now,
    });
    if (input.reminderAt) this.createReminder({ sourceType: 'task', sourceId: id, organisationId: input.organisationId, scheduledAt: input.reminderAt });
    return this.getTask(id)!;
  }

  updateTask(id: string, patch: TaskPatch) {
    const current = this.getTask(id);
    if (!current || current.archivedAt) throw new Error('Task not found');
    const columns: string[] = [];
    const params: Record<string, unknown> = { id, updatedAt: timestamp() };
    const map: Array<[keyof TaskPatch,string]> = [
      ['title','title'],['description','description'],['status','status'],['priority','priority'],
      ['dueAt','due_at'],['reminderAt','reminder_at'],['recurrenceRule','recurrence_rule'],['assignedTo','assigned_to'],
    ];
    for (const [key,column] of map) {
      if (Object.prototype.hasOwnProperty.call(patch,key)) {
        columns.push(`${column}=@${String(key)}`);
        params[String(key)] = patch[key] ?? null;
      }
    }
    if (patch.status === 'completed') { columns.push('completed_at=@completedAt'); params.completedAt = timestamp(); }
    if (patch.status && patch.status !== 'completed') columns.push('completed_at=NULL');
    if (!columns.length) return current;
    columns.push('updated_at=@updatedAt');
    this.connection.prepare(`UPDATE tasks SET ${columns.join(',')} WHERE id=@id`).run(params);
    if (patch.reminderAt) this.createReminder({ sourceType: 'task', sourceId: id, organisationId: String(current.organisationId), scheduledAt: patch.reminderAt });
    return this.getTask(id)!;
  }

  completeTask(id: string) { return this.updateTask(id,{ status: 'completed' }); }
  reopenTask(id: string) { return this.updateTask(id,{ status: 'open' }); }

  archiveTask(id: string) {
    const now = timestamp();
    const result = this.connection.prepare('UPDATE tasks SET archived_at=coalesce(archived_at,?),updated_at=? WHERE id=?').run(now,now,id);
    if (!result.changes) throw new Error('Task not found');
    return this.getTask(id)!;
  }

  createReminder(input: { sourceType: string; sourceId: string; organisationId?: string | null; scheduledAt: string; deliveryMethod?: string }) {
    const id = randomUUID();
    const now = timestamp();
    this.connection.prepare(`
      INSERT INTO reminders(id,source_type,source_id,organisation_id,scheduled_at,delivery_method,status,created_at,updated_at)
      VALUES(@id,@sourceType,@sourceId,@organisationId,@scheduledAt,@deliveryMethod,'pending',@now,@now)
    `).run({ id, sourceType: input.sourceType, sourceId: input.sourceId, organisationId: input.organisationId ?? null,
      scheduledAt: input.scheduledAt, deliveryMethod: input.deliveryMethod ?? 'in_app', now });
    return this.getReminder(id)!;
  }

  getReminder(id: string) {
    const row = this.connection.prepare('SELECT * FROM reminders WHERE id=?').get(id) as Record<string, unknown> | undefined;
    return row ? {
      id: row.id, sourceType: row.source_type, sourceId: row.source_id, organisationId: row.organisation_id,
      scheduledAt: row.scheduled_at, deliveryMethod: row.delivery_method, status: row.status,
      attemptedAt: row.attempted_at, deliveredAt: row.delivered_at, dismissedAt: row.dismissed_at,
      failureReason: row.failure_reason, createdAt: row.created_at, updatedAt: row.updated_at,
    } : null;
  }

  listReminders(input: { status?: string; dueOnly?: boolean } = {}) {
    const rows = this.connection.prepare(`
      SELECT id FROM reminders WHERE (@status IS NULL OR status=@status)
        AND (@dueOnly=0 OR (status='pending' AND scheduled_at<=@now)) ORDER BY scheduled_at
    `).all({ status: input.status ?? null, dueOnly: input.dueOnly ? 1 : 0, now: timestamp() }) as Array<{ id: string }>;
    return rows.map((row) => this.getReminder(row.id)!);
  }

  updateReminderStatus(id: string,status: 'delivered'|'dismissed'|'failed'|'cancelled',failureReason?: string|null) {
    const now = timestamp();
    const result = this.connection.prepare(`
      UPDATE reminders SET status=@status,attempted_at=@now,
        delivered_at=CASE WHEN @status='delivered' THEN @now ELSE delivered_at END,
        dismissed_at=CASE WHEN @status='dismissed' THEN @now ELSE dismissed_at END,
        failure_reason=@failureReason,updated_at=@now WHERE id=@id
    `).run({ id,status,now,failureReason: failureReason ?? null });
    if (!result.changes) throw new Error('Reminder not found');
    return this.getReminder(id)!;
  }
}
