import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase, sqlite } from '../../infrastructure/database/connection';
import { runMigrations } from '../../infrastructure/database/migrate';
import { migrationsFolder } from './helpers';

let tempDir: string | null = null;

afterEach(() => {
  closeDatabase();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

function copyBaselineMigration(target: string) {
  fs.mkdirSync(path.join(target, 'meta'), { recursive: true });
  fs.copyFileSync(
    path.join(migrationsFolder, '0000_perpetual_whizzer.sql'),
    path.join(target, '0000_perpetual_whizzer.sql'),
  );
  fs.copyFileSync(
    path.join(migrationsFolder, 'meta', '0000_snapshot.json'),
    path.join(target, 'meta', '0000_snapshot.json'),
  );
  const journal = JSON.parse(fs.readFileSync(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8'));
  journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx === 0);
  fs.writeFileSync(path.join(target, 'meta', '_journal.json'), JSON.stringify(journal, null, 2));
}

describe('CRM staged migration upgrade', () => {
  it('applies 0001 after existing legacy data without changing legacy rows', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whitelabel-crm-upgrade-'));
    const databasePath = path.join(tempDir, 'upgrade.sqlite');
    const baselineMigrations = path.join(tempDir, 'baseline-migrations');
    copyBaselineMigration(baselineMigrations);

    const database = openDatabase(databasePath);
    runMigrations(database, baselineMigrations);

    const now = '2026-01-01T00:00:00.000Z';
    const customerId = '00000000-0000-4000-8000-000000000101';
    const serviceId = '00000000-0000-4000-8000-000000000102';
    const bookingId = '00000000-0000-4000-8000-000000000103';
    const invoiceId = '00000000-0000-4000-8000-000000000104';
    const invoiceItemId = '00000000-0000-4000-8000-000000000105';
    const paymentId = '00000000-0000-4000-8000-000000000106';

    sqlite.prepare(`
      insert into customers (id, first_name, last_name, company, email, tags, created_at, updated_at)
      values (?, 'Legacy', 'Customer', 'Legacy Co', 'legacy@example.com', '[]', ?, ?)
    `).run(customerId, now, now);
    sqlite.prepare(`
      insert into services (id, name, duration, price, tax_rate, is_active, created_at, updated_at)
      values (?, 'Consulting', 60, 10000, 10, 1, ?, ?)
    `).run(serviceId, now, now);
    sqlite.prepare(`
      insert into bookings (id, customer_id, service_id, date, time, status, created_at, updated_at)
      values (?, ?, ?, '2026-01-02', '09:00', 'confirmed', ?, ?)
    `).run(bookingId, customerId, serviceId, now, now);
    sqlite.prepare(`
      insert into invoices (id, invoice_number, customer_id, booking_id, status, tax_rate, discount, created_at, updated_at)
      values (?, 'INV-LEGACY-1', ?, ?, 'unpaid', 10, 0, ?, ?)
    `).run(invoiceId, customerId, bookingId, now, now);
    sqlite.prepare(`
      insert into invoice_items (id, invoice_id, service_id, name, quantity, unit_price, tax_rate, created_at)
      values (?, ?, ?, 'Consulting', 1, 10000, 10, ?)
    `).run(invoiceItemId, invoiceId, serviceId, now);
    sqlite.prepare(`
      insert into payments (id, invoice_id, amount, payment_method, payment_date, created_at)
      values (?, ?, 5000, 'cash', '2026-01-03', ?)
    `).run(paymentId, invoiceId, now);

    const before = sqlite.prepare('select * from invoices where id = ?').get(invoiceId);

    runMigrations(database, migrationsFolder);

    expect(sqlite.prepare('select * from customers where id = ?').get(customerId)).toMatchObject({
      first_name: 'Legacy',
      company: 'Legacy Co',
    });
    expect(sqlite.prepare('select * from services where id = ?').get(serviceId)).toMatchObject({
      name: 'Consulting',
      price: 10000,
    });
    expect(sqlite.prepare('select * from bookings where id = ?').get(bookingId)).toMatchObject({
      customer_id: customerId,
      service_id: serviceId,
    });
    expect(sqlite.prepare('select * from invoices where id = ?').get(invoiceId)).toEqual(before);
    expect(sqlite.prepare('select * from invoice_items where id = ?').get(invoiceItemId)).toMatchObject({
      invoice_id: invoiceId,
      service_id: serviceId,
    });
    expect(sqlite.prepare('select * from payments where id = ?').get(paymentId)).toMatchObject({
      invoice_id: invoiceId,
      amount: 5000,
    });

    for (const table of ['organisations', 'contacts', 'engagements']) {
      expect(sqlite.prepare("select name from sqlite_master where type = 'table' and name = ?").get(table)).toBeTruthy();
      expect(sqlite.prepare(`select count(*) as value from ${table}`).get()).toMatchObject({ value: 0 });
    }
    for (const indexName of [
      'organisation_status_idx',
      'organisation_name_idx',
      'contact_organisation_idx',
      'contact_email_idx',
      'contact_organisation_primary_idx',
      'contact_one_active_primary_per_org_idx',
      'engagement_organisation_idx',
      'engagement_status_idx',
      'engagement_start_date_idx',
    ]) {
      expect(sqlite.prepare("select name from sqlite_master where type = 'index' and name = ?").get(indexName)).toBeTruthy();
    }

    expect(sqlite.pragma('foreign_keys')).toEqual([{ foreign_keys: 1 }]);
    expect(sqlite.pragma('foreign_key_list(contacts)')).toEqual([
      expect.objectContaining({ table: 'organisations', from: 'organisation_id', on_delete: 'RESTRICT' }),
    ]);
    expect(sqlite.pragma('foreign_key_list(engagements)')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: 'contacts', from: 'primary_contact_id', on_delete: 'RESTRICT' }),
        expect.objectContaining({ table: 'organisations', from: 'organisation_id', on_delete: 'RESTRICT' }),
      ]),
    );

    expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);

    runMigrations(database, migrationsFolder);
    expect(sqlite.prepare('select count(*) as value from customers').get()).toMatchObject({ value: 1 });
  });
});
