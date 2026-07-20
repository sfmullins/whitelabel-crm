import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActivityService } from '../application/services/ActivityService';
import { ContactRepository } from '../infrastructure/database/repositories/ContactRepository';
import { EngagementRepository } from '../infrastructure/database/repositories/EngagementRepository';
import { OrganisationRepository } from '../infrastructure/database/repositories/OrganisationRepository';
import { ActivityRepository } from '../infrastructure/database/repositories/ActivityRepository';
import { cleanupTempDatabase, setupTempDatabase, sqlite } from './crm/helpers';

function createHarness() {
  const organisations = new OrganisationRepository();
  const contacts = new ContactRepository();
  const engagements = new EngagementRepository();
  const activities = new ActivityRepository(sqlite);
  return {
    organisations,
    contacts,
    engagements,
    activities,
    service: new ActivityService(organisations, contacts, engagements, activities),
  };
}

describe('WI3 activity service invariants', () => {
  beforeEach(setupTempDatabase);
  afterEach(cleanupTempDatabase);

  it('rejects missing and archived organisations on create', async () => {
    const { organisations, service } = createHarness();
    await expect(service.create({
      organisationId: '00000000-0000-4000-8000-000000000901',
      type: 'note',
      body: 'Missing organisation',
    })).rejects.toThrow(/Organisation not found/);

    const organisation = await organisations.create({ name: 'Archived', status: 'prospect' });
    await organisations.archive(organisation.id, new Date().toISOString());
    await expect(service.create({
      organisationId: organisation.id,
      type: 'note',
      body: 'Archived organisation',
    })).rejects.toThrow(/Archived organisations/);
  });

  it('enforces contact ownership and archive state while accepting inactive contacts', async () => {
    const { organisations, contacts, service } = createHarness();
    const first = await organisations.create({ name: 'First', status: 'prospect' });
    const second = await organisations.create({ name: 'Second', status: 'prospect' });
    const otherContact = await contacts.create({
      organisationId: second.id,
      firstName: 'Other',
      isPrimary: false,
      status: 'active',
    });
    await expect(service.create({
      organisationId: first.id,
      contactId: otherContact.id,
      type: 'note',
      body: 'Wrong organisation',
    })).rejects.toThrow(/Contact must belong/);

    const archivedContact = await contacts.create({
      organisationId: first.id,
      firstName: 'Archived',
      isPrimary: false,
      status: 'active',
    });
    await contacts.archive(archivedContact.id, new Date().toISOString());
    await expect(service.create({
      organisationId: first.id,
      contactId: archivedContact.id,
      type: 'note',
      body: 'Archived contact',
    })).rejects.toThrow(/Archived contacts/);

    const inactive = await contacts.create({
      organisationId: first.id,
      firstName: 'Inactive',
      isPrimary: false,
      status: 'inactive',
    });
    await expect(service.create({
      organisationId: first.id,
      contactId: inactive.id,
      type: 'call',
      body: 'Historical call',
    })).resolves.toMatchObject({ contactId: inactive.id, type: 'call' });
  });

  it('enforces engagement ownership and archive state and accepts valid paired links', async () => {
    const { organisations, contacts, engagements, service } = createHarness();
    const first = await organisations.create({ name: 'First', status: 'prospect' });
    const second = await organisations.create({ name: 'Second', status: 'prospect' });
    const contact = await contacts.create({
      organisationId: first.id,
      firstName: 'First contact',
      isPrimary: false,
      status: 'active',
    });
    const otherEngagement = await engagements.create({
      organisationId: second.id,
      name: 'Other engagement',
      type: 'diagnostic',
      status: 'proposed',
      startDate: '2026-07-20',
    });
    await expect(service.create({
      organisationId: first.id,
      engagementId: otherEngagement.id,
      type: 'meeting',
      body: 'Wrong engagement',
    })).rejects.toThrow(/Engagement must belong/);

    const archivedEngagement = await engagements.create({
      organisationId: first.id,
      name: 'Archived engagement',
      type: 'diagnostic',
      status: 'completed',
      startDate: '2026-07-20',
    });
    await engagements.archive(archivedEngagement.id, new Date().toISOString());
    await expect(service.create({
      organisationId: first.id,
      engagementId: archivedEngagement.id,
      type: 'meeting',
      body: 'Archived engagement',
    })).rejects.toThrow(/Archived engagements/);

    const validEngagement = await engagements.create({
      organisationId: first.id,
      name: 'Valid engagement',
      type: 'implementation',
      status: 'active',
      startDate: '2026-07-20',
    });
    await expect(service.create({
      organisationId: first.id,
      contactId: contact.id,
      engagementId: validEngagement.id,
      type: 'meeting',
      body: 'Valid paired relationship',
    })).resolves.toMatchObject({
      contactId: contact.id,
      engagementId: validEngagement.id,
    });
  });

  it('preserves historical archived parent links but rejects newly assigned archived parents', async () => {
    const { organisations, contacts, service } = createHarness();
    const organisation = await organisations.create({ name: 'History', status: 'prospect' });
    const original = await contacts.create({
      organisationId: organisation.id,
      firstName: 'Original',
      isPrimary: false,
      status: 'active',
    });
    const newlyArchived = await contacts.create({
      organisationId: organisation.id,
      firstName: 'New archived',
      isPrimary: false,
      status: 'active',
    });
    const activity = await service.create({
      organisationId: organisation.id,
      contactId: original.id,
      type: 'note',
      body: 'Historical link',
    });

    await contacts.archive(original.id, new Date().toISOString());
    await contacts.archive(newlyArchived.id, new Date().toISOString());

    await expect(service.update(activity.id, { body: 'Edited historical body' }))
      .resolves.toMatchObject({ contactId: original.id, body: 'Edited historical body' });
    await expect(service.update(activity.id, { contactId: newlyArchived.id }))
      .rejects.toThrow(/Archived contacts/);
  });

  it('rejects edits after activity archive and keeps archive idempotent', async () => {
    const { organisations, service } = createHarness();
    const organisation = await organisations.create({ name: 'Archive', status: 'prospect' });
    const activity = await service.create({
      organisationId: organisation.id,
      type: 'other',
      body: 'Archive me',
    });

    const first = await service.archive(activity.id);
    const second = await service.archive(activity.id);
    expect(second.archivedAt).toBe(first.archivedAt);
    await expect(service.update(activity.id, { body: 'Forbidden edit' }))
      .rejects.toThrow(/Archived activities/);
  });
});
