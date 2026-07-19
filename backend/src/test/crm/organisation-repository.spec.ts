import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanupTempDatabase, createRepositories, setupTempDatabase } from './helpers';

describe('OrganisationRepository', () => {
  beforeEach(setupTempDatabase);
  afterEach(cleanupTempDatabase);

  it('creates, lists, searches literally, updates nullables and archives idempotently', async () => {
    const { organisations } = createRepositories();
    const beta = await organisations.create({
      name: 'Beta % Co',
      legalName: 'Beta Legal',
      website: 'https://example.com',
      industry: 'Technology',
      employeeBand: '10_24',
      annualRevenueBand: '1m_5m',
      country: 'US',
      source: 'Referral',
      status: 'active_client',
    });
    await organisations.create({ name: 'alpha', status: 'prospect' });

    expect(beta.id).toMatch(/[0-9a-f-]{36}/);
    expect((await organisations.list({ limit: 50, offset: 0 })).map((org) => org.name))
      .toEqual(['alpha', 'Beta % Co']);
    expect(await organisations.list({ search: '%', limit: 50, offset: 0 })).toHaveLength(1);

    const renamed = await organisations.update(beta.id, { name: 'Beta Renamed' });
    expect(renamed).toMatchObject({
      name: 'Beta Renamed',
      legalName: 'Beta Legal',
      website: 'https://example.com',
      industry: 'Technology',
      employeeBand: '10_24',
      annualRevenueBand: '1m_5m',
      country: 'US',
      source: 'Referral',
    });

    const updated = await organisations.update(beta.id, {
      legalName: null,
      website: null,
      industry: null,
      employeeBand: null,
      annualRevenueBand: null,
      country: null,
      source: null,
    });
    expect(updated).toMatchObject({
      legalName: null,
      website: null,
      industry: null,
      employeeBand: null,
      annualRevenueBand: null,
      country: null,
      source: null,
    });

    const archived = await organisations.archive(beta.id, '2026-01-01T00:00:00.000Z');
    const archivedAgain = await organisations.archive(beta.id, '2026-02-01T00:00:00.000Z');
    expect(archivedAgain?.archivedAt).toBe(archived?.archivedAt);
    expect(await organisations.list({ limit: 50, offset: 0 })).toHaveLength(1);
    expect(await organisations.list({ includeArchived: true, limit: 50, offset: 0 })).toHaveLength(2);
  });
});
