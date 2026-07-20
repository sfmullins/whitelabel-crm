import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanupTempDatabase, createRepositories, createServices, setupTempDatabase } from './helpers';

describe('CRM services', () => {
  beforeEach(setupTempDatabase);
  afterEach(cleanupTempDatabase);

  it('rejects contradictory primary-contact intent but supports valid status transitions', async () => {
    const { organisationService, contactService } = createServices();
    const organisation = await organisationService.create({ name: 'Org', status: 'prospect' });
    const contact = await contactService.create({
      organisationId: organisation.id,
      email: 'a@example.com',
      isPrimary: true,
      status: 'active',
    });

    await expect(contactService.update(contact.id, { status: 'inactive', isPrimary: true }))
      .rejects.toThrow(/inactive contact cannot be primary/i);

    const inactive = await contactService.update(contact.id, { status: 'inactive' });
    expect(inactive).toMatchObject({ status: 'inactive', isPrimary: false });

    const activePrimary = await contactService.update(contact.id, {
      status: 'active',
      isPrimary: true,
    });
    expect(activePrimary).toMatchObject({ status: 'active', isPrimary: true });

    const notPrimary = await contactService.update(contact.id, { isPrimary: false });
    expect(notPrimary).toMatchObject({ status: 'active', isPrimary: false });
  });

  it('enforces engagement contact eligibility and merged date ordering', async () => {
    const { organisationService, contactService, engagementService } = createServices();
    const firstOrg = await organisationService.create({ name: 'First', status: 'prospect' });
    const secondOrg = await organisationService.create({ name: 'Second', status: 'prospect' });
    const contact = await contactService.create({ organisationId: firstOrg.id, email: 'a@example.com', isPrimary: false, status: 'active' });
    const otherContact = await contactService.create({ organisationId: secondOrg.id, email: 'b@example.com', isPrimary: false, status: 'active' });
    const engagement = await engagementService.create({
      organisationId: firstOrg.id,
      primaryContactId: contact.id,
      status: 'proposed',
      name: 'Discovery',
      type: 'diagnostic',
      startDate: '2026-01-01',
    });

    await expect(engagementService.update(engagement.id, { primaryContactId: otherContact.id }))
      .rejects.toThrow(/belong/);
    await expect(engagementService.update(engagement.id, {
      startDate: '2026-02-01',
      endDate: '2026-01-31',
    })).rejects.toThrow(/End date/);
  });
});
