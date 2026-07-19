import { randomUUID } from 'crypto';
import { and, desc, eq, isNull, asc } from 'drizzle-orm';
import type {
  IEngagementRepository,
  EngagementListOptions,
} from '../../../application/interfaces/IRepositories';
import { db } from '../connection';
import { engagements } from '../schema';
import {
  EngagementResponseSchema,
  type Engagement,
  type EngagementCreate,
  type EngagementUpdate,
} from 'shared';

type EngagementRow = typeof engagements.$inferSelect;
type EngagementInsert = typeof engagements.$inferInsert;
type EngagementUpdateRow = Partial<typeof engagements.$inferInsert>;

function mapRow(row: EngagementRow): Engagement {
  return EngagementResponseSchema.parse({
    id: row.id,
    organisationId: row.organisationId,
    primaryContactId: row.primaryContactId,
    name: row.name,
    type: row.type,
    status: row.status,
    summary: row.summary,
    startDate: row.startDate,
    endDate: row.endDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  });
}

function buildUpdateRow(patch: EngagementUpdate, updatedAt: string): EngagementUpdateRow {
  const update: EngagementUpdateRow = { updatedAt };
  if ('primaryContactId' in patch) update.primaryContactId = patch.primaryContactId ?? null;
  if ('name' in patch) update.name = patch.name;
  if ('type' in patch) update.type = patch.type;
  if ('status' in patch) update.status = patch.status;
  if ('summary' in patch) update.summary = patch.summary ?? null;
  if ('startDate' in patch) update.startDate = patch.startDate;
  if ('endDate' in patch) update.endDate = patch.endDate ?? null;
  return update;
}

export class EngagementRepository implements IEngagementRepository {
  async create(input: EngagementCreate): Promise<Engagement> {
    const now = new Date().toISOString();
    const row: EngagementInsert = {
      id: randomUUID(),
      organisationId: input.organisationId,
      primaryContactId: input.primaryContactId ?? null,
      name: input.name,
      type: input.type,
      status: input.status ?? 'proposed',
      summary: input.summary ?? null,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };

    db.insert(engagements).values(row).run();
    const created = await this.getById(row.id, { includeArchived: true });
    if (!created) {
      throw new Error('Engagement was not found after create');
    }
    return created;
  }

  async getById(
    id: string,
    options?: { includeArchived?: boolean },
  ): Promise<Engagement | null> {
    const predicates = [eq(engagements.id, id)];
    if (!options?.includeArchived) {
      predicates.push(isNull(engagements.archivedAt));
    }

    const row = db.select().from(engagements).where(and(...predicates)).get();
    return row ? mapRow(row) : null;
  }

  async list(options: EngagementListOptions): Promise<Engagement[]> {
    const predicates = [eq(engagements.organisationId, options.organisationId)];
    if (!options.includeArchived) {
      predicates.push(isNull(engagements.archivedAt));
    }
    if (options.status) {
      predicates.push(eq(engagements.status, options.status));
    }

    const rows = db.select()
      .from(engagements)
      .where(and(...predicates))
      .orderBy(desc(engagements.startDate), desc(engagements.createdAt), asc(engagements.id))
      .limit(options.limit)
      .offset(options.offset)
      .all();

    return rows.map(mapRow);
  }

  async update(id: string, patch: EngagementUpdate): Promise<Engagement | null> {
    const update = buildUpdateRow(patch, new Date().toISOString());

    db.update(engagements)
      .set(update)
      .where(and(eq(engagements.id, id), isNull(engagements.archivedAt)))
      .run();

    return this.getById(id, { includeArchived: true });
  }

  async archive(id: string, archivedAt: string): Promise<Engagement | null> {
    const existing = await this.getById(id, { includeArchived: true });
    if (!existing || existing.archivedAt) {
      return existing;
    }

    db.update(engagements)
      .set({ archivedAt, updatedAt: archivedAt })
      .where(eq(engagements.id, id))
      .run();

    return this.getById(id, { includeArchived: true });
  }
}
