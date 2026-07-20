import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanupTempDatabase, setupTempDatabase, sqlite } from './crm/helpers';

const organisationId = '00000000-0000-4000-8000-000000000401';
const now = '2026-07-20T10:00:00.000Z';

function insertOrganisation() {
  sqlite.prepare(`
    insert into organisations (id, name, status, created_at, updated_at)
    values (?, 'Constraint test', 'active_client', ?, ?)
  `).run(organisationId, now, now);
}

function insertActivity(overrides: Record<string, unknown> = {}) {
  sqlite.prepare(`
    insert into activities (
      id, organisation_id, contact_id, engagement_id,
      type, body, author, occurred_at, follow_up_date,
      source, source_reference, created_at, updated_at, archived_at
    ) values (
      @id, @organisationId, null, null,
      @type, @body, @author, @occurredAt, null,
      @source, null, @createdAt, @updatedAt, null
    )
  `).run({
    id: '00000000-0000-4000-8000-000000000402',
    organisationId,
    type: 'note',
    body: 'Valid body',
    author: 'Local user',
    occurredAt: now,
    source: 'user',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('WI3 SQLite constraints', () => {
  beforeEach(() => {
    setupTempDatabase();
    insertOrganisation();
  });
  afterEach(cleanupTempDatabase);

  it.each([
    ['invalid activity type', { type: 'invalid' }],
    ['blank activity body', { body: '   ' }],
    ['blank activity author', { author: '   ' }],
    ['invalid activity source', { source: 'external' }],
  ])('rejects %s at the database boundary', (_label, overrides) => {
    expect(() => insertActivity(overrides)).toThrow();
  });

  it('rejects unsupported legacy organisation mapping source types', () => {
    expect(() => sqlite.prepare(`
      insert into legacy_organisation_mappings (
        source_key, source_type, organisation_id, display_name, created_at
      ) values (?, ?, ?, ?, ?)
    `).run('unsupported:key', 'unsupported', organisationId, 'Unsupported', now)).toThrow();
  });

  it('accepts a valid activity row', () => {
    expect(() => insertActivity()).not.toThrow();
    expect(sqlite.prepare('select type, source from activities').get()).toEqual({
      type: 'note',
      source: 'user',
    });
  });
});
