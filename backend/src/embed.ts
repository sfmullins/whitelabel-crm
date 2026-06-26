import { startServer, StartServerOptions, RunningServer } from './server';
import { configureRuntimePaths, getRuntimePaths, RuntimePaths } from './config/runtimePaths';
import { openDatabase, closeDatabase, getDatabase } from './infrastructure/database/connection';
import { runMigrations } from './infrastructure/database/migrate';

export {
  startServer,
  StartServerOptions,
  RunningServer,
  configureRuntimePaths,
  getRuntimePaths,
  RuntimePaths,
  openDatabase,
  closeDatabase,
  getDatabase,
  runMigrations
};
