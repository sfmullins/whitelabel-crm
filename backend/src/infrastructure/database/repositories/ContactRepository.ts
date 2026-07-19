import { randomUUID } from 'crypto';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type {
  IContactRepository,
  ContactListOptions,
} from '../../../application/interfaces/IRepositories';
import { db, sqlite } from '../connection';
import { contacts } from '../schema';
import {
  ContactResponseSchema,
  type Contact,
  type ContactCreate,
  type ContactUpdate,
} from 'shared';
import {
  ContactRepositoryAffectedRowsError,
  ContactRepositoryArchivedError,
  ContactRepositoryInactivePrimaryError,
  ContactRepositoryNotFoundError,
  ContactRepositoryUniquePrimaryError,
} from '../../../application/errors';

type ContactRow = typeof contacts.$inferSelect;
type ContactInsert = typeof contacts.$inferInsert;
type ContactUpdateRow = Partial<typeof contacts.$inferInsert>;

type RawContactRow = {
  id: string;
  organisation_id: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: number;
  status: Contact['status'];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export interface ContactRepositoryOptions {
  failAfterPrimaryClearForContactId?: string;
}

function mapRow(row: ContactRow): Contact {
  return ContactResponseSchema.parse({
    id: row.id,
    organisationId: row.organisationId,
    firstName: row.firstName,
    lastName: row.lastName,
    jobTitle: row.jobTitle,
    email: row.email,
    phone: row.phone,
    isPrimary: row.isPrimary,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  });
}

function mapRawRow(row: RawContactRow): Contact {
  return ContactResponseSchema.parse({
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
  });
}

function insertRow(input: ContactCreate, id: string, now: string): ContactInsert {
  return {
    id,
    organisationId: input.organisationId,
    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
    jobTitle: input.jobTitle ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    isPrimary: input.isPrimary ?? false,
    status: input.status ?? 'active',
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

function updateRow(patch: ContactUpdate, updatedAt: string): ContactUpdateRow {
  const update: ContactUpdateRow = { updatedAt };
  if ('firstName' in patch) update.firstName = patch.firstName ?? null;
  if ('lastName' in patch) update.lastName = patch.lastName ?? null;
  if ('jobTitle' in patch) update.jobTitle = patch.jobTitle ?? null;
  if ('email' in patch) update.email = patch.email ?? null;
  if ('phone' in patch) update.phone = patch.phone ?? null;
  if ('isPrimary' in patch) update.isPrimary = patch.isPrimary;
  if ('status' in patch) update.status = patch.status;
  return update;
}

function rawPatchAssignments(patch: ContactUpdate): string[] {
  const assignments: string[] = [];
  if ('firstName' in patch) assignments.push('first_name = @firstName');
  if ('lastName' in patch) assignments.push('last_name = @lastName');
  if ('jobTitle' in patch) assignments.push('job_title = @jobTitle');
  if ('email' in patch) assignments.push('email = @email');
  if ('phone' in patch) assignments.push('phone = @phone');
  if ('isPrimary' in patch) assignments.push('is_primary = @isPrimary');
  if ('status' in patch) assignments.push('status = @status');
  return assignments;
}

function rawPatchParams(id: string, now: string, patch: ContactUpdate) {
  return {
    id,
    now,
    firstName: patch.firstName ?? null,
    lastName: patch.lastName ?? null,
    jobTitle: patch.jobTitle ?? null,
    email: patch.email ?? null,
    phone: patch.phone ?? null,
    isPrimary: patch.isPrimary === undefined ? undefined : patch.isPrimary ? 1 : 0,
    status: patch.status,
  };
}

function translateSqliteError(error: unknown): never {
  if (error instanceof Error && /contact_one_active_primary_per_org_idx|UNIQUE constraint failed/i.test(error.message)) {
    throw new ContactRepositoryUniquePrimaryError('Only one active primary contact is allowed');
  }
  throw error;
}

export class ContactRepository implements IContactRepository {
  constructor(private readonly options: ContactRepositoryOptions = {}) {}

  async create(input: ContactCreate): Promise<Contact> {
    const id = randomUUID();
    const now = new Date().toISOString();

    db.insert(contacts).values(insertRow(input, id, now)).run();
    const created = await this.getById(id, { includeArchived: true });
    if (!created) {
      throw new ContactRepositoryAffectedRowsError('Contact was not found after create');
    }
    return created;
  }

  async createPrimary(input: ContactCreate): Promise<Contact> {
    let id = '';

    try {
      sqlite.transaction(() => {
        const now = new Date().toISOString();
        id = randomUUID();
        const status = input.status ?? 'active';
        if (status !== 'active') {
          throw new ContactRepositoryInactivePrimaryError('Primary contact must be active');
        }

        sqlite.prepare(`
          update contacts
          set is_primary = 0, updated_at = @now
          where organisation_id = @organisationId
            and archived_at is null
            and is_primary = 1
        `).run({ organisationId: input.organisationId, now });

        if (this.options.failAfterPrimaryClearForContactId === id) {
          throw new ContactRepositoryAffectedRowsError('Injected primary-contact failure');
        }

        const result = sqlite.prepare(`
          insert into contacts (
            id, organisation_id, first_name, last_name, job_title, email, phone,
            is_primary, status, created_at, updated_at, archived_at
          ) values (
            @id, @organisationId, @firstName, @lastName, @jobTitle, @email, @phone,
            1, @status, @now, @now, null
          )
        `).run({
          id,
          organisationId: input.organisationId,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          jobTitle: input.jobTitle ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          status,
          now,
        });

        if (result.changes !== 1) {
          throw new ContactRepositoryAffectedRowsError('Primary contact was not created');
        }
      })();
    } catch (error) {
      translateSqliteError(error);
    }

    const created = await this.getById(id, { includeArchived: true });
    if (!created) {
      throw new ContactRepositoryAffectedRowsError('Contact was not found after primary create');
    }
    return created;
  }

  async getById(
    id: string,
    options?: { includeArchived?: boolean },
  ): Promise<Contact | null> {
    const predicates = [eq(contacts.id, id)];
    if (!options?.includeArchived) {
      predicates.push(isNull(contacts.archivedAt));
    }

    const row = db.select().from(contacts).where(and(...predicates)).get();
    return row ? mapRow(row) : null;
  }

  async list(options: ContactListOptions): Promise<Contact[]> {
    const predicates = [eq(contacts.organisationId, options.organisationId)];
    if (!options.includeArchived) {
      predicates.push(isNull(contacts.archivedAt));
    }
    if (options.status) {
      predicates.push(eq(contacts.status, options.status));
    }

    const rows = db.select()
      .from(contacts)
      .where(and(...predicates))
      .orderBy(
        desc(contacts.isPrimary),
        asc(contacts.lastName),
        asc(contacts.firstName),
        asc(contacts.id),
      )
      .limit(options.limit)
      .offset(options.offset)
      .all();

    return rows.map(mapRow);
  }

  async update(id: string, patch: ContactUpdate): Promise<Contact | null> {
    const result = db.update(contacts)
      .set(updateRow(patch, new Date().toISOString()))
      .where(and(eq(contacts.id, id), isNull(contacts.archivedAt)))
      .run();

    if (result.changes !== 1) {
      return null;
    }

    return this.getById(id, { includeArchived: true });
  }

  async updatePrimary(id: string, patch: ContactUpdate): Promise<Contact | null> {
    try {
      sqlite.transaction(() => {
        const current = sqlite.prepare(`
          select * from contacts
          where id = @id
        `).get({ id }) as RawContactRow | undefined;

        if (!current) {
          throw new ContactRepositoryNotFoundError('Contact not found');
        }
        if (current.archived_at) {
          throw new ContactRepositoryArchivedError('Archived contact cannot be primary');
        }

        const resultingStatus = patch.status ?? current.status;
        if (resultingStatus !== 'active') {
          throw new ContactRepositoryInactivePrimaryError('Primary contact must be active');
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

        if (this.options.failAfterPrimaryClearForContactId === id) {
          throw new ContactRepositoryAffectedRowsError('Injected primary-contact failure');
        }

        const candidatePatch = { ...patch, isPrimary: true } satisfies ContactUpdate;
        const result = sqlite.prepare(`
          update contacts
          set ${rawPatchAssignments(candidatePatch).join(', ')}, updated_at = @now
          where id = @id
            and organisation_id = @organisationId
            and archived_at is null
        `).run({
          ...rawPatchParams(id, now, candidatePatch),
          organisationId: current.organisation_id,
        });

        if (result.changes !== 1) {
          throw new ContactRepositoryAffectedRowsError('Primary contact was not updated');
        }
      })();
    } catch (error) {
      translateSqliteError(error);
    }

    return this.getById(id, { includeArchived: true });
  }

  async archive(id: string, archivedAt: string): Promise<Contact | null> {
    db.update(contacts)
      .set({ archivedAt, updatedAt: archivedAt, isPrimary: false })
      .where(and(eq(contacts.id, id), isNull(contacts.archivedAt)))
      .run();

    return this.getById(id, { includeArchived: true });
  }
}
