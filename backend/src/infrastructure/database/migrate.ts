import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import {
  db,
  getSqliteConnection,
  type DatabaseInstance,
  type SqliteConnection,
} from './connection';
import { runWi3LegacyActivityBackfill } from './wi3LegacyActivityBackfill';
import { rebuildSearchIndex } from './WorkspaceRepository';
import { ensureOperationalSchema } from './operationalSchema';
import { ensureConnectedCommunicationsSchema } from './connectedCommunicationsSchema';
import { ensureCommunicationsHubSchema } from './communicationsHubSchema';
import { ensureReleaseHardeningSchema } from './releaseHardeningSchema';
import { ensureWi8Wi9Schema } from './wi8Wi9Schema';
import { ensureOwnershipBootstrapSchema } from './ownershipBootstrapSchema';
import { ensureAuditHardeningSchema } from './auditHardeningSchema';
import { ensureScheduledReportingSchema } from './scheduledReportingSchema';
import { ensureWi10PlatformSchema } from './wi10PlatformSchema';
import { ensureWi11ExtensionSchema } from './wi11ExtensionSchema';
import { ensureWi12OnboardingSchema } from './wi12OnboardingSchema';

function hasCoreCrmTables(connection:SqliteConnection):boolean{
  const count=(connection.prepare(`SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('organisations','engagements','tasks','settings')`).get() as {count:number}).count;
  return count===4;
}

export function runMigrations(
  dbInstance: DatabaseInstance,
  migrationsFolder?: string,
  sqliteConnection: SqliteConnection = getSqliteConnection(),
) {
  const folder = migrationsFolder || path.resolve(__dirname, '../../../drizzle');
  migrate(dbInstance, { migrationsFolder: folder });
  ensureOperationalSchema(sqliteConnection);
  ensureConnectedCommunicationsSchema(sqliteConnection);
  ensureCommunicationsHubSchema(sqliteConnection);
  ensureReleaseHardeningSchema(sqliteConnection);
  if(hasCoreCrmTables(sqliteConnection)){
    ensureWi8Wi9Schema(sqliteConnection);
    ensureAuditHardeningSchema(sqliteConnection);
    ensureScheduledReportingSchema(sqliteConnection);
    ensureWi10PlatformSchema(sqliteConnection);
    ensureWi11ExtensionSchema(sqliteConnection);
    ensureWi12OnboardingSchema(sqliteConnection);
    ensureOwnershipBootstrapSchema(sqliteConnection);
  }
  runWi3LegacyActivityBackfill(sqliteConnection);
  rebuildSearchIndex(sqliteConnection);
}

if (require.main === module) {
  console.log('Running Drizzle migrations on SQLite database CLI...');
  try {
    runMigrations(db);
    console.log('Migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}
