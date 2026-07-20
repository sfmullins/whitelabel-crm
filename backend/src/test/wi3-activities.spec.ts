import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ActivityCreateBodySchema,
  ActivityUpdateSchema,
  CustomerActivityCreateBodySchema,
} from 'shared';
import { runWi3LegacyActivityBackfill, parseLegacyCustomerNotes } from '../infrastructure/database/wi3LegacyActivityBackfill';
import { LegacyCustomerMappingRepository, normaliseLegacyCompany } from '../infrastructure/database/LegacyCustomerMappingRepository';
import { ActivityRepository } from '../infrastructure/database/repositories/ActivityRepository';
import { cleanupTempDatabase, requestJson, setupTempDatabase, sqlite } from './crm/helpers';

const NOW = '2026-07-20T10:00:00.000Z';

function insertCustomer(input: {
  id: string;
  firstName?: string;
  lastName?: string;
  company?: string | null;
  email?: string;
  notes?: string | null;
}) {
  sqlite.prepare(`
    insert into customers (
      id, first_name, last_name, company, email, phone, mobile, address,
      notes, tags, created_at, updated_at
    ) values (
      @id, @firstName, @lastName, @company, @email, null, null, null,
      @notes, '[]', @now, @now
    )
  `).run({
    id: input.id,
    firstName: input.firstName ?? 'Legacy',
    lastName: input.lastName ?? 'Customer',
    company: input.company ?? null,
    email: input.email ?? `${input.id}@example.com`,
    notes: input.notes ?? null,
    now: NOW,
  });
}

describe('WI3 normalised activities', () => {
  beforeEach(setupTempDatabase);
  afterEach(cleanupTempDatabase);

  it('validates strict activity create and update contracts', () => {
    expect(ActivityCreateBodySchema.parse({
      type: 'note',
      body: '  Useful note  ',
      occurredAt: '2026-07-20T10:00:00Z',
      followUpDate: '2026-07-21',
    })).toMatchObject({
      type: 'note',
      body: 'Useful note',
      occurredAt: NOW,
    });

    expect(() => ActivityCreateBodySchema.parse({ type: 'bogus', body: 'x' })).toThrow();
    expect(() => ActivityCreateBodySchema.parse({ type: 'note', body: '   ' })).toThrow();
    expect(() => ActivityCreateBodySchema.parse({
      type: 'note',
      body: 'x',
      occurredAt: 'not-a-time',
    })).toThrow();
    expect(() => ActivityCreateBodySchema.parse({
      type: 'note',
      body: 'x',
      followUpDate: '2026-02-31',
    })).toThrow();
    expect(() => CustomerActivityCreateBodySchema.parse({
      type: 'note',
      body: 'x',
      contactId: '00000000-0000-4000-8000-000000000001',
    })).toThrow();
    expect(() => ActivityUpdateSchema.parse({})).toThrow();
    expect(() => ActivityUpdateSchema.parse({
      organisationId: '00000000-0000-4000-8000-000000000001',
    })).toThrow();
    expect(ActivityUpdateSchema.parse({ contactId: null, followUpDate: null }))
      .toEqual({ contactId: null, followUpDate: null });
  });

  it('maps legacy customers deterministically and imports every note segment idempotently', () => {
    const notes = [
      'Background text that must survive.',
      '',
      '[Note logged on 2026-07-18T09:30:00Z]:',
      'First structured note.',
      '',
      '[Note logged on date that cannot parse]:',
      'Second structured note with malformed marker [Note logged maybe].',
    ].join('\r\n');

    insertCustomer({
      id: '00000000-0000-4000-8000-000000000101',
      company: '  Acme   Ltd  ',
      notes,
    });
    insertCustomer({
      id: '00000000-0000-4000-8000-000000000102',
      firstName: 'Second',
      company: 'Ａｃｍｅ Ltd',
      notes: null,
    });
    insertCustomer({
      id: '00000000-0000-4000-8000-000000000103',
      firstName: 'Individual',
      company: null,
      notes: 'Only unstructured text',
    });

    expect(normaliseLegacyCompany('  Ａｃｍｅ   Ltd  ').sourceKey)
      .toBe('company:acme ltd');
    expect(parseLegacyCustomerNotes(notes, NOW)).toHaveLength(3);

    runWi3LegacyActivityBackfill(sqlite);

    const mappings = sqlite.prepare(`
      select customer_id, organisation_id, contact_id
      from legacy_customer_crm_mappings
      order by customer_id
    `).all() as Array<{
      customer_id: string;
      organisation_id: string;
      contact_id: string;
    }>;

    expect(mappings).toHaveLength(3);
    expect(mappings[0].organisation_id).toBe(mappings[1].organisation_id);
    expect(mappings[2].organisation_id).not.toBe(mappings[0].organisation_id);

    const companyContacts = sqlite.prepare(`
      select is_primary
      from contacts
      where organisation_id = ?
      order by id
    `).all(mappings[0].organisation_id) as Array<{ is_primary: number }>;
    expect(companyContacts).toEqual([{ is_primary: 0 }, { is_primary: 0 }]);

    const activities = sqlite.prepare(`
      select body, author, source, source_reference, organisation_id, contact_id
      from activities
      order by source_reference
    `).all() as Array<Record<string, string>>;
    expect(activities).toHaveLength(4);
    expect(activities.every((row) => row.author === 'Legacy import')).toBe(true);
    expect(activities.every((row) => row.source === 'legacy_import')).toBe(true);
    expect(activities.some((row) => row.body.includes('Background text'))).toBe(true);
    expect(activities.some((row) => row.body.includes('Legacy timestamp: date that cannot parse'))).toBe(true);
    expect(activities.every((row) => row.source_reference.startsWith('legacy-customer-note:'))).toBe(true);

    const original = sqlite.prepare('select notes from customers where id = ?')
      .get('00000000-0000-4000-8000-000000000101') as { notes: string };
    expect(original.notes).toBe(notes);

    runWi3LegacyActivityBackfill(sqlite);
    expect(sqlite.prepare('select count(*) as count from activities').get())
      .toEqual({ count: 4 });

    const repository = new LegacyCustomerMappingRepository(sqlite);
    const again = repository.ensureCustomerMapping(mappings[0].customer_id);
    expect(again).toMatchObject({
      organisationId: mappings[0].organisation_id,
      contactId: mappings[0].contact_id,
    });
  });

  it('supports canonical and customer compatibility routes without writing customers.notes', async () => {
    insertCustomer({
      id: '00000000-0000-4000-8000-000000000201',
      company: null,
      notes: 'Preserved legacy value',
    });
    runWi3LegacyActivityBackfill(sqlite);

    const { startServer } = await import('../server');
    const server = await startServer({ host: '127.0.0.1', port: 0 });
    try {
      const created = await requestJson(
        server.url,
        '/api/customers/00000000-0000-4000-8000-000000000201/activities',
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'call',
            body: '  Discussed next steps  ',
            followUpDate: '2026-07-25',
          }),
        },
      );
      expect(created.response.status).toBe(201);
      expect(created.body).toMatchObject({
        type: 'call',
        body: 'Discussed next steps',
        author: 'Local user',
        source: 'user',
        followUpDate: '2026-07-25',
      });

      const listed = await requestJson(
        server.url,
        '/api/customers/00000000-0000-4000-8000-000000000201/activities',
      );
      expect(listed.response.status).toBe(200);
      expect(listed.body).toHaveLength(2);
      expect(listed.body.every((row: { contactId: string }) =>
        row.contactId === created.body.contactId)).toBe(true);

      const updated = await requestJson(server.url, `/api/activities/${created.body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: 'Updated body', followUpDate: null }),
      });
      expect(updated.response.status).toBe(200);
      expect(updated.body).toMatchObject({ body: 'Updated body', followUpDate: null });

      const invalid = await requestJson(
        server.url,
        '/api/customers/00000000-0000-4000-8000-000000000201/activities',
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'note',
            body: 'x',
            organisationId: '00000000-0000-4000-8000-000000000999',
          }),
        },
      );
      expect(invalid.response.status).toBe(400);

      const firstArchive = await requestJson(
        server.url,
        `/api/activities/${created.body.id}/archive`,
        { method: 'POST' },
      );
      const secondArchive = await requestJson(
        server.url,
        `/api/activities/${created.body.id}/archive`,
        { method: 'POST' },
      );
      expect(secondArchive.body.archivedAt).toBe(firstArchive.body.archivedAt);

      const hidden = await requestJson(server.url, `/api/activities/${created.body.id}`);
      expect(hidden.response.status).toBe(404);

      const hardDelete = await fetch(`${server.url}/api/activities/${created.body.id}`, {
        method: 'DELETE',
      });
      expect(hardDelete.status).toBe(404);

      expect(sqlite.prepare('select notes from customers where id = ?')
        .get('00000000-0000-4000-8000-000000000201'))
        .toEqual({ notes: 'Preserved legacy value' });
    } finally {
      await server.close();
    }
  });

  it('orders and filters repository results deterministically', async () => {
    sqlite.prepare(`
      insert into organisations (
        id, name, status, created_at, updated_at
      ) values (
        '00000000-0000-4000-8000-000000000301',
        'Order test',
        'active_client',
        @now,
        @now
      )
    `).run({ now: NOW });

    const rows = [
      { id: '00000000-0000-4000-8000-000000000303', type: 'note', body: 'A', occurredAt: '2026-07-20T09:00:00.000Z' },
      { id: '00000000-0000-4000-8000-000000000302', type: 'call', body: 'B', occurredAt: '2026-07-20T09:00:00.000Z' },
      { id: '00000000-0000-4000-8000-000000000304', type: 'note', body: 'C', occurredAt: '2026-07-19T09:00:00.000Z' },
    ];
    const insert = sqlite.prepare(`
      insert into activities (
        id, organisation_id, contact_id, engagement_id, type, body, author,
        occurred_at, follow_up_date, source, source_reference,
        created_at, updated_at, archived_at
      ) values (
        @id, '00000000-0000-4000-8000-000000000301', null, null,
        @type, @body, 'Tester', @occurredAt, null, 'user', null,
        @now, @now, null
      )
    `);
    for (const row of rows) insert.run({ ...row, now: NOW });

    const repository = new ActivityRepository(sqlite);
    const all = await repository.list({
      organisationId: '00000000-0000-4000-8000-000000000301',
      limit: 50,
      offset: 0,
    });
    expect(all.map((row) => row.id)).toEqual([
      '00000000-0000-4000-8000-000000000302',
      '00000000-0000-4000-8000-000000000303',
      '00000000-0000-4000-8000-000000000304',
    ]);

    const notes = await repository.list({
      organisationId: '00000000-0000-4000-8000-000000000301',
      type: 'note',
      occurredFrom: '2026-07-20T00:00:00.000Z',
      limit: 1,
      offset: 0,
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe('A');
  });
});
