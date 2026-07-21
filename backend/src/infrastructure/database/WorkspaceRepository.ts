import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  ContactDirectoryResponseSchema,
  DashboardOperationalSummarySchema,
  FollowUpResponseSchema,
  OrganisationDirectoryResponseSchema,
  OrganisationWorkspaceSchema,
  SavedViewResponseSchema,
  SearchResponseSchema,
  TimelineResponseSchema,
  type ContactDirectoryQuery,
  type ContactDirectoryResponse,
  type DashboardOperationalSummary,
  type FollowUpQuery,
  type FollowUpResponse,
  type OrganisationDirectoryQuery,
  type OrganisationDirectoryResponse,
  type OrganisationWorkspace,
  type SavedView,
  type SavedViewCreate,
  type SavedViewUpdate,
  type SearchQuery,
  type SearchResponse,
  type TimelineQuery,
  type TimelineResponse,
} from 'shared';
import type { IWorkspaceRepository } from '../../application/interfaces/IRepositories';
import { sqlite } from './connection';

const SEARCH_ENTITY_TYPES = [
  'organisation',
  'contact',
  'engagement',
  'activity',
  'customer',
  'invoice',
] as const;

function buildFtsQuery(value: string): string {
  const tokens = value
    .normalize('NFKC')
    .match(/[\p{L}\p{N}]+/gu)
    ?.slice(0, 12) ?? [];

  return tokens
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(' AND ');
}

function clampContext(value: string | null): string {
  if (!value) return '';
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > 220 ? `${compact.slice(0, 217)}…` : compact;
}

function placeholders(prefix: string, values: readonly string[], params: Record<string, unknown>): string {
  return values.map((value, index) => {
    const key = `${prefix}${index}`;
    params[key] = value;
    return `@${key}`;
  }).join(', ');
}

function parseMetadata(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function getTodayInTimezone(connection: Database.Database): string {
  const row = connection.prepare(`select timezone from settings where id = 'default'`).get() as { timezone?: string } | undefined;
  const timezone = row?.timezone || 'Europe/Dublin';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getMonthStart(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

export function assertFts5Available(connection: Database.Database = sqlite as Database.Database): void {
  try {
    connection.prepare('select count(*) as total from search_documents_fts').get();
  } catch (error) {
    throw new Error(`SQLite FTS5 support is required for WI4 search: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function rebuildSearchIndex(connection: Database.Database = sqlite as Database.Database): void {
  const hasTable = connection.prepare(`
    select 1 as present
    from sqlite_master
    where type = 'table' and name = 'search_documents'
  `).get();
  if (!hasTable) return;

  assertFts5Available(connection);
  connection.transaction(() => {
    connection.prepare('delete from search_documents').run();

    connection.prepare(`
      insert into search_documents (
        id, entity_type, entity_id, organisation_id, title, subtitle, body, route,
        updated_at, archived_at
      )
      select
        'organisation:' || id,
        'organisation',
        id,
        id,
        name,
        trim(coalesce(industry, '') || case when country is not null then ' · ' || country else '' end),
        trim(coalesce(legal_name, '') || ' ' || coalesce(website, '') || ' ' || coalesce(source, '')),
        '/organisations/' || id,
        updated_at,
        archived_at
      from organisations
    `).run();

    connection.prepare(`
      insert into search_documents (
        id, entity_type, entity_id, organisation_id, title, subtitle, body, route,
        updated_at, archived_at
      )
      select
        'contact:' || c.id,
        'contact',
        c.id,
        c.organisation_id,
        trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
        trim(coalesce(c.job_title, '') || case when c.email is not null then ' · ' || c.email else '' end),
        trim(coalesce(c.email, '') || ' ' || coalesce(c.phone, '')),
        '/organisations/' || c.organisation_id || '?tab=contacts&contactId=' || c.id,
        c.updated_at,
        c.archived_at
      from contacts c
    `).run();

    connection.prepare(`
      insert into search_documents (
        id, entity_type, entity_id, organisation_id, title, subtitle, body, route,
        updated_at, archived_at
      )
      select
        'engagement:' || e.id,
        'engagement',
        e.id,
        e.organisation_id,
        e.name,
        e.type || ' · ' || e.status,
        coalesce(e.summary, ''),
        '/organisations/' || e.organisation_id || '?tab=engagements&engagementId=' || e.id,
        e.updated_at,
        e.archived_at
      from engagements e
    `).run();

    connection.prepare(`
      insert into search_documents (
        id, entity_type, entity_id, organisation_id, title, subtitle, body, route,
        updated_at, archived_at
      )
      select
        'activity:' || a.id,
        'activity',
        a.id,
        a.organisation_id,
        upper(substr(a.type, 1, 1)) || substr(a.type, 2),
        a.author || ' · ' || substr(a.occurred_at, 1, 10),
        a.body,
        '/organisations/' || a.organisation_id || '?tab=timeline&activityId=' || a.id,
        a.updated_at,
        a.archived_at
      from activities a
    `).run();

    connection.prepare(`
      insert into search_documents (
        id, entity_type, entity_id, organisation_id, title, subtitle, body, route,
        updated_at, archived_at
      )
      select
        'customer:' || c.id,
        'customer',
        c.id,
        m.organisation_id,
        trim(c.first_name || ' ' || c.last_name),
        trim(coalesce(c.company, '') || case when c.email <> '' then ' · ' || c.email else '' end),
        trim(c.email || ' ' || coalesce(c.phone, '') || ' ' || coalesce(c.mobile, '') || ' ' || coalesce(c.address, '')),
        '/customers/' || c.id,
        c.updated_at,
        null
      from customers c
      left join legacy_customer_crm_mappings m on m.customer_id = c.id
    `).run();

    connection.prepare(`
      insert into search_documents (
        id, entity_type, entity_id, organisation_id, title, subtitle, body, route,
        updated_at, archived_at
      )
      select
        'invoice:' || i.id,
        'invoice',
        i.id,
        m.organisation_id,
        i.invoice_number,
        upper(i.status) || ' · ' || trim(c.first_name || ' ' || c.last_name),
        coalesce(i.notes, ''),
        '/invoices?invoiceId=' || i.id,
        i.updated_at,
        null
      from invoices i
      join customers c on c.id = i.customer_id
      left join legacy_customer_crm_mappings m on m.customer_id = i.customer_id
    `).run();
  })();
}

export class WorkspaceRepository implements IWorkspaceRepository {
  constructor(private readonly connection: Database.Database = sqlite as Database.Database) {}

  async search(query: SearchQuery): Promise<SearchResponse> {
    assertFts5Available(this.connection);
    const fts = buildFtsQuery(query.q);
    if (!fts) return SearchResponseSchema.parse({ items: [], total: 0, limit: query.limit, offset: query.offset });

    const params: Record<string, unknown> = {
      fts,
      rawQuery: query.q,
      prefix: `${query.q}%`,
      organisationId: query.organisationId ?? null,
      includeArchived: query.includeArchived ? 1 : 0,
      limit: query.limit,
      offset: query.offset,
    };

    const types = query.types?.length ? query.types : [...SEARCH_ENTITY_TYPES];
    const typeList = placeholders('searchType', types, params);
    const commonWhere = `
      search_documents_fts match @fts
      and d.entity_type in (${typeList})
      and (@organisationId is null or d.organisation_id = @organisationId)
      and (@includeArchived = 1 or d.archived_at is null)
    `;

    const total = (this.connection.prepare(`
      select count(*) as total
      from search_documents_fts
      join search_documents d on d.rowid = search_documents_fts.rowid
      where ${commonWhere}
    `).get(params) as { total: number }).total;

    const rows = this.connection.prepare(`
      select
        d.id,
        d.entity_type,
        d.entity_id,
        d.organisation_id,
        d.title,
        d.subtitle,
        d.body,
        d.route,
        d.updated_at,
        o.name as organisation_name,
        bm25(search_documents_fts, 8.0, 3.0, 1.0) as fts_score,
        case
          when lower(d.title) = lower(@rawQuery) then 0
          when lower(d.title) like lower(@prefix) then 1
          else 2
        end as rank_bucket
      from search_documents_fts
      join search_documents d on d.rowid = search_documents_fts.rowid
      left join organisations o on o.id = d.organisation_id
      where ${commonWhere}
      order by rank_bucket asc, fts_score asc, d.updated_at desc, d.entity_type asc, d.entity_id asc
      limit @limit offset @offset
    `).all(params) as Array<{
      id: string;
      entity_type: string;
      entity_id: string;
      organisation_id: string | null;
      title: string;
      subtitle: string;
      body: string;
      route: string;
      updated_at: string;
      organisation_name: string | null;
      fts_score: number;
      rank_bucket: number;
    }>;

    const needle = query.q.toLocaleLowerCase('en');
    const items = rows.map((row) => {
      const matchedFields: string[] = [];
      if (row.title.toLocaleLowerCase('en').includes(needle)) matchedFields.push('title');
      if (row.subtitle.toLocaleLowerCase('en').includes(needle)) matchedFields.push('subtitle');
      if (row.body.toLocaleLowerCase('en').includes(needle)) matchedFields.push('body');
      return {
        id: row.id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        organisationId: row.organisation_id,
        title: row.title,
        subtitle: row.subtitle,
        context: row.organisation_name || clampContext(row.body),
        route: row.route,
        updatedAt: row.updated_at,
        score: row.rank_bucket * 100 + Math.max(0, row.fts_score),
        matchedFields,
      };
    });

    return SearchResponseSchema.parse({ items, total, limit: query.limit, offset: query.offset });
  }

  async listOrganisations(query: OrganisationDirectoryQuery): Promise<OrganisationDirectoryResponse> {
    const predicates: string[] = [];
    const params: Record<string, unknown> = { limit: query.limit, offset: query.offset };
    if (!query.includeArchived) predicates.push('o.archived_at is null');
    if (query.status) { predicates.push('o.status = @status'); params.status = query.status; }
    if (query.industry) { predicates.push('o.industry = @industry'); params.industry = query.industry; }
    if (query.country) { predicates.push('o.country = @country'); params.country = query.country; }
    if (query.search) {
      predicates.push(`(lower(o.name) like lower(@search) escape '\\' or lower(coalesce(o.legal_name, '')) like lower(@search) escape '\\')`);
      params.search = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
    }
    const where = predicates.length ? `where ${predicates.join(' and ')}` : '';
    const orderBy: Record<string, string> = {
      name_asc: 'lower(o.name) asc, o.id asc',
      updated_desc: 'o.updated_at desc, o.id asc',
      recent_activity: 'last_activity_at desc nulls last, lower(o.name) asc',
      next_follow_up: 'next_follow_up_date asc nulls last, lower(o.name) asc',
    };

    const total = (this.connection.prepare(`select count(*) as total from organisations o ${where}`).get(params) as { total: number }).total;
    const rows = this.connection.prepare(`
      select
        o.*,
        pc.id as primary_contact_id,
        pc.first_name as primary_contact_first_name,
        pc.last_name as primary_contact_last_name,
        pc.email as primary_contact_email,
        (
          select count(*) from engagements e
          where e.organisation_id = o.id and e.archived_at is null and e.status in ('proposed', 'active', 'paused')
        ) as active_engagement_count,
        (
          select max(a.occurred_at) from activities a
          where a.organisation_id = o.id and a.archived_at is null
        ) as last_activity_at,
        (
          select min(a.follow_up_date) from activities a
          where a.organisation_id = o.id and a.archived_at is null
            and a.follow_up_date is not null and a.follow_up_completed_at is null
        ) as next_follow_up_date
      from organisations o
      left join contacts pc on pc.organisation_id = o.id
        and pc.is_primary = 1 and pc.status = 'active' and pc.archived_at is null
      ${where}
      order by ${orderBy[query.sort]}
      limit @limit offset @offset
    `).all(params) as Array<Record<string, unknown>>;

    const items = rows.map((row) => ({
      id: row.id,
      name: row.name,
      legalName: row.legal_name,
      website: row.website,
      industry: row.industry,
      employeeBand: row.employee_band,
      annualRevenueBand: row.annual_revenue_band,
      country: row.country,
      status: row.status,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archivedAt: row.archived_at,
      primaryContact: row.primary_contact_id ? {
        id: row.primary_contact_id,
        firstName: row.primary_contact_first_name,
        lastName: row.primary_contact_last_name,
        email: row.primary_contact_email,
      } : null,
      activeEngagementCount: Number(row.active_engagement_count),
      lastActivityAt: row.last_activity_at,
      nextFollowUpDate: row.next_follow_up_date,
    }));

    return OrganisationDirectoryResponseSchema.parse({ items, total, limit: query.limit, offset: query.offset });
  }

  async listContacts(query: ContactDirectoryQuery): Promise<ContactDirectoryResponse> {
    const predicates: string[] = [];
    const params: Record<string, unknown> = { limit: query.limit, offset: query.offset };
    if (!query.includeArchived) predicates.push('c.archived_at is null');
    if (query.status) { predicates.push('c.status = @status'); params.status = query.status; }
    if (query.organisationId) { predicates.push('c.organisation_id = @organisationId'); params.organisationId = query.organisationId; }
    if (query.search) {
      predicates.push(`lower(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '') || ' ' || coalesce(c.email, ''))) like lower(@search) escape '\\'`);
      params.search = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
    }
    const where = predicates.length ? `where ${predicates.join(' and ')}` : '';
    const total = (this.connection.prepare(`select count(*) as total from contacts c ${where}`).get(params) as { total: number }).total;
    const rows = this.connection.prepare(`
      select c.*, o.name as organisation_name
      from contacts c
      join organisations o on o.id = c.organisation_id
      ${where}
      order by lower(o.name), lower(coalesce(c.last_name, '')), lower(coalesce(c.first_name, '')), c.id
      limit @limit offset @offset
    `).all(params) as Array<Record<string, unknown>>;

    return ContactDirectoryResponseSchema.parse({
      items: rows.map((row) => ({
        id: row.id,
        organisationId: row.organisation_id,
        organisationName: row.organisation_name,
        firstName: row.first_name,
        lastName: row.last_name,
        jobTitle: row.job_title,
        email: row.email,
        phone: row.phone,
        isPrimary: Boolean(row.is_primary),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        archivedAt: row.archived_at,
      })),
      total,
      limit: query.limit,
      offset: query.offset,
    });
  }

  async getOrganisationWorkspace(organisationId: string): Promise<OrganisationWorkspace | null> {
    const organisation = this.connection.prepare(`select * from organisations where id = ?`).get(organisationId) as Record<string, unknown> | undefined;
    if (!organisation) return null;

    const contacts = this.connection.prepare(`
      select * from contacts where organisation_id = ?
      order by archived_at is not null, is_primary desc, status asc, lower(coalesce(last_name, '')), lower(coalesce(first_name, '')), id
    `).all(organisationId) as Array<Record<string, unknown>>;
    const engagements = this.connection.prepare(`
      select * from engagements where organisation_id = ?
      order by archived_at is not null, case status when 'active' then 0 when 'proposed' then 1 when 'paused' then 2 else 3 end, start_date desc, id
    `).all(organisationId) as Array<Record<string, unknown>>;
    const customers = this.connection.prepare(`
      select
        c.id, c.first_name, c.last_name, c.company, c.email,
        (select count(*) from bookings b where b.customer_id = c.id) as booking_count,
        (select count(*) from invoices i where i.customer_id = c.id) as invoice_count,
        coalesce((
          select sum(max(0,
            coalesce((select sum(ii.quantity * ii.unit_price + round(ii.quantity * ii.unit_price * ii.tax_rate / 100.0)) from invoice_items ii where ii.invoice_id = i.id), 0)
            - i.discount
            - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)
          ))
          from invoices i where i.customer_id = c.id and i.status <> 'cancelled'
        ), 0) as outstanding_cents
      from legacy_customer_crm_mappings m
      join customers c on c.id = m.customer_id
      where m.organisation_id = ?
      order by lower(c.last_name), lower(c.first_name), c.id
    `).all(organisationId) as Array<Record<string, unknown>>;
    const recentActivities = this.connection.prepare(`
      select * from activities
      where organisation_id = ? and archived_at is null
      order by occurred_at desc, created_at desc, id asc
      limit 8
    `).all(organisationId) as Array<Record<string, unknown>>;

    const primary = contacts.find((contact) => Boolean(contact.is_primary) && contact.status === 'active' && !contact.archived_at) ?? null;
    const nextFollowUp = this.connection.prepare(`
      select min(follow_up_date) as next_follow_up_date
      from activities
      where organisation_id = ? and archived_at is null
        and follow_up_date is not null and follow_up_completed_at is null
    `).get(organisationId) as { next_follow_up_date: string | null };
    const lastActivity = this.connection.prepare(`
      select max(occurred_at) as last_activity_at from activities
      where organisation_id = ? and archived_at is null
    `).get(organisationId) as { last_activity_at: string | null };

    return OrganisationWorkspaceSchema.parse({
      organisation: {
        id: organisation.id,
        name: organisation.name,
        legalName: organisation.legal_name,
        website: organisation.website,
        industry: organisation.industry,
        employeeBand: organisation.employee_band,
        annualRevenueBand: organisation.annual_revenue_band,
        country: organisation.country,
        status: organisation.status,
        source: organisation.source,
        createdAt: organisation.created_at,
        updatedAt: organisation.updated_at,
        archivedAt: organisation.archived_at,
      },
      primaryContact: primary ? {
        id: primary.id,
        firstName: primary.first_name,
        lastName: primary.last_name,
        email: primary.email,
      } : null,
      contacts: contacts.map((row) => ({
        id: row.id,
        organisationId: row.organisation_id,
        firstName: row.first_name,
        lastName: row.last_name,
        jobTitle: row.job_title,
        email: row.email,
        phone: row.phone,
        isPrimary: Boolean(row.is_primary),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        archivedAt: row.archived_at,
      })),
      engagements: engagements.map((row) => ({
        id: row.id,
        organisationId: row.organisation_id,
        primaryContactId: row.primary_contact_id,
        name: row.name,
        type: row.type,
        status: row.status,
        summary: row.summary,
        startDate: row.start_date,
        endDate: row.end_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        archivedAt: row.archived_at,
      })),
      associatedCustomers: customers.map((row) => ({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        company: row.company,
        email: row.email,
        bookingCount: Number(row.booking_count),
        invoiceCount: Number(row.invoice_count),
        outstandingCents: Number(row.outstanding_cents),
      })),
      recentActivities: recentActivities.map((row) => ({
        id: row.id,
        organisationId: row.organisation_id,
        contactId: row.contact_id,
        engagementId: row.engagement_id,
        type: row.type,
        body: row.body,
        author: row.author,
        occurredAt: row.occurred_at,
        followUpDate: row.follow_up_date,
        followUpCompletedAt: row.follow_up_completed_at,
        source: row.source,
        sourceReference: row.source_reference,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        archivedAt: row.archived_at,
      })),
      activeEngagementCount: engagements.filter((engagement) => !engagement.archived_at && ['proposed', 'active', 'paused'].includes(String(engagement.status))).length,
      nextFollowUpDate: nextFollowUp.next_follow_up_date,
      lastActivityAt: lastActivity.last_activity_at,
    });
  }

  async listTimeline(organisationId: string, query: TimelineQuery): Promise<TimelineResponse> {
    const params: Record<string, unknown> = {
      organisationId,
      from: query.from ?? null,
      to: query.to ?? null,
      contactId: query.contactId ?? null,
      engagementId: query.engagementId ?? null,
      activityType: query.activityType ?? null,
      followUpStatus: query.followUpStatus ?? null,
      limit: query.limit,
      offset: query.offset,
    };
    const eventPredicate = query.eventTypes?.length
      ? `event_type in (${placeholders('timelineType', query.eventTypes, params)})`
      : '1 = 1';
    const commonWhere = `
      organisation_id = @organisationId
      and (@from is null or occurred_at >= @from)
      and (@to is null or occurred_at <= @to)
      and (@contactId is null or contact_id = @contactId)
      and (@engagementId is null or engagement_id = @engagementId)
      and (@activityType is null or activity_type = @activityType)
      and (
        @followUpStatus is null
        or (@followUpStatus = 'open' and follow_up_date is not null and follow_up_completed_at is null)
        or (@followUpStatus = 'completed' and follow_up_completed_at is not null)
        or (@followUpStatus = 'none' and follow_up_date is null)
      )
      and ${eventPredicate}
    `;

    const cte = `
      with timeline as (
        select
          'activity' as event_type,
          a.id,
          a.occurred_at,
          a.created_at,
          upper(substr(a.type, 1, 1)) || substr(a.type, 2) as title,
          a.body as description,
          a.organisation_id,
          a.contact_id,
          a.engagement_id,
          null as customer_id,
          a.id as source_entity_id,
          '/organisations/' || a.organisation_id || '?tab=timeline&activityId=' || a.id as source_route,
          a.type as activity_type,
          a.follow_up_date,
          a.follow_up_completed_at,
          json_object(
            'activityType', a.type,
            'author', a.author,
            'followUpDate', a.follow_up_date,
            'followUpCompletedAt', a.follow_up_completed_at
          ) as metadata_json
        from activities a
        where a.archived_at is null

        union all

        select
          'engagement',
          e.id,
          e.created_at,
          e.created_at,
          'Engagement: ' || e.name,
          coalesce(e.summary, e.type || ' · ' || e.status),
          e.organisation_id,
          e.primary_contact_id,
          e.id,
          null,
          e.id,
          '/organisations/' || e.organisation_id || '?tab=engagements&engagementId=' || e.id,
          null,
          null,
          null,
          json_object('engagementType', e.type, 'status', e.status, 'startDate', e.start_date, 'endDate', e.end_date)
        from engagements e
        where e.archived_at is null

        union all

        select
          'booking',
          b.id,
          b.created_at,
          b.created_at,
          'Booking ' || upper(b.status),
          'Scheduled for ' || b.date || ' at ' || b.time,
          m.organisation_id,
          m.contact_id,
          null,
          b.customer_id,
          b.id,
          '/customers/' || b.customer_id || '?tab=bookings&bookingId=' || b.id,
          null,
          null,
          null,
          json_object('status', b.status, 'date', b.date, 'time', b.time, 'serviceId', b.service_id)
        from bookings b
        join legacy_customer_crm_mappings m on m.customer_id = b.customer_id

        union all

        select
          'invoice',
          i.id,
          i.created_at,
          i.created_at,
          'Invoice ' || i.invoice_number,
          upper(i.status),
          m.organisation_id,
          m.contact_id,
          null,
          i.customer_id,
          i.id,
          '/invoices?invoiceId=' || i.id,
          null,
          null,
          null,
          json_object(
            'status', i.status,
            'invoiceNumber', i.invoice_number,
            'totalCents', coalesce((select sum(ii.quantity * ii.unit_price + round(ii.quantity * ii.unit_price * ii.tax_rate / 100.0)) from invoice_items ii where ii.invoice_id = i.id), 0) - i.discount
          )
        from invoices i
        join legacy_customer_crm_mappings m on m.customer_id = i.customer_id

        union all

        select
          'payment',
          p.id,
          p.created_at,
          p.created_at,
          'Payment received',
          'Payment against ' || i.invoice_number,
          m.organisation_id,
          m.contact_id,
          null,
          i.customer_id,
          p.id,
          '/invoices?invoiceId=' || i.id,
          null,
          null,
          null,
          json_object('amountCents', p.amount, 'paymentMethod', p.payment_method, 'invoiceNumber', i.invoice_number)
        from payments p
        join invoices i on i.id = p.invoice_id
        join legacy_customer_crm_mappings m on m.customer_id = i.customer_id
      )
    `;

    const total = (this.connection.prepare(`${cte} select count(*) as total from timeline where ${commonWhere}`).get(params) as { total: number }).total;
    const rows = this.connection.prepare(`
      ${cte}
      select * from timeline
      where ${commonWhere}
      order by occurred_at desc, created_at desc, event_type asc, id asc
      limit @limit offset @offset
    `).all(params) as Array<Record<string, unknown>>;

    return TimelineResponseSchema.parse({
      items: rows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        occurredAt: row.occurred_at,
        createdAt: row.created_at,
        title: row.title,
        description: row.description,
        organisationId: row.organisation_id,
        contactId: row.contact_id,
        engagementId: row.engagement_id,
        customerId: row.customer_id,
        sourceEntityId: row.source_entity_id,
        sourceRoute: row.source_route,
        metadata: parseMetadata(String(row.metadata_json)),
      })),
      total,
      limit: query.limit,
      offset: query.offset,
    });
  }

  async listFollowUps(query: FollowUpQuery): Promise<FollowUpResponse> {
    const today = getTodayInTimezone(this.connection);
    const predicates = ['a.follow_up_date is not null', 'a.archived_at is null'];
    const params: Record<string, unknown> = { today, limit: query.limit, offset: query.offset };
    if (query.organisationId) { predicates.push('a.organisation_id = @organisationId'); params.organisationId = query.organisationId; }
    if (query.contactId) { predicates.push('a.contact_id = @contactId'); params.contactId = query.contactId; }
    if (query.engagementId) { predicates.push('a.engagement_id = @engagementId'); params.engagementId = query.engagementId; }
    if (query.type) { predicates.push('a.type = @type'); params.type = query.type; }
    if (query.from) { predicates.push('a.follow_up_date >= @from'); params.from = query.from; }
    if (query.to) { predicates.push('a.follow_up_date <= @to'); params.to = query.to; }
    const bucketPredicates: Record<string, string> = {
      overdue: 'a.follow_up_completed_at is null and a.follow_up_date < @today',
      today: 'a.follow_up_completed_at is null and a.follow_up_date = @today',
      upcoming: 'a.follow_up_completed_at is null and a.follow_up_date > @today',
      completed: 'a.follow_up_completed_at is not null',
      open: 'a.follow_up_completed_at is null',
      all: '1 = 1',
    };
    predicates.push(bucketPredicates[query.bucket]);
    const where = predicates.join(' and ');
    const total = (this.connection.prepare(`select count(*) as total from activities a where ${where}`).get(params) as { total: number }).total;
    const rows = this.connection.prepare(`
      select
        a.*, o.name as organisation_name,
        trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) as contact_name,
        e.name as engagement_name
      from activities a
      join organisations o on o.id = a.organisation_id
      left join contacts c on c.id = a.contact_id
      left join engagements e on e.id = a.engagement_id
      where ${where}
      order by
        case when a.follow_up_completed_at is null then 0 else 1 end,
        a.follow_up_date asc,
        a.occurred_at desc,
        a.id asc
      limit @limit offset @offset
    `).all(params) as Array<Record<string, unknown>>;

    return FollowUpResponseSchema.parse({
      items: rows.map((row) => ({
        activityId: row.id,
        organisationId: row.organisation_id,
        organisationName: row.organisation_name,
        contactId: row.contact_id,
        contactName: row.contact_name || null,
        engagementId: row.engagement_id,
        engagementName: row.engagement_name,
        type: row.type,
        body: row.body,
        author: row.author,
        occurredAt: row.occurred_at,
        followUpDate: row.follow_up_date,
        followUpCompletedAt: row.follow_up_completed_at,
        status: row.follow_up_completed_at
          ? 'completed'
          : row.follow_up_date < today
            ? 'overdue'
            : row.follow_up_date === today
              ? 'today'
              : 'upcoming',
      })),
      total,
      limit: query.limit,
      offset: query.offset,
      today,
    });
  }

  async completeFollowUp(activityId: string, completedAt: string): Promise<boolean> {
    const result = this.connection.prepare(`
      update activities
      set follow_up_completed_at = @completedAt, updated_at = @completedAt
      where id = @activityId and archived_at is null and follow_up_date is not null
    `).run({ activityId, completedAt });
    return result.changes === 1;
  }

  async reopenFollowUp(activityId: string, updatedAt: string): Promise<boolean> {
    const result = this.connection.prepare(`
      update activities
      set follow_up_completed_at = null, updated_at = @updatedAt
      where id = @activityId and archived_at is null and follow_up_date is not null
    `).run({ activityId, updatedAt });
    return result.changes === 1;
  }

  async listSavedViews(context?: string, pinnedOnly = false): Promise<SavedView[]> {
    const predicates: string[] = [];
    const params: Record<string, unknown> = {};
    if (context) { predicates.push('context = @context'); params.context = context; }
    if (pinnedOnly) predicates.push('is_pinned = 1');
    const where = predicates.length ? `where ${predicates.join(' and ')}` : '';
    const rows = this.connection.prepare(`
      select * from saved_views ${where}
      order by is_pinned desc, lower(name), id
    `).all(params) as Array<Record<string, unknown>>;
    return rows.map((row) => SavedViewResponseSchema.parse({
      id: row.id,
      context: row.context,
      name: row.name,
      definition: JSON.parse(String(row.definition_json)),
      isPinned: Boolean(row.is_pinned),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async createSavedView(input: SavedViewCreate): Promise<SavedView> {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.connection.prepare(`
      insert into saved_views (id, context, name, normalized_name, definition_json, is_pinned, created_at, updated_at)
      values (@id, @context, @name, @normalizedName, @definitionJson, @isPinned, @now, @now)
    `).run({
      id,
      context: input.definition.context,
      name: input.name.trim(),
      normalizedName: input.name.trim().toLocaleLowerCase('en'),
      definitionJson: JSON.stringify(input.definition),
      isPinned: input.isPinned ? 1 : 0,
      now,
    });
    const saved = await this.getSavedView(id);
    if (!saved) throw new Error('Saved view was not found after create');
    return saved;
  }

  async getSavedView(id: string): Promise<SavedView | null> {
    const row = this.connection.prepare('select * from saved_views where id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? SavedViewResponseSchema.parse({
      id: row.id,
      context: row.context,
      name: row.name,
      definition: JSON.parse(String(row.definition_json)),
      isPinned: Boolean(row.is_pinned),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }) : null;
  }

  async updateSavedView(id: string, patch: SavedViewUpdate): Promise<SavedView | null> {
    const current = await this.getSavedView(id);
    if (!current) return null;
    const name = patch.name?.trim() ?? current.name;
    const definition = patch.definition ?? current.definition;
    const isPinned = patch.isPinned ?? current.isPinned;
    const now = new Date().toISOString();
    this.connection.prepare(`
      update saved_views
      set context = @context, name = @name, normalized_name = @normalizedName,
          definition_json = @definitionJson, is_pinned = @isPinned, updated_at = @now
      where id = @id
    `).run({
      id,
      context: definition.context,
      name,
      normalizedName: name.toLocaleLowerCase('en'),
      definitionJson: JSON.stringify(definition),
      isPinned: isPinned ? 1 : 0,
      now,
    });
    return this.getSavedView(id);
  }

  async deleteSavedView(id: string): Promise<boolean> {
    return this.connection.prepare('delete from saved_views where id = ?').run(id).changes === 1;
  }

  async getDashboard(): Promise<DashboardOperationalSummary> {
    const today = getTodayInTimezone(this.connection);
    const monthStart = getMonthStart(today);
    const counts = this.connection.prepare(`
      select
        (select count(*) from organisations where archived_at is null and status = 'active_client') as active_client_organisations,
        (select count(*) from engagements where archived_at is null and status = 'active') as active_engagements,
        (select count(*) from activities where archived_at is null and follow_up_date < @today and follow_up_completed_at is null) as overdue_follow_ups,
        (select count(*) from activities where archived_at is null and follow_up_date = @today and follow_up_completed_at is null) as due_today_follow_ups,
        (select coalesce(sum(amount), 0) from payments where substr(payment_date, 1, 10) >= @monthStart and substr(payment_date, 1, 10) <= @today) as collected_revenue_cents,
        (
          select coalesce(sum(outstanding), 0) from (
            select max(0,
              coalesce((select sum(ii.quantity * ii.unit_price + round(ii.quantity * ii.unit_price * ii.tax_rate / 100.0)) from invoice_items ii where ii.invoice_id = i.id), 0)
              - i.discount
              - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)
            ) as outstanding
            from invoices i where i.status <> 'cancelled'
          )
        ) as outstanding_cents
    `).get({ today, monthStart }) as Record<string, number>;

    const recentActivities = this.connection.prepare(`
      select a.id, a.type, a.body, a.author, a.occurred_at, a.organisation_id, o.name as organisation_name
      from activities a join organisations o on o.id = a.organisation_id
      where a.archived_at is null
      order by a.occurred_at desc, a.created_at desc, a.id asc
      limit 8
    `).all() as Array<Record<string, unknown>>;
    const recentlyUpdated = this.connection.prepare(`
      select id, name, status, updated_at
      from organisations where archived_at is null
      order by updated_at desc, id asc limit 6
    `).all() as Array<Record<string, unknown>>;
    const staleOrganisations = this.connection.prepare(`
      select o.id, o.name, max(a.occurred_at) as last_activity_at
      from organisations o
      left join activities a on a.organisation_id = o.id and a.archived_at is null
      where o.archived_at is null and o.status = 'active_client'
      group by o.id
      having last_activity_at is null or last_activity_at < datetime(@today, '-30 days')
      order by last_activity_at asc nulls first, lower(o.name), o.id
      limit 8
    `).all({ today }) as Array<Record<string, unknown>>;
    const endingSoon = this.connection.prepare(`
      select e.id, e.name, e.end_date, e.organisation_id, o.name as organisation_name
      from engagements e join organisations o on o.id = e.organisation_id
      where e.archived_at is null and e.status in ('active', 'paused')
        and e.end_date is not null and e.end_date >= @today and e.end_date <= date(@today, '+30 days')
      order by e.end_date asc, e.id asc limit 8
    `).all({ today }) as Array<Record<string, unknown>>;
    const urgentFollowUps = (await this.listFollowUps({ bucket: 'open', limit: 8, offset: 0 })).items;

    return DashboardOperationalSummarySchema.parse({
      activeClientOrganisations: Number(counts.active_client_organisations),
      activeEngagements: Number(counts.active_engagements),
      overdueFollowUps: Number(counts.overdue_follow_ups),
      dueTodayFollowUps: Number(counts.due_today_follow_ups),
      collectedRevenueCents: Number(counts.collected_revenue_cents),
      outstandingCents: Number(counts.outstanding_cents),
      recentActivities: recentActivities.map((row) => ({
        id: row.id,
        type: row.type,
        body: row.body,
        author: row.author,
        occurredAt: row.occurred_at,
        organisationId: row.organisation_id,
        organisationName: row.organisation_name,
      })),
      recentlyUpdatedOrganisations: recentlyUpdated.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        updatedAt: row.updated_at,
      })),
      needsAttention: {
        followUps: urgentFollowUps,
        staleOrganisations: staleOrganisations.map((row) => ({
          id: row.id,
          name: row.name,
          lastActivityAt: row.last_activity_at,
        })),
        engagementsEndingSoon: endingSoon.map((row) => ({
          id: row.id,
          name: row.name,
          endDate: row.end_date,
          organisationId: row.organisation_id,
          organisationName: row.organisation_name,
        })),
      },
      staleAfterDays: 30,
      today,
    });
  }
}
