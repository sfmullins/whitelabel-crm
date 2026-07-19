import { randomUUID } from 'crypto';
import type {
  IContactRepository,
  ContactListOptions,
} from '../../../application/interfaces/IRepositories';
import { sqlite } from '../connection';
import type { Contact, ContactCreate, ContactUpdate } from 'shared';

type ContactRow = {
  id: string;
  organisation_id: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: number | boolean;
  status: Contact['status'];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

const columnByField: Record<keyof ContactUpdate, string> = {
  firstName: 'first_name',
  lastName: 'last_name',
  jobTitle: 'job_title',
  email: 'email',
  phone: 'phone',
  isPrimary: 'is_primary',
  status: 'status',
};

function mapRow(row: ContactRow): Contact {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    firstName: row.first_name,
    lastName: row.last_name,
    jobTitle: row.job_title,
    email: row.email,
    phone: row.phone,
    isPrimary: Boolean(row.is_primary),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function inputParams(input: ContactCreate, id: string, now: string) {
  return {
    id,
    now,
    ...input,
    status: input.status ?? 'active',
    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
    jobTitle: input.jobTitle ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    isPrimary: input.isPrimary ? 1 : 0,
  };
}

function patchParams(id: string, now: string, patch: ContactUpdate) {
  return {
    id,
    now,
    ...patch,
    isPrimary: patch.isPrimary === undefined ? undefined : patch.isPrimary ? 1 : 0,
  };
}

export class ContactRepository implements IContactRepository {
  async create(input: ContactCreate): Promise<Contact> {
    const id = randomUUID();
    const now = new Date().toISOString();

    sqlite.prepare(`
      insert into contacts (
        id, organisation_id, first_name, last_name, job_title, email, phone,
        is_primary, status, created_at, updated_at, archived_at
      ) values (
        @id, @organisationId, @firstName, @lastName, @jobTitle, @email, @phone,
        @isPrimary, @status, @now, @now, null
      )
    `).run(inputParams(input, id, now));

    return (await this.getById(id, { includeArchived: true }))!;
  }

  async createPrimary(input: ContactCreate): Promise<Contact> {
    let id = '';

    sqlite.transaction(() => {
      const now = new Date().toISOString();
      id = randomUUID();

      sqlite.prepare(`
        update contacts
        set is_primary = 0, updated_at = @now
        where organisation_id = @organisationId
          and archived_at is null
          and is_primary = 1
      `).run({ organisationId: input.organisationId, now });

      sqlite.prepare(`
        insert into contacts (
          id, organisation_id, first_name, last_name, job_title, email, phone,
          is_primary, status, created_at, updated_at, archived_at
        ) values (
          @id, @organisationId, @firstName, @lastName, @jobTitle, @email, @phone,
          1, @status, @now, @now, null
        )
      `).run(inputParams({ ...input, isPrimary: true }, id, now));
    })();

    return (await this.getById(id, { includeArchived: true }))!;
  }

  async getById(
    id: string,
    options?: { includeArchived?: boolean },
  ): Promise<Contact | null> {
    const row = sqlite.prepare(`
      select * from contacts
      where id = @id ${options?.includeArchived ? '' : 'and archived_at is null'}
    `).get({ id }) as ContactRow | undefined;

    return row ? mapRow(row) : null;
  }

  async list(options: ContactListOptions): Promise<Contact[]> {
    const where = ['organisation_id = @organisationId'];
    if (!options.includeArchived) {
      where.push('archived_at is null');
    }
    if (options.status) {
      where.push('status = @status');
    }

    const rows = sqlite.prepare(`
      select * from contacts
      where ${where.join(' and ')}
      order by is_primary desc,
        lower(coalesce(last_name, '')) asc,
        lower(coalesce(first_name, '')) asc,
        id asc
      limit @limit offset @offset
    `).all(options) as ContactRow[];

    return rows.map(mapRow);
  }

  async update(id: string, patch: ContactUpdate): Promise<Contact | null> {
    const now = new Date().toISOString();
    const setClauses = Object.keys(patch).map(
      (field) => `${columnByField[field as keyof ContactUpdate]} = @${field}`,
    );

    const result = sqlite.prepare(`
      update contacts
      set ${setClauses.join(', ')}, updated_at = @now
      where id = @id and archived_at is null
    `).run(patchParams(id, now, patch));

    return result.changes ? this.getById(id, { includeArchived: true }) : null;
  }

  async updatePrimary(id: string, patch: ContactUpdate): Promise<Contact | null> {
    sqlite.transaction(() => {
      const current = sqlite.prepare(`
        select * from contacts
        where id = @id and archived_at is null
      `).get({ id }) as ContactRow | undefined;

      if (!current) {
        throw new Error('CONTACT_PRIMARY_NOT_ELIGIBLE');
      }

      const now = new Date().toISOString();
      sqlite.prepare(`
        update contacts
        set is_primary = 0, updated_at = @now
        where organisation_id = @organisationId
          and id <> @id
          and archived_at is null
          and is_primary = 1
      `).run({ organisationId: current.organisation_id, id, now });

      const result = sqlite.prepare(`
        update contacts
        set ${Object.keys({ ...patch, isPrimary: true })
          .map((field) => `${columnByField[field as keyof ContactUpdate]} = @${field}`)
          .join(', ')}, updated_at = @now
        where id = @id
          and organisation_id = @organisationId
          and archived_at is null
      `).run({
        ...patchParams(id, now, { ...patch, isPrimary: true }),
        organisationId: current.organisation_id,
      });

      if (result.changes !== 1) {
        throw new Error('CONTACT_PRIMARY_NOT_UPDATED');
      }
    })();

    return this.getById(id, { includeArchived: true });
  }

  async archive(id: string, archivedAt: string): Promise<Contact | null> {
    const existing = await this.getById(id, { includeArchived: true });
    if (!existing) {
      return null;
    }
    if (existing.archivedAt) {
      return existing;
    }

    sqlite.prepare(`
      update contacts
      set archived_at = @archivedAt,
        updated_at = @archivedAt,
        is_primary = 0
      where id = @id
    `).run({ id, archivedAt });

    return this.getById(id, { includeArchived: true });
  }
}
