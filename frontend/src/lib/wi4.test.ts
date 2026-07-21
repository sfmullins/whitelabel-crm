import { describe, expect, it } from 'vitest';
import type { SearchResult } from 'shared';
import { buildQueryString, groupSearchResults, savedViewRoute } from './wi4';

const base = {
  id: 'organisation:10000000-0000-4000-8000-000000000001',
  entityId: '10000000-0000-4000-8000-000000000001',
  organisationId: '10000000-0000-4000-8000-000000000001',
  title: 'Acme Ltd', subtitle: 'Technology services', context: 'Acme Ltd', route: '/organisations/10000000-0000-4000-8000-000000000001',
  updatedAt: '2026-07-20T10:00:00.000Z', score: 0, matchedFields: ['title'] as SearchResult['matchedFields'],
};

describe('WI4 frontend helpers', () => {
  it('creates stable URL query strings and skips empty values', () => {
    expect(buildQueryString({ q: 'Acme Ltd', includeArchived: false, types: ['organisation', 'contact'], empty: '' }))
      .toBe('?q=Acme+Ltd&includeArchived=false&types=organisation%2Ccontact');
  });

  it('groups global search results in product order', () => {
    const groups = groupSearchResults([
      { ...base, id: 'contact:20000000-0000-4000-8000-000000000002', entityId: '20000000-0000-4000-8000-000000000002', entityType: 'contact' },
      { ...base, entityType: 'organisation' },
    ]);
    expect(groups.map((group) => group.type)).toEqual(['organisation', 'contact']);
  });
});

describe('saved-view routes', () => {
  it('restores pinned saved-view routes with their filters', () => {
    expect(savedViewRoute({
      id: '50000000-0000-4000-8000-000000000001',
      context: 'timeline',
      name: 'Acme calls',
      definition: {
        version: 1,
        context: 'timeline',
        filters: {
          organisationId: '20000000-0000-4000-8000-000000000001',
          eventTypes: ['activity'],
          activityType: 'call',
        },
        sort: 'occurred_desc',
      },
      isPinned: true,
      createdAt: '2026-07-20T10:00:00.000Z',
      updatedAt: '2026-07-20T10:00:00.000Z',
    })).toBe('/organisations/20000000-0000-4000-8000-000000000001?tab=timeline&eventTypes=activity&activityType=call');
  });
});
