import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Activity, ActivitySource, ActivityUpdate } from 'shared';
import { ActivityResponseSchema } from 'shared';
import type {
  ActivityListOptions,
  ActivityPersistenceCreate,
  IActivityRepository,
} from '../../../application/interfaces/IRepositories';
import { sqlite } from '../connection';

type ActivityRow = {
  id: string;
  organisation_id: string;
  contact_id: string | null;
  engagement_id: string | null;
  type: string;
  body: string;
  author: string;
  occurred_at: string;
  follow_up_date: string | null;
  follow_up_completed_at: string | null;
  source: ActivitySource;
  source_reference: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

const selectColumns = `
  id, organisation_id, contact_id, engagement_id, type, body, author,
  occurred_at, follow_up_date, follow_up_completed_at, source, source_reference,
  created_at, updated_at, archived_at
`;

function mapRow(row: ActivityRow): Activity {
  return ActivityResponseSchema.parse({
    id: row.id,
    organisationId: row.organisation_id,
    contactId: row.contact_id,
    engagementId: row.engagement_id,
    type: row.type,
    body: row.body,
    author: row.author,
    occurredAt: row.occurred_at,
    followUpDate: row.follow_up_date,
    followUpCompletedAt: row.follow_up_completed_at,
    source: row.source,
    sourceReference: row.source_reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  });
}

export class ActivityRepository implements IActivityRepository {
  constructor(private readonly connection: Database.Database = sqlite as Database.Database) {}

  async create(input: ActivityPersistenceCreate): Promise<Activity> {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.connection.prepare(`
      insert into activities (
        id, organisation_id, contact_id, engagement_id, type, body, author,
        occurred_at, follow_up_date, follow_up_completed_at, source, source_reference,
        created_at, updated_at, archived_at
      ) values (
        @id, @organisationId, @contactId, @engagementId, @type, @body, @author,
        @occurredAt, @followUpDate, null, @source, @sourceReference,
        @createdAt, @updatedAt, null
      )
    `).run({
      id,
      organisationId: input.organisationId,
      contactId: input.contactId ?? null,
      engagementId: input.engagementId ?? null,
      type: input.type,
      body: input.body.trim(),
      author: input.author.trim(),
      occurredAt: input.occurredAt,
      followUpDate: input.followUpDate ?? null,
      source: input.source,
      sourceReference: input.sourceReference ?? null,
      createdAt: now,
      updatedAt: now,
    });
    const created = await this.getById(id, { includeArchived: true });
    if (!created) throw new Error('Activity was not found after create');
    return created;
  }

  async getById(id: string, options?: { includeArchived?: boolean }): Promise<Activity | null> {
    const row = this.connection.prepare(`
      select ${selectColumns}
      from activities
      where id = @id ${options?.includeArchived ? '' : 'and archived_at is null'}
    `).get({ id }) as ActivityRow | undefined;
    return row ? mapRow(row) : null;
  }

  async list(options: ActivityListOptions): Promise<Activity[]> {
    const predicates: string[] = ['organisation_id = @organisationId'];
    const params: Record<string, string | number> = {
      organisationId: options.organisationId,
      limit: options.limit,
      offset: options.offset,
    };
    if (!options.includeArchived) predicates.push('archived_at is null');
    if (options.contactId) { predicates.push('contact_id = @contactId'); params.contactId = options.contactId; }
    if (options.engagementId) { predicates.push('engagement_id = @engagementId'); params.engagementId = options.engagementId; }
    if (options.type) { predicates.push('type = @type'); params.type = options.type; }
    if (options.occurredFrom) { predicates.push('occurred_at >= @occurredFrom'); params.occurredFrom = options.occurredFrom; }
    if (options.occurredTo) { predicates.push('occurred_at <= @occurredTo'); params.occurredTo = options.occurredTo; }
    if (options.followUpFrom) { predicates.push('follow_up_date >= @followUpFrom'); params.followUpFrom = options.followUpFrom; }
    if (options.followUpTo) { predicates.push('follow_up_date <= @followUpTo'); params.followUpTo = options.followUpTo; }

    const rows = this.connection.prepare(`
      select ${selectColumns}
      from activities
      where ${predicates.join(' and ')}
      order by occurred_at desc, created_at desc, id asc
      limit @limit offset @offset
    `).all(params) as ActivityRow[];
    return rows.map(mapRow);
  }

  async update(id: string, patch: ActivityUpdate): Promise<Activity | null> {
    const assignments = ['updated_at = @updatedAt'];
    const params: Record<string, string | null> = { id, updatedAt: new Date().toISOString() };
    if ('contactId' in patch) { assignments.push('contact_id = @contactId'); params.contactId = patch.contactId ?? null; }
    if ('engagementId' in patch) { assignments.push('engagement_id = @engagementId'); params.engagementId = patch.engagementId ?? null; }
    if (patch.type !== undefined) { assignments.push('type = @type'); params.type = patch.type; }
    if (patch.body !== undefined) { assignments.push('body = @body'); params.body = patch.body.trim(); }
    if (patch.author !== undefined) { assignments.push('author = @author'); params.author = patch.author.trim(); }
    if (patch.occurredAt !== undefined) { assignments.push('occurred_at = @occurredAt'); params.occurredAt = patch.occurredAt; }
    if ('followUpDate' in patch) {
      assignments.push('follow_up_date = @followUpDate');
      params.followUpDate = patch.followUpDate ?? null;
      if (patch.followUpDate === null) assignments.push('follow_up_completed_at = null');
    }
    const result = this.connection.prepare(`
      update activities set ${assignments.join(', ')}
      where id = @id and archived_at is null
    `).run(params);
    return result.changes === 1 ? this.getById(id, { includeArchived: true }) : null;
  }

  async archive(id: string, archivedAt: string): Promise<Activity | null> {
    this.connection.prepare(`
      update activities set archived_at = @archivedAt, updated_at = @archivedAt
      where id = @id and archived_at is null
    `).run({ id, archivedAt });
    return this.getById(id, { includeArchived: true });
  }

  async completeFollowUp(id: string, completedAt: string): Promise<Activity | null> {
    const result = this.connection.prepare(`
      update activities
      set follow_up_completed_at = @completedAt, updated_at = @completedAt
      where id = @id and archived_at is null and follow_up_date is not null
    `).run({ id, completedAt });
    return result.changes === 1 ? this.getById(id, { includeArchived: true }) : null;
  }

  async reopenFollowUp(id: string, updatedAt: string): Promise<Activity | null> {
    const result = this.connection.prepare(`
      update activities
      set follow_up_completed_at = null, updated_at = @updatedAt
      where id = @id and archived_at is null and follow_up_date is not null
    `).run({ id, updatedAt });
    return result.changes === 1 ? this.getById(id, { includeArchived: true }) : null;
  }
}
