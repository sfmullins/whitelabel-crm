import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { sqlite } from '../database/connection';

const dbFolder = path.resolve(__dirname, '../../../data');
const backupsFolder = path.join(dbFolder, 'backups');

if (!fs.existsSync(backupsFolder)) {
  fs.mkdirSync(backupsFolder, { recursive: true });
}

export interface BackupInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export class BackupManager {
  static getBackupsFolder(): string {
    return backupsFolder;
  }

  static async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.db`;
    const targetPath = path.join(backupsFolder, filename);

    // better-sqlite3 backup API is asynchronous and returns a promise
    await sqlite.backup(targetPath);
    return filename;
  }

  static listBackups(): BackupInfo[] {
    if (!fs.existsSync(backupsFolder)) return [];
    
    const files = fs.readdirSync(backupsFolder);
    return files
      .filter(f => f.startsWith('backup-') && f.endsWith('.db'))
      .map(f => {
        const filePath = path.join(backupsFolder, f);
        const stats = fs.statSync(filePath);
        return {
          filename: f,
          sizeBytes: stats.size,
          createdAt: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  static async restoreBackup(filename: string): Promise<void> {
    const sourcePath = path.join(backupsFolder, filename);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Backup file "${filename}" does not exist.`);
    }

    // 1. Verify backup file integrity before restoring
    let testDb;
    try {
      testDb = new Database(sourcePath);
      const result = testDb.pragma('integrity_check');
      if (result !== 'ok') {
        throw new Error(`Database integrity check failed: ${result}`);
      }
      // Check for existence of a core table to verify schema
      const tableCheck = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get();
      if (!tableCheck) {
        throw new Error('Missing core "settings" table inside backup database.');
      }
    } catch (err: any) {
      throw new Error(`Corruption check failed: ${err.message}`);
    } finally {
      if (testDb) testDb.close();
    }

    // 2. Perform online restore from backup file to active DB connection
    const backupDb = new Database(sourcePath);
    // Overwrite the memory of the active db in better-sqlite3 using its backup API:
    // sqlite.backup(...) can backup from sqlite to a file, or if called on backupDb, backupDb.backup(mainDbPath) will copy it back!
    const dbFolderMain = path.resolve(__dirname, '../../../data');
    const mainDbPath = path.join(dbFolderMain, 'crm.db');
    
    await backupDb.backup(mainDbPath);
    backupDb.close();
  }

  static deleteBackup(filename: string): void {
    const targetPath = path.join(backupsFolder, filename);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
  }
}
