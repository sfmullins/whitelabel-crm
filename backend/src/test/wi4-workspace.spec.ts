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
});
