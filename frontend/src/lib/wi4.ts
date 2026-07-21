import type { SavedView, SearchEntityType, SearchResult } from 'shared';

export function buildQueryString(values: Record<string, string | number | boolean | string[] | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function groupSearchResults(items: SearchResult[]): Array<{ type: SearchEntityType; items: SearchResult[] }> {
  const order: SearchEntityType[] = ['organisation', 'contact', 'engagement', 'activity', 'customer', 'invoice'];
  return order
    .map((type) => ({ type, items: items.filter((item) => item.entityType === type) }))
    .filter((group) => group.items.length > 0);
}

export function formatEntityLabel(type: SearchEntityType): string {
  return ({
    organisation: 'Organisations',
    contact: 'Contacts',
    engagement: 'Engagements',
    activity: 'Activities',
    customer: 'Customer records',
    invoice: 'Invoices',
  } as const)[type];
}

export function savedViewRoute(view: SavedView): string {
  const definition = view.definition;
  if (definition.context === 'organisations') {
    return `/organisations${buildQueryString({ ...definition.filters, sort: definition.sort })}`;
  }
  if (definition.context === 'followups') {
    return `/follow-ups${buildQueryString(definition.filters)}`;
  }
  if (definition.context === 'search') {
    return `/search${buildQueryString(definition.filters)}`;
  }
  const { organisationId, ...filters } = definition.filters;
  return `/organisations/${organisationId}${buildQueryString({ tab: 'timeline', ...filters })}`;
}

export function rememberRecentRecord(result: Pick<SearchResult, 'entityType' | 'entityId' | 'title' | 'subtitle' | 'route'>): void {
  const key = 'wi4-recent-records';
  const existing = readRecentRecords();
  const next = [result, ...existing.filter((item) => item.entityId !== result.entityId || item.entityType !== result.entityType)].slice(0, 6);
  localStorage.setItem(key, JSON.stringify(next));
}

export function readRecentRecords(): Array<Pick<SearchResult, 'entityType' | 'entityId' | 'title' | 'subtitle' | 'route'>> {
  try {
    const parsed = JSON.parse(localStorage.getItem('wi4-recent-records') ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
