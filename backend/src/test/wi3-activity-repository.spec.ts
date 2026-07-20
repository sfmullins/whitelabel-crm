import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActivityRepository } from '../infrastructure/database/repositories/ActivityRepository';
import { ContactRepository } from '../infrastructure/database/repositories/ContactRepository';
import { EngagementRepository } from '../infrastructure/database/repositories/EngagementRepository';
import { OrganisationRepository } from '../infrastructure/database/repositories/OrganisationRepository';
import { cleanupTempDatabase, setupTempDatabase, sqlite } from './crm/helpers';

const firstOccurredAt = '2026-07-18T09:00:00.000Z';
const secondOccurredAt = '2026-07-19T09:00:00.000Z';
const thirdOccurredAt = '2026-07-20T09:00:00.000Z';

function harness() {
  return {
    activities: new ActivityRepository(sqlite),
    organisations: new OrganisationRepository(),
    contacts: new ContactRepository(),
    engagements: new EngagementRepository(),
  };
}

describe('WI3 activity repository', () => {
  beforeEach(setupTempDatabase);
  afterEach(cleanupTempDatabase);

  it('creates, gets and updates nullable activity fields', async () => {
    const { activities, organisations, contacts, engagements } = harness();
    const organisation = await organisations.create({ name: 'Repository', status: 'prospect' });
    const contact = await contacts.create({
      organisationId: organisation.id,
      firstName: 'Contact',
      isPrimary: false,
      status: 'active',
    });
    const engagement = await engagements.create({
      organisationId: organisation.id,
      name: 'Engagement',
      type: 'diagnostic',
      status: 'proposed',
      startDate: '2026-07-20',
    });

    const created = await activities.create({
      organisationId: organisation.id,
      contactId: null,
      engagementId: null,
      type: 'note',
      body: '  Repository body  ',
      author: '  Repository user  ',
      occurredAt: thirdOccurredAt,
      followUpDate: null,
      source: 'user',
      sourceReference: null,
    });
    expect(created).toMatchObject({
      contactId: null,
      engagementId: null,
      body: 'Repository body',
      author: 'Repository user',
    });
    await expect(activities.getById(created.id)).resolves.toEqual(created);

    const updated = await activities.update(created.id, {
      contactId: contact.id,
      engagementId: engagement.id,
      type: 'meeting',
      followUpDate: '2026-07-25',
    });
    expect(updated).toMatchObject({
      contactId: contact.id,
      engagementId: engagement.id,
      type: 'meeting',
      followUpDate: '2026-07-25',
    });

    await expect(activities.update(created.id, {
      contactId: null,
      engagementId: null,
      followUpDate: null,
    })).resolves.toMatchObject({
      contactId: null,
      engagementId: null,
      followUpDate: null,
    });
  });

  it('combines filters, pagination and archived visibility deterministically', async () => {
    const { activities, organisations, contacts, engagements } = harness();
    const organisation = await organisations.create({ name: 'Filters', status: 'prospect' });
    const contact = await contacts.create({
      organisationId: organisation.id,
      firstName: 'Filter contact',
      isPrimary: false,
      status: 'active',
    });
    const otherContact = await contacts.create({
      organisationId: organisation.id,
      firstName: 'Other contact',
      isPrimary: false,
      status: 'active',
    });
    const engagement = await engagements.create({
      organisationId: organisation.id,
      name: 'Filter engagement',
      type: 'implementation',
      status: 'active',
      startDate: '2026-07-18',
    });

    const first = await activities.create({
      organisationId: organisation.id,
      contactId: contact.id,
      engagementId: engagement.id,
      type: 'call',
      body: 'First',
      author: 'Tester',
      occurredAt: firstOccurredAt,
      followUpDate: '2026-07-21',
      source: 'user',
    });
    const second = await activities.create({
      organisationId: organisation.id,
      contactId: contact.id,
      engagementId: engagement.id,
      type: 'call',
      body: 'Second',
      author: 'Tester',
      occurredAt: secondOccurredAt,
      followUpDate: '2026-07-22',
      source: 'user',
    });
    await activities.create({
      organisationId: organisation.id,
      contactId: otherContact.id,
      engagementId: null,
      type: 'note',
      body: 'Other',
      author: 'Tester',
      occurredAt: thirdOccurredAt,
      followUpDate: null,
      source: 'user',
    });
    await activities.archive(second.id, '2026-07-20T12:00:00.000Z');

    const filtered = await activities.list({
      organisationId: organisation.id,
      contactId: contact.id,
      engagementId: engagement.id,
      type: 'call',
      occurredFrom: firstOccurredAt,
      occurredTo: thirdOccurredAt,
      followUpFrom: '2026-07-20',
      followUpTo: '2026-07-23',
      includeArchived: true,
      limit: 1,
      offset: 0,
    });
    expect(filtered.map((activity) => activity.id)).toEqual([second.id]);

    const secondPage = await activities.list({
      organisationId: organisation.id,
      contactId: contact.id,
      engagementId: engagement.id,
      type: 'call',
      occurredFrom: firstOccurredAt,
      occurredTo: thirdOccurredAt,
      followUpFrom: '2026-07-20',
      followUpTo: '2026-07-23',
      includeArchived: true,
      limit: 1,
      offset: 1,
    });
    expect(secondPage.map((activity) => activity.id)).toEqual([first.id]);

    const normal = await activities.list({
      organisationId: organisation.id,
      limit: 50,
      offset: 0,
    });
    expect(normal.some((activity) => activity.id === second.id)).toBe(false);
    await expect(activities.getById(second.id)).resolves.toBeNull();
    await expect(activities.getById(second.id, { includeArchived: true }))
      .resolves.toMatchObject({ id: second.id, archivedAt: '2026-07-20T12:00:00.000Z' });
  });

  it('enforces source-reference uniqueness and restrictive foreign keys', async () => {
    const { activities, organisations, contacts } = harness();
    const organisation = await organisations.create({ name: 'Constraints', status: 'prospect' });
    const contact = await contacts.create({
      organisationId: organisation.id,
      firstName: 'Constraint contact',
      isPrimary: false,
      status: 'active',
    });

    await activities.create({
      organisationId: organisation.id,
      contactId: contact.id,
      type: 'note',
      body: 'Imported',
      author: 'Legacy import',
      occurredAt: thirdOccurredAt,
      source: 'legacy_import',
      sourceReference: 'legacy-customer-note:test:0:digest',
    });
    await expect(activities.create({
      organisationId: organisation.id,
      contactId: contact.id,
      type: 'note',
      body: 'Duplicate',
      author: 'Legacy import',
      occurredAt: thirdOccurredAt,
      source: 'legacy_import',
      sourceReference: 'legacy-customer-note:test:0:digest',
    })).rejects.toThrow();

    expect(() => sqlite.prepare('delete from contacts where id = ?').run(contact.id)).toThrow();
    expect(() => sqlite.prepare('delete from organisations where id = ?').run(organisation.id)).toThrow();
    expect(sqlite.pragma('foreign_key_check')).toEqual([]);
  });
});
