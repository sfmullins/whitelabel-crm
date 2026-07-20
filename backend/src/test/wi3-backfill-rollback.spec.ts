import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runWi3LegacyActivityBackfill } from '../infrastructure/database/wi3LegacyActivityBackfill';
import { cleanupTempDatabase, setupTempDatabase, sqlite } from './crm/helpers';

const customerId = '00000000-0000-4000-8000-000000000601';
const now = '2026-07-20T10:00:00.000Z';
const notes = '[Note logged on 2026-07-20T09:00:00Z]:\nRollback note';

describe('WI3 legacy activity backfill rollback', () => {
  beforeEach(() => {
    setupTempDatabase();
    sqlite.prepare(`
      insert into customers (
        id, first_name, last_name, company, email, notes, tags, created_at, updated_at
      ) values (?, 'Rollback', 'Customer', null, 'rollback@example.com', ?, '[]', ?, ?)
    `).run(customerId, notes, now, now);
  });
  afterEach(cleanupTempDatabase);

  it('rolls back the affected customer transaction and reports customer context', () => {
    sqlite.exec(`
      create trigger fail_backfill_activity
      before insert on activities
      when NEW.body = 'Rollback note'
      begin
        select raise(abort, 'injected activity failure');
      end;
    `);

    expect(() => runWi3LegacyActivityBackfill(sqlite))
      .toThrow(new RegExp(`${customerId}.*injected activity failure`));

    expect(sqlite.prepare('select count(*) as count from organisations').get()).toEqual({ count: 0 });
    expect(sqlite.prepare('select count(*) as count from contacts').get()).toEqual({ count: 0 });
    expect(sqlite.prepare('select count(*) as count from legacy_organisation_mappings').get()).toEqual({ count: 0 });
    expect(sqlite.prepare('select count(*) as count from legacy_customer_crm_mappings').get()).toEqual({ count: 0 });
    expect(sqlite.prepare('select count(*) as count from activities').get()).toEqual({ count: 0 });
    expect(sqlite.prepare('select notes from customers where id = ?').get(customerId))
      .toEqual({ notes });
  });
});
