import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, openDatabase, sqlite } from '../backend/src/infrastructure/database/connection';
import { configureRuntimePaths } from '../backend/src/config/runtimePaths';
import { runMigrations } from '../backend/src/infrastructure/database/migrate';
import { runSeed } from '../backend/src/infrastructure/database/seed';
import { WorkspaceRepository, assertFts5Available } from '../backend/src/infrastructure/database/WorkspaceRepository';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'whitelabel-crm-wi4-'));
const databasePath = path.join(temp, 'wi4.sqlite');
configureRuntimePaths({ dataDirectory: temp, databasePath, internalBackupDirectory: path.join(temp, 'backups'), temporaryDirectory: path.join(temp, 'tmp'), logDirectory: path.join(temp, 'logs') });
try {
  const db = openDatabase(databasePath);
  runMigrations(db, path.resolve('backend/drizzle'), sqlite);
  await runSeed();
  assertFts5Available(sqlite);
  const repository = new WorkspaceRepository(sqlite);
  const acme = await repository.search({ q: 'Acme', includeArchived: false, limit: 10, offset: 0 });
  if (acme.items[0]?.title !== 'Acme Ltd') throw new Error('Acme Ltd was not the leading search result');
  const followups = await repository.listFollowUps({ bucket: 'open', limit: 20, offset: 0 });
  if (followups.items.length < 3) throw new Error('Expected Acme follow-up fixtures');
  const timeline = await repository.listTimeline('20000000-0000-4000-8000-000000000001', { limit: 100, offset: 0 });
  for (const type of ['activity','engagement','booking','invoice','payment']) if (!timeline.items.some((item) => item.eventType === type)) throw new Error(`Missing ${type} timeline fixture`);
  const integrity = sqlite.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') throw new Error(`SQLite integrity check failed: ${integrity}`);
  console.log('WI4 seed/search/follow-up/timeline smoke passed.');
} finally {
  closeDatabase();
  fs.rmSync(temp, { recursive: true, force: true });
}
