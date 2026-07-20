import fs from 'fs';
import os from 'os';
import path from 'path';
import { closeDatabase, openDatabase, sqlite } from '../backend/src/infrastructure/database/connection';
import { runMigrations } from '../backend/src/infrastructure/database/migrate';

const expectedIndexes = [
  'organisation_status_idx',
  'organisation_name_idx',
  'contact_organisation_idx',
  'contact_email_idx',
  'contact_organisation_primary_idx',
  'contact_one_active_primary_per_org_idx',
  'engagement_organisation_idx',
  'engagement_status_idx',
  'engagement_start_date_idx',
  'activity_organisation_occurred_idx',
  'activity_contact_idx',
  'activity_engagement_idx',
  'activity_type_idx',
  'activity_follow_up_idx',
  'activity_source_reference_idx',
  'legacy_org_mapping_organisation_idx',
  'legacy_customer_mapping_organisation_idx',
  'legacy_customer_mapping_contact_idx',
];

const expectedTables = [
  'settings',
  'customers',
  'services',
  'bookings',
  'invoices',
  'invoice_items',
  'payments',
  'custom_fields_definition',
  'custom_fields_values',
  'custom_objects_definition',
  'custom_objects_records',
  'custom_objects_values',
  'organisations',
  'contacts',
  'engagements',
  'activities',
  'legacy_organisation_mappings',
  'legacy_customer_crm_mappings',
];

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whitelabel-crm-db-smoke-'));
const databasePath = path.join(tempDir, 'smoke.sqlite');
const migrationsFolder = path.resolve(__dirname, '../backend/drizzle');

function requireOk(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

try {
  requireOk(fs.existsSync(migrationsFolder), `Missing migrations folder: ${migrationsFolder}`);
  const db = openDatabase(databasePath);

  runMigrations(db, migrationsFolder);

  const tableRows = sqlite.prepare("select name from sqlite_master where type = 'table'").all() as Array<{ name: string }>;
  const tableNames = new Set(tableRows.map((row) => row.name));
  for (const table of expectedTables) {
    requireOk(tableNames.has(table), `Expected migrated table '${table}' to exist`);
  }

  const indexRows = sqlite.prepare("select name from sqlite_master where type = 'index'").all() as Array<{ name: string }>;
  const indexNames = new Set(indexRows.map((row) => row.name));
  for (const indexName of expectedIndexes) {
    requireOk(indexNames.has(indexName), `Expected migrated index '${indexName}' to exist`);
  }

  runMigrations(db, migrationsFolder);

  const foreignKeys = sqlite.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
  requireOk(foreignKeys[0]?.foreign_keys === 1, `Expected foreign key enforcement to be enabled: ${JSON.stringify(foreignKeys)}`);

  const foreignKeyRows = sqlite.pragma('foreign_key_check') as unknown[];
  requireOk(foreignKeyRows.length === 0, `Foreign key check failed: ${JSON.stringify(foreignKeyRows)}`);

  const integrityRows = sqlite.pragma('integrity_check') as Array<{ integrity_check: string }>;
  requireOk(integrityRows.length === 1 && integrityRows[0].integrity_check === 'ok', `Integrity check failed: ${JSON.stringify(integrityRows)}`);

  console.log(`Migration smoke test passed using temporary database: ${databasePath}`);
} finally {
  closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
