import { randomUUID } from 'crypto';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type {
  IOrganisationRepository,
  OrganisationListOptions,
} from '../../../application/interfaces/IRepositories';
import { db } from '../connection';
import { organisations } from '../schema';
import {
  OrganisationResponseSchema,
  type Organisation,
  type OrganisationCreate,
  type OrganisationUpdate,
} from 'shared';

type OrganisationRow = typeof organisations.$inferSelect;
type OrganisationInsert = typeof organisations.$inferInsert;
type OrganisationUpdateRow = Partial<typeof organisations.$inferInsert>;

function mapRow(row: OrganisationRow): Organisation {
  return OrganisationResponseSchema.parse({
    id: row.id,
    name: row.name,
    legalName: row.legalName,
    website: row.website,
    industry: row.industry,
    employeeBand: row.employeeBand,
    annualRevenueBand: row.annualRevenueBand,
    country: row.country,
    status: row.status,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  });
}

function escapeLikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function buildUpdateRow(patch: OrganisationUpdate, updatedAt: string): OrganisationUpdateRow {
  const update: OrganisationUpdateRow = { updatedAt };
  if ('name' in patch) update.name = patch.name;
  if ('legalName' in patch) update.legalName = patch.legalName ?? null;
  if ('website' in patch) update.website = patch.website ?? null;
  if ('industry' in patch) update.industry = patch.industry ?? null;
  if ('employeeBand' in patch) update.employeeBand = patch.employeeBand ?? null;
  if ('annualRevenueBand' in patch) update.annualRevenueBand = patch.annualRevenueBand ?? null;
  if ('country' in patch) update.country = patch.country ?? null;
  if ('status' in patch) update.status = patch.status;
  if ('source' in patch) update.source = patch.source ?? null;
  return update;
}

export class OrganisationRepository implements IOrganisationRepository {
  async create(input: OrganisationCreate): Promise<Organisation> {
    const now = new Date().toISOString();
    const row: OrganisationInsert = {
      id: randomUUID(),
      name: input.name,
      legalName: input.legalName ?? null,
      website: input.website ?? null,
      industry: input.industry ?? null,
      employeeBand: input.employeeBand ?? null,
      annualRevenueBand: input.annualRevenueBand ?? null,
      country: input.country ?? null,
      status: input.status ?? 'prospect',
      source: input.source ?? null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };

    db.insert(organisations).values(row).run();
    const created = await this.getById(row.id, { includeArchived: true });
    if (!created) {
      throw new Error('Organisation was not found after create');
    }
    return created;
  }

  async getById(
    id: string,
    options?: { includeArchived?: boolean },
  ): Promise<Organisation | null> {
    const predicates = [eq(organisations.id, id)];
    if (!options?.includeArchived) {
      predicates.push(isNull(organisations.archivedAt));
    }

    const row = db.select().from(organisations).where(and(...predicates)).get();
    return row ? mapRow(row) : null;
  }

  async list(options: OrganisationListOptions): Promise<Organisation[]> {
    const predicates = [];
    if (!options.includeArchived) {
      predicates.push(isNull(organisations.archivedAt));
    }
    if (options.status) {
      predicates.push(eq(organisations.status, options.status));
    }
    if (options.search) {
      const pattern = `%${escapeLikeLiteral(options.search)}%`;
      predicates.push(sql`lower(${organisations.name}) like lower(${pattern}) escape '\\'`);
    }

    const rows = db.select()
      .from(organisations)
      .where(predicates.length ? and(...predicates) : undefined)
      .orderBy(sql`lower(${organisations.name})`, asc(organisations.id))
      .limit(options.limit)
      .offset(options.offset)
      .all();

    return rows.map(mapRow);
  }

  async update(id: string, patch: OrganisationUpdate): Promise<Organisation | null> {
    const update = buildUpdateRow(patch, new Date().toISOString());

    db.update(organisations)
      .set(update)
      .where(and(eq(organisations.id, id), isNull(organisations.archivedAt)))
      .run();

    return this.getById(id, { includeArchived: true });
  }

  async archive(id: string, archivedAt: string): Promise<Organisation | null> {
    const existing = await this.getById(id, { includeArchived: true });
    if (!existing || existing.archivedAt) {
      return existing;
    }

    db.update(organisations)
      .set({ archivedAt, updatedAt: archivedAt })
      .where(eq(organisations.id, id))
      .run();

    return this.getById(id, { includeArchived: true });
  }
}
