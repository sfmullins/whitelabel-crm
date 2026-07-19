import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanupTempDatabase, createRepositories, setupTempDatabase } from './helpers';

describe('EngagementRepository', () => {
  beforeEach(setupTempDatabase);
  afterEach(cleanupTempDatabase);

  it('preserves omitted nullable fields and archives idempotently', async () => {
    const { organisations, contacts, engagements } = createRepositories();
    const organisation = await organisations.create({ name: 'Org', status: 'prospect' });
    const contact = await contacts.create({ organisationId: organisation.id, email: 'a@example.com', isPrimary: false, status: 'active' });
    const engagement = await engagements.create({
      organisationId: organisation.id,
      primaryContactId: contact.id,
      name: 'Discovery',
      type: 'diagnostic',
      summary: 'Summary',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      status: 'proposed',
    });

    const updated = await engagements.update(engagement.id, { name: 'Updated name' });
    expect(updated).toMatchObject({
      name: 'Updated name',
      primaryContactId: contact.id,
      summary: 'Summary',
      endDate: '2026-01-31',
    });

    const cleared = await engagements.update(engagement.id, {
      primaryContactId: null,
      summary: null,
      endDate: null,
    });
    expect(cleared).toMatchObject({ primaryContactId: null, summary: null, endDate: null });

    const archived = await engagements.archive(engagement.id, '2026-01-01T00:00:00.000Z');
    const archivedAgain = await engagements.archive(engagement.id, '2026-02-01T00:00:00.000Z');
    expect(archivedAgain?.archivedAt).toBe(archived?.archivedAt);
  });
});
