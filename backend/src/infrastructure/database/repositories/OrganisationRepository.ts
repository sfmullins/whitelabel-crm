import { randomUUID } from 'crypto';
import type {
  IOrganisationRepository,
  OrganisationListOptions,
} from '../../../application/interfaces/IRepositories';
import { sqlite } from '../connection';
import type { Organisation, OrganisationCreate, OrganisationUpdate } from 'shared';

type OrganisationRow = {
  id: string;
  name: string;
  legal_name: string | null;
  website: string | null;
  industry: string | null;
  employee_band: Organisation['employeeBand'];
  annual_revenue_band: Organisation['annualRevenueBand'];
  country: string | null;
  status: Organisation['status'];
  source: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

const columnByField: Record<keyof OrganisationUpdate, string> = {
  name: 'name',
  legalName: 'legal_name',
  website: 'website',
  industry: 'industry',
  employeeBand: 'employee_band',
  annualRevenueBand: 'annual_revenue_band',
  country: 'country',
  status: 'status',
  source: 'source',
};

function mapRow(row: OrganisationRow): Organisation {
  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    website: row.website,
    industry: row.industry,
    employeeBand: row.employee_band,
    annualRevenueBand: row.annual_revenue_band,
    country: row.country,
    status: row.status,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function escapeLikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export class OrganisationRepository implements IOrganisationRepository {
  async create(input: OrganisationCreate): Promise<Organisation> {
    const id = randomUUID();
    const now = new Date().toISOString();

    sqlite.prepare(`
      insert into organisations (
        id, name, legal_name, website, industry, employee_band,
        annual_revenue_band, country, status, source, created_at, updated_at, archived_at
      ) values (
        @id, @name, @legalName, @website, @industry, @employeeBand,
        @annualRevenueBand, @country, @status, @source, @now, @now, null
      )
    `).run({
      id,
      now,
      ...input,
      status: input.status ?? 'prospect',
      legalName: input.legalName ?? null,
      website: input.website ?? null,
      industry: input.industry ?? null,
      employeeBand: input.employeeBand ?? null,
      annualRevenueBand: input.annualRevenueBand ?? null,
      country: input.country ?? null,
      source: input.source ?? null,
    });

    return (await this.getById(id, { includeArchived: true }))!;
  }

  async getById(
    id: string,
    options?: { includeArchived?: boolean },
  ): Promise<Organisation | null> {
    const row = sqlite.prepare(`
      select * from organisations
      where id = @id ${options?.includeArchived ? '' : 'and archived_at is null'}
    `).get({ id }) as OrganisationRow | undefined;

    return row ? mapRow(row) : null;
  }

  async list(options: OrganisationListOptions): Promise<Organisation[]> {
    const where: string[] = [];
    const params: Record<string, unknown> = {
      limit: options.limit,
      offset: options.offset,
    };

    if (!options.includeArchived) {
      where.push('archived_at is null');
    }
    if (options.status) {
      where.push('status = @status');
      params.status = options.status;
    }
    if (options.search) {
      where.push("lower(name) like lower(@search) escape '\\'");
      params.search = `%${escapeLikeLiteral(options.search)}%`;
    }

    const rows = sqlite.prepare(`
      select * from organisations
      ${where.length ? `where ${where.join(' and ')}` : ''}
      order by lower(name) asc, id asc
      limit @limit offset @offset
    `).all(params) as OrganisationRow[];

    return rows.map(mapRow);
  }

  async update(id: string, patch: OrganisationUpdate): Promise<Organisation | null> {
    const now = new Date().toISOString();
    const setClauses = Object.keys(patch).map(
      (field) => `${columnByField[field as keyof OrganisationUpdate]} = @${field}`,
    );

    const result = sqlite.prepare(`
      update organisations
      set ${setClauses.join(', ')}, updated_at = @now
      where id = @id and archived_at is null
    `).run({ id, now, ...patch });

    return result.changes ? this.getById(id, { includeArchived: true }) : null;
  }

  async archive(id: string, archivedAt: string): Promise<Organisation | null> {
    const existing = await this.getById(id, { includeArchived: true });
    if (!existing) {
      return null;
    }
    if (existing.archivedAt) {
      return existing;
    }

    sqlite.prepare(`
      update organisations
      set archived_at = @archivedAt, updated_at = @archivedAt
      where id = @id
    `).run({ id, archivedAt });

    return this.getById(id, { includeArchived: true });
  }
}
