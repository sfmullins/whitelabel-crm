import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanupTempDatabase, createRepositories, setupTempDatabase } from './helpers';

describe('CRM primary-contact transaction rollback', () => {
  beforeEach(setupTempDatabase);
  afterEach(cleanupTempDatabase);

  it('preserves the previous primary when promotion fails after clearing primaries', async () => {
    const { organisations, contacts } = createRepositories();
    const organisation = await organisations.create({ name: 'Org', status: 'prospect' });
    const primary = await contacts.createPrimary({
      organisationId: organisation.id,
      firstName: 'A',
      isPrimary: true,
      status: 'active',
    });
    const candidate = await contacts.create({
      organisationId: organisation.id,
      firstName: 'B',
      isPrimary: false,
      status: 'active',
    });

    const failingContacts = createRepositories({
      failAfterPrimaryClearForContactId: candidate.id,
    }).contacts;

    await expect(failingContacts.updatePrimary(candidate.id, { isPrimary: true }))
      .rejects.toThrow(/Injected primary-contact failure/);

    expect(await contacts.getById(primary.id, { includeArchived: true }))
      .toMatchObject({ isPrimary: true });
    expect(await contacts.getById(candidate.id, { includeArchived: true }))
      .toMatchObject({ isPrimary: false });
  });
});
