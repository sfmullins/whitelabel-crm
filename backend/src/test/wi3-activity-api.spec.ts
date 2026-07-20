import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContactRepository } from '../infrastructure/database/repositories/ContactRepository';
import { EngagementRepository } from '../infrastructure/database/repositories/EngagementRepository';
import { OrganisationRepository } from '../infrastructure/database/repositories/OrganisationRepository';
import { cleanupTempDatabase, requestJson, setupTempDatabase, sqlite } from './crm/helpers';

const now = '2026-07-20T10:00:00.000Z';

function insertCustomer(id: string, email: string, company: string | null) {
  sqlite.prepare(`
    insert into customers (
      id, first_name, last_name, company, email, tags, created_at, updated_at
    ) values (?, 'API', 'Customer', ?, ?, '[]', ?, ?)
  `).run(id, company, email, now, now);
}

describe('WI3 activity APIs', () => {
  beforeEach(setupTempDatabase);
  afterEach(cleanupTempDatabase);

  it('enforces canonical route validation, ownership and archive visibility', async () => {
    const organisations = new OrganisationRepository();
    const contacts = new ContactRepository();
    const engagements = new EngagementRepository();
    const first = await organisations.create({ name: 'First API org', status: 'prospect' });
    const second = await organisations.create({ name: 'Second API org', status: 'prospect' });
    const firstContact = await contacts.create({
      organisationId: first.id,
      firstName: 'First contact',
      isPrimary: false,
      status: 'active',
    });
    const secondContact = await contacts.create({
      organisationId: second.id,
      firstName: 'Second contact',
      isPrimary: false,
      status: 'active',
    });
    const secondEngagement = await engagements.create({
      organisationId: second.id,
      name: 'Second engagement',
      type: 'diagnostic',
      status: 'active',
      startDate: '2026-07-20',
    });

    const { startServer } = await import('../server');
    const server = await startServer({ host: '127.0.0.1', port: 0 });
    try {
      const created = await requestJson(server.url, `/api/organisations/${first.id}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          contactId: firstContact.id,
          type: 'call',
          body: '  Canonical call  ',
          occurredAt: '2026-07-20T11:30:00+01:00',
          followUpDate: '2026-07-25',
        }),
      });
      expect(created.response.status).toBe(201);
      expect(created.body).toMatchObject({
        organisationId: first.id,
        contactId: firstContact.id,
        type: 'call',
        body: 'Canonical call',
        occurredAt: '2026-07-20T10:30:00.000Z',
        source: 'user',
      });

      const fetched = await requestJson(server.url, `/api/activities/${created.body.id}`);
      expect(fetched.response.status).toBe(200);
      expect(fetched.body.id).toBe(created.body.id);

      const listed = await requestJson(
        server.url,
        `/api/organisations/${first.id}/activities?contactId=${firstContact.id}&type=call&limit=1&offset=0`,
      );
      expect(listed.response.status).toBe(200);
      expect(listed.body.map((row: { id: string }) => row.id)).toEqual([created.body.id]);

      const otherContact = await requestJson(server.url, `/api/organisations/${first.id}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          contactId: secondContact.id,
          type: 'note',
          body: 'Cross organisation contact',
        }),
      });
      expect(otherContact.response.status).toBe(409);
      expect(otherContact.body.error).toBe('CONFLICT');

      const otherEngagement = await requestJson(server.url, `/api/organisations/${first.id}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          engagementId: secondEngagement.id,
          type: 'meeting',
          body: 'Cross organisation engagement',
        }),
      });
      expect(otherEngagement.response.status).toBe(409);

      const unknownBodyField = await requestJson(server.url, `/api/organisations/${first.id}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'note',
          body: 'Unknown field',
          source: 'system',
        }),
      });
      expect(unknownBodyField.response.status).toBe(400);

      const unknownQuery = await requestJson(
        server.url,
        `/api/organisations/${first.id}/activities?unknown=true`,
      );
      expect(unknownQuery.response.status).toBe(400);

      const invertedRange = await requestJson(
        server.url,
        `/api/organisations/${first.id}/activities?occurredFrom=2026-07-21T00%3A00%3A00Z&occurredTo=2026-07-20T00%3A00%3A00Z`,
      );
      expect(invertedRange.response.status).toBe(400);

      const immutablePatch = await requestJson(server.url, `/api/activities/${created.body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ organisationId: second.id }),
      });
      expect(immutablePatch.response.status).toBe(400);

      const firstArchive = await requestJson(server.url, `/api/activities/${created.body.id}/archive`, {
        method: 'POST',
      });
      const secondArchive = await requestJson(server.url, `/api/activities/${created.body.id}/archive`, {
        method: 'POST',
      });
      expect(firstArchive.response.status).toBe(200);
      expect(secondArchive.body.archivedAt).toBe(firstArchive.body.archivedAt);

      const normalList = await requestJson(server.url, `/api/organisations/${first.id}/activities`);
      expect(normalList.body).toEqual([]);
      const archivedList = await requestJson(
        server.url,
        `/api/organisations/${first.id}/activities?includeArchived=true`,
      );
      expect(archivedList.body.map((row: { id: string }) => row.id)).toContain(created.body.id);

      const archivedPatch = await requestJson(server.url, `/api/activities/${created.body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: 'Not allowed' }),
      });
      expect(archivedPatch.response.status).toBe(409);

      const hardDelete = await fetch(`${server.url}/api/activities/${created.body.id}`, {
        method: 'DELETE',
      });
      expect(hardDelete.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it('isolates compatibility activity lists by mapped contact', async () => {
    const firstCustomerId = '00000000-0000-4000-8000-000000000701';
    const secondCustomerId = '00000000-0000-4000-8000-000000000702';
    insertCustomer(firstCustomerId, 'first-api@example.com', 'Shared API Ltd');
    insertCustomer(secondCustomerId, 'second-api@example.com', 'shared   api ltd');

    const { startServer } = await import('../server');
    const server = await startServer({ host: '127.0.0.1', port: 0 });
    try {
      const first = await requestJson(server.url, `/api/customers/${firstCustomerId}/activities`, {
        method: 'POST',
        body: JSON.stringify({ type: 'note', body: 'First customer only' }),
      });
      const second = await requestJson(server.url, `/api/customers/${secondCustomerId}/activities`, {
        method: 'POST',
        body: JSON.stringify({ type: 'email', body: 'Second customer only' }),
      });
      expect(first.response.status).toBe(201);
      expect(second.response.status).toBe(201);
      expect(first.body.organisationId).toBe(second.body.organisationId);
      expect(first.body.contactId).not.toBe(second.body.contactId);

      const firstList = await requestJson(server.url, `/api/customers/${firstCustomerId}/activities`);
      const secondList = await requestJson(server.url, `/api/customers/${secondCustomerId}/activities`);
      expect(firstList.body.map((row: { id: string }) => row.id)).toEqual([first.body.id]);
      expect(secondList.body.map((row: { id: string }) => row.id)).toEqual([second.body.id]);

      const otherOrganisation = await new OrganisationRepository().create({
        name: 'Other compatibility org',
        status: 'prospect',
      });
      const otherEngagement = await new EngagementRepository().create({
        organisationId: otherOrganisation.id,
        name: 'Other compatibility engagement',
        type: 'diagnostic',
        status: 'active',
        startDate: '2026-07-20',
      });
      const crossEngagement = await requestJson(
        server.url,
        `/api/customers/${firstCustomerId}/activities`,
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'meeting',
            body: 'Wrong engagement',
            engagementId: otherEngagement.id,
          }),
        },
      );
      expect(crossEngagement.response.status).toBe(409);

      const missing = await requestJson(
        server.url,
        '/api/customers/00000000-0000-4000-8000-000000000799/activities',
      );
      expect(missing.response.status).toBe(404);
    } finally {
      await server.close();
    }
  });
});
