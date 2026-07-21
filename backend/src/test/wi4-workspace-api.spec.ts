import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runSeed } from '../infrastructure/database/seed';
import { cleanupTempDatabase, requestJson, setupTempDatabase } from './crm/helpers';

const ACME = '20000000-0000-4000-8000-000000000001';

describe('WI4 workspace API', () => {
  beforeEach(async () => { setupTempDatabase(); await runSeed(); });
  afterEach(cleanupTempDatabase);

  it('validates search, directory, workspace, timeline and follow-up contracts', async () => {
    const { startServer } = await import('../server');
    const server = await startServer({ host: '127.0.0.1', port: 0 });
    try {
      const short = await requestJson(server.url, '/api/search?q=a');
      expect(short.response.status).toBe(400);
      const search = await requestJson(server.url, '/api/search?q=Acme&types=organisation,contact&limit=10&offset=0');
      expect(search.response.status).toBe(200);
      expect(search.body.items[0].title).toBe('Acme Ltd');
      const unknown = await requestJson(server.url, '/api/search?q=Acme&wat=1');
      expect(unknown.response.status).toBe(400);
      const organisations = await requestJson(server.url, '/api/workspace/organisations?status=active_client&sort=recent_activity&limit=20&offset=0');
      expect(organisations.response.status).toBe(200);
      expect(organisations.body.items.map((item: { id: string }) => item.id)).toContain(ACME);
      const workspace = await requestJson(server.url, `/api/workspace/organisations/${ACME}`);
      expect(workspace.response.status).toBe(200);
      expect(workspace.body.primaryContact.firstName).toBe('Aisling');
      const timeline = await requestJson(server.url, `/api/organisations/${ACME}/timeline?eventTypes=activity,invoice&limit=50&offset=0`);
      expect(timeline.response.status).toBe(200);
      expect(timeline.body.items.every((item: { eventType: string }) => ['activity', 'invoice'].includes(item.eventType))).toBe(true);
      const inverted = await requestJson(server.url, `/api/organisations/${ACME}/timeline?from=2026-08-01T00:00:00.000Z&to=2026-07-01T00:00:00.000Z`);
      expect(inverted.response.status).toBe(400);
      const followups = await requestJson(server.url, '/api/follow-ups?bucket=open&limit=50&offset=0');
      expect(followups.response.status).toBe(200);
      expect(followups.body.items.length).toBeGreaterThan(0);
    } finally { await server.close(); }
  });

  it('creates and enforces context-scoped saved-view names', async () => {
    const { startServer } = await import('../server');
    const server = await startServer({ host: '127.0.0.1', port: 0 });
    try {
      const payload = { name: 'My prospects', definition: { version: 1, context: 'organisations', filters: { status: 'prospect' }, sort: 'name_asc' }, isPinned: true };
      const created = await requestJson(server.url, '/api/saved-views', { method: 'POST', body: JSON.stringify(payload) });
      expect(created.response.status).toBe(201);
      const duplicate = await requestJson(server.url, '/api/saved-views', { method: 'POST', body: JSON.stringify({ ...payload, name: '  my PROSPECTS  ' }) });
      expect(duplicate.response.status).toBe(409);
    } finally { await server.close(); }
  });
});
