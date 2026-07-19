import { randomUUID } from 'crypto';
import type {
  IEngagementRepository,
  EngagementListOptions,
} from '../../../application/interfaces/IRepositories';
import { sqlite } from '../connection';
import type { Engagement, EngagementCreate, EngagementUpdate } from 'shared';

type EngagementRow = {
  id: string;
  organisation_id: string;
  primary_contact_id: string | null;
  name: string;
  type: Engagement['type'];
  status: Engagement['status'];
  summary: string | null;
  start_date: string;
  end_date: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

const columnByField: Record<keyof EngagementUpdate, string> = {
  primaryContactId: 'primary_contact_id',
  name: 'name',
  type: 'type',
  status: 'status',
  summary: 'summary',
  startDate: 'start_date',
  endDate: 'end_date',
};

function mapRow(row: EngagementRow): Engagement {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    primaryContactId: row.primary_contact_id,
    name: row.name,
    type: row.type,
    status: row.status,
    summary: row.summary,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export class EngagementRepository implements IEngagementRepository {
  async create(input: EngagementCreate): Promise<Engagement> {
    const id = randomUUID();
    const now = new Date().toISOString();

    sqlite.prepare(`
      insert into engagements (
        id, organisation_id, primary_contact_id, name, type, status, summary,
        start_date, end_date, created_at, updated_at, archived_at
      ) values (
        @id, @organisationId, @primaryContactId, @name, @type, @status, @summary,
        @startDate, @endDate, @now, @now, null
      )
    `).run({
      id,
      now,
      ...input,
      status: input.status ?? 'proposed',
      primaryContactId: input.primaryContactId ?? null,
      summary: input.summary ?? null,
      endDate: input.endDate ?? null,
    });

    return (await this.getById(id, { includeArchived: true }))!;
  }

  async getById(
    id: string,
    options?: { includeArchived?: boolean },
  ): Promise<Engagement | null> {
    const row = sqlite.prepare(`
      select * from engagements
      where id = @id ${options?.includeArchived ? '' : 'and archived_at is null'}
    `).get({ id }) as EngagementRow | undefined;

    return row ? mapRow(row) : null;
  }

  async list(options: EngagementListOptions): Promise<Engagement[]> {
    const where = ['organisation_id = @organisationId'];
    if (!options.includeArchived) {
      where.push('archived_at is null');
    }
    if (options.status) {
      where.push('status = @status');
    }

    const rows = sqlite.prepare(`
      select * from engagements
      where ${where.join(' and ')}
      order by start_date desc, created_at desc, id asc
      limit @limit offset @offset
    `).all(options) as EngagementRow[];

    return rows.map(mapRow);
  }

  async update(id: string, patch: EngagementUpdate): Promise<Engagement | null> {
    const now = new Date().toISOString();
    const setClauses = Object.keys(patch).map(
      (field) => `${columnByField[field as keyof EngagementUpdate]} = @${field}`,
    );

    const result = sqlite.prepare(`
      update engagements
      set ${setClauses.join(', ')}, updated_at = @now
      where id = @id and archived_at is null
    `).run({ id, now, ...patch });

    return result.changes ? this.getById(id, { includeArchived: true }) : null;
  }

  async archive(id: string, archivedAt: string): Promise<Engagement | null> {
    const existing = await this.getById(id, { includeArchived: true });
    if (!existing) {
      return null;
    }
    if (existing.archivedAt) {
      return existing;
    }

    sqlite.prepare(`
      update engagements
      set archived_at = @archivedAt, updated_at = @archivedAt
      where id = @id
    `).run({ id, archivedAt });

    return this.getById(id, { includeArchived: true });
  }
}
