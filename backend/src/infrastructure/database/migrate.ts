import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './connection';
import path from 'path';

console.log('Running Drizzle migrations on SQLite database...');

try {
  migrate(db, { migrationsFolder: path.resolve(__dirname, '../../../drizzle') });
  console.log('Migrations completed successfully!');
  process.exit(0);
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
