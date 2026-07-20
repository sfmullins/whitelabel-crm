import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanupTempDatabase, createRepositories, setupTempDatabase, sqlite } from './helpers';

describe('ContactRepository', () => {
  beforeEach(setupTempDatabase);
  afterEach(cleanupTempDatabase);

  it('allows duplicate email, preserves omitted nullable fields and clears primary atomically on archive', async () => {
    const { organisations, contacts } = createRepositories();
    const organisation = await organisations.create({ name: 'Org', status: 'prospect' });
    const first = await contacts.createPrimary({
      organisationId: organisation.id,
      firstName: 'A',
      email: 'same@example.com',
      phone: '555',
      jobTitle: 'Lead',
      isPrimary: true,
      status: 'active',
    });
    const second = await contacts.create({
      organisationId: organisation.id,
      lastName: 'B',
      isPrimary: false,
      jobTitle: 'Consultant',
      phone: '123',
      email: 'same@example.com',
      status: 'active',
    });

    const emailIndexSql = sqlite.prepare("select sql from sqlite_master where type = 'index' and name = 'contact_email_idx'").get().sql;
    expect(emailIndexSql).not.toMatch(/unique/i);

    const updated = await contacts.update(second.id, { lastName: 'Bee' });
    expect(updated).toMatchObject({
      lastName: 'Bee',
      jobTitle: 'Consultant',
      phone: '123',
      email: 'same@example.com',
    });

    const renamedFirst = await contacts.update(first.id, { firstName: 'Able' });
    expect(renamedFirst).toMatchObject({
      firstName: 'Able',
      email: 'same@example.com',
      phone: '555',
      jobTitle: 'Lead',
    });

    const clearedFirst = await contacts.update(first.id, {
      lastName: null,
      jobTitle: null,
      email: null,
      phone: null,
    });
    expect(clearedFirst).toMatchObject({
      firstName: 'Able',
      lastName: null,
      jobTitle: null,
      email: null,
      phone: null,
    });

    const archived = await contacts.archive(first.id, '2026-01-01T00:00:00.000Z');
    const archivedAgain = await contacts.archive(first.id, '2026-02-01T00:00:00.000Z');
    expect(archived).toMatchObject({ isPrimary: false, archivedAt: '2026-01-01T00:00:00.000Z' });
    expect(archivedAgain?.archivedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(await contacts.update(first.id, { firstName: 'Should not update' })).toBeNull();
  });
});
