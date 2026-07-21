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

export function runMigrations(
  dbInstance: DatabaseInstance,
  migrationsFolder?: string,
  sqliteConnection: SqliteConnection = getSqliteConnection(),
) {
  const folder = migrationsFolder || path.resolve(__dirname, '../../../drizzle');
  migrate(dbInstance, { migrationsFolder: folder });
  ensureOperationalSchema(sqliteConnection);
  runWi3LegacyActivityBackfill(sqliteConnection);
  rebuildSearchIndex(sqliteConnection);
}

// Execute migration automatically when run as a standalone CLI script
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
