import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './connection';
import path from 'path';

export function runMigrations(dbInstance: any, migrationsFolder?: string) {
  const folder = migrationsFolder || path.resolve(__dirname, '../../../drizzle');
  migrate(dbInstance, { migrationsFolder: folder });
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
