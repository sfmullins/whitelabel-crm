import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';
import { getRuntimePaths } from '../../config/runtimePaths';

let activeSqlite: Database.Database | null = null;
let activeDb: BetterSQLite3Database<typeof schema> | null = null;

// Proxy wrapper for Drizzle database instance (strongly-typed)
export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(target, prop, receiver) {
    if (!activeDb) {
      // Auto-open with default configured paths if not already opened
      const paths = getRuntimePaths();
      openDatabase(paths.databasePath);
    }
    return Reflect.get(activeDb!, prop, receiver);
  }
});

// Proxy wrapper for raw SQLite connection (cast to any for declaration generator)
export const sqlite: any = new Proxy({} as any, {
  get(target, prop, receiver) {
    if (!activeSqlite) {
      const paths = getRuntimePaths();
      openDatabase(paths.databasePath);
    }
    return Reflect.get(activeSqlite!, prop, receiver);
  }
});

export type DatabaseInstance = BetterSQLite3Database<typeof schema>;
export type SqliteConnection = Database.Database;


export function getSqliteConnection(): SqliteConnection {
  if (!activeSqlite) {
    const paths = getRuntimePaths();
    openDatabase(paths.databasePath);
  }
  return activeSqlite!;
}

export function openDatabase(databasePath: string): DatabaseInstance {
  // 1. Ensure target directory exists
  const dir = path.dirname(databasePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 2. Cleanly close any existing database connection
  closeDatabase();

  // 3. Open new SQLite connection
  const conn = new Database(databasePath);

  // 4. Enable WAL mode and other target pragmas
  conn.pragma('foreign_keys = ON');
  conn.pragma('journal_mode = WAL');
  conn.pragma('synchronous = NORMAL');
  conn.pragma('busy_timeout = 5000');

  // 5. Wrap in Drizzle ORM
  const drizzleDb = drizzle(conn, { schema });

  activeSqlite = conn;
  activeDb = drizzleDb;

  return drizzleDb;
}

export function getDatabase(): DatabaseInstance {
  if (!activeDb) {
    const paths = getRuntimePaths();
    openDatabase(paths.databasePath);
  }
  return activeDb!;
}

export function closeDatabase(): void {
  if (activeSqlite) {
    try {
      activeSqlite.close();
    } catch (err) {
      console.error('Error closing SQLite database connection:', err);
    }
    activeSqlite = null;
    activeDb = null;
  }
}
