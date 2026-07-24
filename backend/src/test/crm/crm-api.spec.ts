import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanupTempDatabase, requestJson, setupTempDatabase } from './helpers';

describe('CRM API', () => {
  beforeEach(setupTempDatabase);
  afterEach(cleanupTempDatabase);

  async function start() {
    const { startServer } = await import('../../server');
    return startServer({ host: '127.0.0.1', port: 0 });
  }

  it('covers organisation query validation, missing records and archive idempotence', async () => {
    const server = await start();
    try {
      const missing = await requestJson(server.url, '/api/organisations/00000000-0000-4000-8000-000000000001');
      expect(missing.response.status).toBe(404);

      for (const query of [
        'status=bogus',
        'limit=1.5',
        'limit=-1',
        'limit=0',
        'limit=201',
        'limit=',
        'offset=-1',
      ]) {
        const result = await requestJson(server.url, `/api/organisations?${query}`);
        expect(result.response.status).toBe(400);
      }

      const created = await requestJson(server.url, '/api/organisations', {
        method: 'POST',
        body: JSON.stringify({ name: 'Org' }),
      });
      const fetched = await requestJson(server.url, `/api/organisations/${created.body.id}`);
      expect(fetched.response.status).toBe(200);
      expect(fetched.response.headers.get('content-type')).toContain('application/json');
      expect(fetched.body).toMatchObject({ id: created.body.id, name: 'Org' });

      const patched = await requestJson(server.url, `/api/organisations/${created.body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Renamed Org' }),
      });
      expect(patched.response.status).toBe(200);
      expect(patched.response.headers.get('content-type')).toContain('application/json');
      expect(patched.body).toMatchObject({ id: created.body.id, name: 'Renamed Org' });

      const firstArchive = await requestJson(server.url, `/api/organisations/${created.body.id}/archive`, {
        method: 'POST',
      });
      const secondArchive = await requestJson(server.url, `/api/organisations/${created.body.id}/archive`, {
        method: 'POST',
      });
      expect(secondArchive.body.archivedAt).toBe(firstArchive.body.archivedAt);
    } finally {
      await server.close();
    }
  });

  it('covers contact primary updates, duplicate email and archive behaviour', async () => {
    const server = await start();
    try {
      const org = await requestJson(server.url, '/api/organisations', {
        method: 'POST',
        body: JSON.stringify({ name: 'Org' }),
      });
      const orgId = org.body.id;
      const first = await requestJson(server.url, `/api/organisations/${orgId}/contacts`, {
        method: 'POST',
        body: JSON.stringify({ email: 'dup@example.com', isPrimary: true }),
      });
      const second = await requestJson(server.url, `/api/organisations/${orgId}/contacts`, {
        method: 'POST',
        body: JSON.stringify({ email: 'dup@example.com' }),
      });
      expect(second.response.status).toBe(201);

      const contradictory = await requestJson(server.url, `/api/contacts/${first.body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive', isPrimary: true }),
      });
      expect(contradictory.response.status).toBe(409);

      const inactive = await requestJson(server.url, `/api/contacts/${first.body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      });
      expect(inactive.body).toMatchObject({ status: 'inactive', isPrimary: false });

      const activePrimary = await requestJson(server.url, `/api/contacts/${first.body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active', isPrimary: true }),
      });
      expect(activePrimary.body).toMatchObject({ status: 'active', isPrimary: true });

      const secondPrimary = await requestJson(server.url, `/api/contacts/${second.body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPrimary: true }),
      });
      expect(secondPrimary.response.status).toBe(200);
      expect((await requestJson(server.url, `/api/contacts/${first.body.id}`)).body.isPrimary).toBe(false);

      const clearSecond = await requestJson(server.url, `/api/contacts/${second.body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPrimary: false }),
      });
      expect(clearSecond.body.isPrimary).toBe(false);
      expect((await requestJson(server.url, `/api/contacts/${first.body.id}`)).body.isPrimary).toBe(false);

      const otherOrg = await requestJson(server.url, '/api/organisations', {
        method: 'POST',
        body: JSON.stringify({ name: 'Other Org' }),
      });
      await requestJson(server.url, `/api/organisations/${otherOrg.body.id}/contacts`, {
        method: 'POST',
        body: JSON.stringify({ email: 'other@example.com' }),
      });
      const scopedContacts = await requestJson(server.url, `/api/organisations/${orgId}/contacts`);
      expect(scopedContacts.response.status).toBe(200);
      expect(scopedContacts.response.headers.get('content-type')).toContain('application/json');
      expect(scopedContacts.body).toHaveLength(2);
      expect(scopedContacts.body.every((contact: { organisationId: string }) => contact.organisationId === orgId)).toBe(true);

      const missing = await requestJson(server.url, '/api/contacts/00000000-0000-4000-8000-000000000001');
      expect(missing.response.status).toBe(404);

      const archived = await requestJson(server.url, `/api/contacts/${second.body.id}/archive`, { method: 'POST' });
      const archivedAgain = await requestJson(server.url, `/api/contacts/${second.body.id}/archive`, { method: 'POST' });
      expect(archivedAgain.body.archivedAt).toBe(archived.body.archivedAt);
      const archivedUpdate = await requestJson(server.url, `/api/contacts/${second.body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ firstName: 'Nope' }),
      });
      expect(archivedUpdate.response.status).toBe(409);
    } finally {
      await server.close();
    }
  });

  it('covers engagement validation, nullable preservation and archive behaviour', async () => {
    const server = await start();
    try {
      const org = await requestJson(server.url, '/api/organisations', {
        method: 'POST',
        body: JSON.stringify({ name: 'Org' }),
      });
      const orgId = org.body.id;
      const contact = await requestJson(server.url, `/api/organisations/${orgId}/contacts`, {
        method: 'POST',
        body: JSON.stringify({ email: 'primary@example.com' }),
      });
      const inactive = await requestJson(server.url, `/api/organisations/${orgId}/contacts`, {
        method: 'POST',
        body: JSON.stringify({ email: 'inactive@example.com', status: 'inactive' }),
      });
      const archived = await requestJson(server.url, `/api/organisations/${orgId}/contacts`, {
        method: 'POST',
        body: JSON.stringify({ email: 'archived@example.com' }),
      });
      await requestJson(server.url, `/api/contacts/${archived.body.id}/archive`, { method: 'POST' });

      for (const body of [
        { name: 'Bad', type: 'diagnostic', startDate: '2026/01/01' },
        { name: 'Bad', type: 'diagnostic', startDate: '2026-02-31' },
        { name: 'Bad', type: 'diagnostic', startDate: '2026-02-02', endDate: '2026-02-01' },
      ]) {
        const result = await requestJson(server.url, `/api/organisations/${orgId}/engagements`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        expect(result.response.status).toBe(400);
      }

      const equalDates = await requestJson(server.url, `/api/organisations/${orgId}/engagements`, {
        method: 'POST',
        body: JSON.stringify({
          name: 'Equal dates',
          type: 'diagnostic',
          startDate: '2026-02-02',
          endDate: '2026-02-02',
          summary: 'Keep me',
          primaryContactId: contact.body.id,
        }),
      });
      expect(equalDates.response.status).toBe(201);

      const missingPrimary = await requestJson(server.url, `/api/organisations/${orgId}/engagements`, {
        method: 'POST',
        body: JSON.stringify({
          name: 'Missing primary',
          type: 'diagnostic',
          startDate: '2026-02-02',
          primaryContactId: '00000000-0000-4000-8000-000000000001',
        }),
      });
      expect(missingPrimary.response.status).toBe(404);

      for (const primaryContactId of [inactive.body.id, archived.body.id]) {
        const result = await requestJson(server.url, `/api/engagements/${equalDates.body.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ primaryContactId }),
        });
        expect(result.response.status).toBe(409);
      }

      const nameOnly = await requestJson(server.url, `/api/engagements/${equalDates.body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated name' }),
      });
      expect(nameOnly.body).toMatchObject({
        name: 'Updated name',
        primaryContactId: contact.body.id,
        summary: 'Keep me',
        endDate: '2026-02-02',
      });

      const otherOrg = await requestJson(server.url, '/api/organisations', {
        method: 'POST',
        body: JSON.stringify({ name: 'Other Org' }),
      });
      await requestJson(server.url, `/api/organisations/${otherOrg.body.id}/engagements`, {
        method: 'POST',
        body: JSON.stringify({
          name: 'Other engagement',
          type: 'diagnostic',
          startDate: '2026-03-01',
        }),
      });
      const scopedEngagements = await requestJson(server.url, `/api/organisations/${orgId}/engagements`);
      expect(scopedEngagements.response.status).toBe(200);
      expect(scopedEngagements.response.headers.get('content-type')).toContain('application/json');
      expect(scopedEngagements.body).toHaveLength(1);
      expect(scopedEngagements.body[0]).toMatchObject({ organisationId: orgId, id: equalDates.body.id });

      const missing = await requestJson(server.url, '/api/engagements/00000000-0000-4000-8000-000000000001');
      expect(missing.response.status).toBe(404);

      const firstArchive = await requestJson(server.url, `/api/engagements/${equalDates.body.id}/archive`, { method: 'POST' });
      const secondArchive = await requestJson(server.url, `/api/engagements/${equalDates.body.id}/archive`, { method: 'POST' });
      expect(secondArchive.body.archivedAt).toBe(firstArchive.body.archivedAt);
    } finally {
      await server.close();
    }
  });

  it('returns a safe generic response for unknown failures', async () => {
    const server = await start();
    try {
      const result = await requestJson(server.url, '/api/__test/unknown-error');
      const text = JSON.stringify(result.body);
      expect(result.response.status).toBe(500);
      expect(result.body).toMatchObject({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      });
      expect(result.body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(text).not.toMatch(/internal test|stack|sql|sqlite|constraint|\/tmp/i);
    } finally {
      await server.close();
    }
  });
});
