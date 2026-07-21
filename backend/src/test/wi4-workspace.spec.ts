import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runSeed } from '../infrastructure/database/seed';
import { WorkspaceRepository, assertFts5Available } from '../infrastructure/database/WorkspaceRepository';
import { ActivityRepository } from '../infrastructure/database/repositories/ActivityRepository';
import { cleanupTempDatabase, setupTempDatabase, sqlite } from './crm/helpers';

const ACME = '20000000-0000-4000-8000-000000000001';

describe('WI4 CRM workspace repository', () => {
  beforeEach(async () => { setupTempDatabase(); await runSeed(); });
  afterEach(cleanupTempDatabase);

  it('uses FTS5 and ranks Acme Ltd ahead of related content', async () => {
    expect(() => assertFts5Available(sqlite)).not.toThrow();
    const repository = new WorkspaceRepository(sqlite);
    const result = await repository.search({ q: 'Acme', includeArchived: false, limit: 20, offset: 0 });
    expect(result.items[0]).toMatchObject({ entityType: 'organisation', entityId: ACME, title: 'Acme Ltd' });
    expect(result.items.some((item) => item.entityType === 'contact' && item.title === 'Aisling Byrne')).toBe(true);
  });

  it('indexes the supplied Good Order identity without invented contact details', async () => {
    const repository = new WorkspaceRepository(sqlite);
    const result = await repository.search({ q: 'Stephen Mullins', includeArchived: false, limit: 20, offset: 0 });
    const stephen = result.items.find((item) => item.title === 'Stephen Mullins');
    expect(stephen).toBeTruthy();
    const stored = sqlite.prepare(`select email, phone from contacts where id = '10000000-0000-4000-8000-000000000002'`).get() as { email: string | null; phone: string | null };
    expect(stored).toEqual({ email: null, phone: null });
  });

  it('returns a stable unified Acme timeline with CRM and financial events', async () => {
    const repository = new WorkspaceRepository(sqlite);
    const timeline = await repository.listTimeline(ACME, { limit: 100, offset: 0 });
    expect(new Set(timeline.items.map((item) => item.eventType))).toEqual(new Set(['activity', 'engagement', 'booking', 'invoice', 'payment']));
    const ordered = [...timeline.items].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt) || a.eventType.localeCompare(b.eventType) || a.id.localeCompare(b.id));
    expect(timeline.items).toEqual(ordered);
  });

  it('completes, reopens and reschedules activity follow-ups without archiving history', async () => {
    const repository = new WorkspaceRepository(sqlite);
    const queue = await repository.listFollowUps({ bucket: 'overdue', limit: 20, offset: 0 });
    expect(queue.items.length).toBeGreaterThan(0);
    const activityId = queue.items[0].activityId;
    const activities = new ActivityRepository(sqlite);
    expect(await activities.completeFollowUp(activityId, '2026-07-20T12:00:00.000Z')).toBeTruthy();
    expect((await repository.listFollowUps({ bucket: 'completed', limit: 20, offset: 0 })).items.some((item) => item.activityId === activityId)).toBe(true);
    expect(await activities.reopenFollowUp(activityId, '2026-07-20T13:00:00.000Z')).toBeTruthy();
    expect((await activities.getById(activityId, { includeArchived: true }))?.archivedAt).toBeNull();
  });

  it('keeps the FTS projection synchronized after domain writes and archive', async () => {
    const now = new Date().toISOString();
    const id = '40000000-0000-4000-8000-000000000001';
    sqlite.prepare(`insert into organisations (id, name, status, created_at, updated_at) values (?, 'Exact Search Target', 'prospect', ?, ?)`).run(id, now, now);
    const repository = new WorkspaceRepository(sqlite);
    expect((await repository.search({ q: 'Exact Search', includeArchived: false, limit: 10, offset: 0 })).items[0].entityId).toBe(id);
    sqlite.prepare(`update organisations set archived_at = ?, updated_at = ? where id = ?`).run(now, now, id);
    expect((await repository.search({ q: 'Exact Search', includeArchived: false, limit: 10, offset: 0 })).items).toHaveLength(0);
    expect((await repository.search({ q: 'Exact Search', includeArchived: true, limit: 10, offset: 0 })).items[0].entityId).toBe(id);
  });

  it('refreshes contextual search fields and legacy mappings', async () => {
    const repository = new WorkspaceRepository(sqlite);
    const contactId = '50000000-0000-4000-8000-000000000002';
    const engagementId = '50000000-0000-4000-8000-000000000003';
    const activityId = '50000000-0000-4000-8000-000000000004';
    const now = new Date().toISOString();

    sqlite.prepare(`insert into contacts (
      id, organisation_id, first_name, last_name, job_title, email, phone, is_primary,
      status, created_at, updated_at, archived_at
    ) values (?, ?, 'Context', 'Person', 'Advisor', null, null, 0, 'active', ?, ?, null)`)
      .run(contactId, ACME, now, now);
    sqlite.prepare(`insert into engagements (
      id, organisation_id, primary_contact_id, name, type, status, summary, start_date,
      end_date, created_at, updated_at, archived_at
    ) values (?, ?, ?, 'Context Engagement', 'other', 'active', null, '2026-07-20',
      null, ?, ?, null)`).run(engagementId, ACME, contactId, now, now);
    sqlite.prepare(`insert into activities (
      id, organisation_id, contact_id, engagement_id, type, body, author, occurred_at,
      follow_up_date, follow_up_completed_at, source, source_reference, created_at,
      updated_at, archived_at
    ) values (?, ?, ?, ?, 'note', 'Context-only note', 'Local user', ?, null, null,
      'user', null, ?, ?, null)`).run(activityId, ACME, contactId, engagementId, now, now, now);

    expect((await repository.search({ q: 'Acme Context', includeArchived: false, limit: 30, offset: 0 }))
      .items.some((item) => item.entityId === activityId)).toBe(true);

    sqlite.prepare(`update organisations set name = 'Acme Renewed Ltd', updated_at = ? where id = ?`).run(now, ACME);
    expect((await repository.search({ q: 'Acme Renewed Context', includeArchived: false, limit: 30, offset: 0 }))
      .items.some((item) => item.entityId === activityId)).toBe(true);
  });

  it('enforces WI4 database constraints and uses payment_date in the timeline', async () => {
    const timestamp = new Date().toISOString();
    expect(() => sqlite.prepare(`insert into saved_views (
      id, context, name, normalized_name, definition_json, is_pinned, created_at, updated_at
    ) values (?, 'invalid', 'Bad', 'bad', '{}', 0, ?, ?)`)
      .run('50000000-0000-4000-8000-000000000010', timestamp, timestamp))
      .toThrow();

    const completed = sqlite.prepare(`select id from activities where follow_up_completed_at is not null limit 1`)
      .get() as { id: string };
    expect(() => sqlite.prepare(`update activities
      set follow_up_date = null, follow_up_completed_at = ? where id = ?`)
      .run(timestamp, completed.id)).toThrow();

    const payment = sqlite.prepare(`select payment_date from payments where id = '20000000-0000-4000-8000-000000000009'`)
      .get() as { payment_date: string };
    const repository = new WorkspaceRepository(sqlite);
    const timeline = await repository.listTimeline(ACME, { eventTypes: ['payment'], limit: 10, offset: 0 });
    expect(timeline.items[0]?.occurredAt).toBe(payment.payment_date);
  });
});
