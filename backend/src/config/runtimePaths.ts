import path from 'path';
import fs from 'fs';

export interface RuntimePaths {
  dataDirectory: string;
  databasePath: string;
  internalBackupDirectory: string;
  temporaryDirectory: string;
  logDirectory: string;
}

// Development default fallback directories (local to backend folder)
const defaultDataDir = path.resolve(__dirname, '../../data');

let activePaths: RuntimePaths = {
  dataDirectory: defaultDataDir,
  databasePath: path.join(defaultDataDir, 'crm.db'),
  internalBackupDirectory: path.join(defaultDataDir, 'backups'),
  temporaryDirectory: path.join(defaultDataDir, 'temp'),
  logDirectory: path.join(defaultDataDir, 'logs')
};

export function configureRuntimePaths(paths: Partial<RuntimePaths>): void {
  activePaths = {
    ...activePaths,
    ...paths
  };

  // Create required directories safely before use
  const dirs = [
    activePaths.dataDirectory,
    activePaths.internalBackupDirectory,
    activePaths.temporaryDirectory,
    activePaths.logDirectory
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function getRuntimePaths(): RuntimePaths {
  return activePaths;
}
// Run once with defaults to ensure development directories exist immediately
configureRuntimePaths({});
