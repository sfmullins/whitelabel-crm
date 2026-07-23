import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { sqlite, openDatabase, closeDatabase } from '../database/connection';
import { getRuntimePaths } from '../../config/runtimePaths';
import { uploadToS3, S3BackupConfiguration } from './S3Client';
import { resolveBackupManifestPath, resolveBackupPath } from './BackupPathPolicy';

export interface BackupInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  checksum: string;
}

export interface BackupManifest {
  formatVersion: number;
  applicationVersion: string;
  schemaVersion: number;
  createdAt: string;
  deviceId: string;
  databaseFile: string;
  databaseSizeBytes: number;
  sha256: string;
  encrypted: boolean;
}

export interface BackupSettings {
  internalBackupEnabled: boolean;
  externalBackupEnabled: boolean;
  externalBackupDirectory?: string;
  automaticBackupEnabled: boolean;
  automaticBackupFrequency: 'daily' | 'weekly';
  backupOnApplicationExit: boolean;
  dailyRetentionCount: number;
  weeklyRetentionCount: number;
  monthlyRetentionCount: number;
  remoteBackupEnabled: boolean;
  remoteProvider?: 's3';
}

export class BackupManager {
  
  // Calculate SHA-256 of file
  static calculateSHA256(filePath: string): string {
    const hash = crypto.createHash('sha256');
    const data = fs.readFileSync(filePath);
    hash.update(data);
    return hash.digest('hex');
  }

  // Pure binary AES-256-GCM encryption archive generator
  static encryptBackupFile(dbPath: string, manifest: BackupManifest, key: Buffer): Buffer {
    const dbData = fs.readFileSync(dbPath);
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    
    const ciphertext = Buffer.concat([cipher.update(dbData), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    const manifestStr = JSON.stringify(manifest);
    const manifestBuf = Buffer.from(manifestStr, 'utf8');
    
    const magic = Buffer.from('CRMB', 'utf8'); // 4 bytes
    const version = Buffer.alloc(2);
    version.writeUInt16BE(1, 0); // 2 bytes
    
    const manifestLen = Buffer.alloc(4);
    manifestLen.writeUInt32BE(manifestBuf.length, 0); // 4 bytes
    
    return Buffer.concat([
      magic,
      version,
      nonce,
      authTag,
      manifestLen,
      manifestBuf,
      ciphertext
    ]);
  }

  // Pure binary AES-256-GCM decryption archive unpacker
  static decryptBackupFile(archivePath: string, key: Buffer, destDbPath: string): BackupManifest {
    const data = fs.readFileSync(archivePath);
    
    const magic = data.subarray(0, 4).toString('utf8');
    if (magic !== 'CRMB') {
      throw new Error('Invalid backup archive format (missing CRMB header)');
    }
    
    const version = data.readUInt16BE(4);
    if (version !== 1) {
      throw new Error(`Unsupported backup archive version: ${version}`);
    }
    
    const nonce = data.subarray(6, 18);
    const authTag = data.subarray(18, 34);
    
    const manifestLen = data.readUInt32BE(34);
    const manifestStr = data.subarray(38, 38 + manifestLen).toString('utf8');
    const manifest = JSON.parse(manifestStr) as BackupManifest;
    
    const ciphertext = data.subarray(38 + manifestLen);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    
    const dir = path.dirname(destDbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(destDbPath, decrypted);
    return manifest;
  }

  // Run full integrity verification on an isolated connection
  static verifyIntegrity(dbPath: string): void {
    let testDb;
    try {
      testDb = new Database(dbPath);
      const result = testDb.pragma('integrity_check', { simple: true });
      if (result !== 'ok') {
        throw new Error(`Database integrity check failed: ${result}`);
      }
      
      // Verify a core table is present
      const tableCheck = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get();
      if (!tableCheck) {
        throw new Error('Missing core "settings" table inside backup database.');
      }
    } finally {
      if (testDb) testDb.close();
    }
  }

  // Create localized verified snapshot
  static async createBackup(options?: {
    externalDirectory?: string;
    encryptionKey?: Buffer;
    s3Config?: S3BackupConfiguration;
    isPreMigration?: boolean;
  }): Promise<string> {
    const paths = getRuntimePaths();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const prefix = options?.isPreMigration ? 'pre-migration-' : 'crm-backup-';
    
    const baseName = `${prefix}${timestamp}`;
    const localDbBackupPath = path.join(paths.temporaryDirectory, `${baseName}.db`);
    
    // 1. Create atomic SQLite snapshot using connection backup API
    await sqlite.backup(localDbBackupPath);
    
    try {
      // 2. Close connection on temp file and verify integrity
      this.verifyIntegrity(localDbBackupPath);
      
      const checksum = this.calculateSHA256(localDbBackupPath);
      const stats = fs.statSync(localDbBackupPath);
      
      // 3. Build manifest metadata
      const manifest: BackupManifest = {
        formatVersion: 1,
        applicationVersion: '1.0.0', // Standard packaging reference
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        deviceId: 'local-desktop-instance',
        databaseFile: `${baseName}.db`,
        databaseSizeBytes: stats.size,
        sha256: checksum,
        encrypted: !!options?.encryptionKey
      };

      // 4. Save to Internal Backups Folder
      const finalDbPath = path.join(paths.internalBackupDirectory, `${baseName}.db`);
      const finalManifestPath = path.join(paths.internalBackupDirectory, `${baseName}.manifest.json`);
      
      if (options?.encryptionKey) {
        // Encrypted Single Archive flow
        const encryptedBytes = this.encryptBackupFile(localDbBackupPath, manifest, options.encryptionKey);
        const finalEncryptedPath = path.join(paths.internalBackupDirectory, `${baseName}.crmbackup`);
        fs.writeFileSync(finalEncryptedPath, encryptedBytes);
      } else {
        // Unencrypted flow
        fs.copyFileSync(localDbBackupPath, finalDbPath);
        fs.writeFileSync(finalManifestPath, JSON.stringify(manifest, null, 2));
      }

      // 5. External Drive Destination flow
      if (options?.externalDirectory && fs.existsSync(options.externalDirectory)) {
        const extDir = options.externalDirectory;
        
        // Capacity limit validation (bavail * bsize)
        try {
          const statsFs = fs.statfsSync(extDir);
          const freeSpace = statsFs.bavail * statsFs.bsize;
          if (freeSpace < stats.size * 1.1) {
            throw new Error('Insufficient disk capacity on external drive.');
          }
        } catch (fsErr) {
          // Fallback if statfs is unsupported on this platform environment
          console.warn('Statfs check skipped:', fsErr);
        }

        const extDbPath = path.join(extDir, `${baseName}.db`);
        const extEncPath = path.join(extDir, `${baseName}.crmbackup`);
        const extManifestPath = path.join(extDir, `${baseName}.manifest.json`);

        if (options?.encryptionKey) {
          const encryptedBytes = this.encryptBackupFile(localDbBackupPath, manifest, options.encryptionKey);
          
          // Write safely using .partial pattern
          const partialPath = `${extEncPath}.partial`;
          fs.writeFileSync(partialPath, encryptedBytes);
          fs.renameSync(partialPath, extEncPath);
        } else {
          const partialDbPath = `${extDbPath}.partial`;
          fs.copyFileSync(localDbBackupPath, partialDbPath);
          fs.renameSync(partialDbPath, extDbPath);
          
          const partialManifestPath = `${extManifestPath}.partial`;
          fs.writeFileSync(partialManifestPath, JSON.stringify(manifest, null, 2));
          fs.renameSync(partialManifestPath, extManifestPath);
        }
      }

      // 6. Remote S3 Upload flow (Encrypted recovery only)
      if (options?.s3Config && options?.encryptionKey) {
        const encryptedBytes = this.encryptBackupFile(localDbBackupPath, manifest, options.encryptionKey);
        const remoteKey = `${baseName}.crmbackup`;
        await uploadToS3(options.s3Config, remoteKey, encryptedBytes);
      }

      return baseName;
    } finally {
      // 7. Cleanup temp files safely
      if (fs.existsSync(localDbBackupPath)) {
        fs.unlinkSync(localDbBackupPath);
      }
    }
  }

  // List all valid backups in internal storage directory
  static listBackups(): BackupInfo[] {
    const paths = getRuntimePaths();
    if (!fs.existsSync(paths.internalBackupDirectory)) return [];
    
    const files = fs.readdirSync(paths.internalBackupDirectory);
    const backups: BackupInfo[] = [];

    for (const f of files) {
      if (f.endsWith('.db') && !f.startsWith('pre-migration-')) {
        const filePath = path.join(paths.internalBackupDirectory, f);
        const baseName = f.substring(0, f.lastIndexOf('.'));
        const manifestPath = path.join(paths.internalBackupDirectory, `${baseName}.manifest.json`);
        
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BackupManifest;
          const stats = fs.statSync(filePath);
          backups.push({
            filename: f,
            sizeBytes: stats.size,
            createdAt: stats.mtime.toISOString(),
            checksum: manifest.sha256
          });
        }
      } else if (f.endsWith('.crmbackup')) {
        const filePath = path.join(paths.internalBackupDirectory, f);
        const stats = fs.statSync(filePath);
        backups.push({
          filename: f,
          sizeBytes: stats.size,
          createdAt: stats.mtime.toISOString(),
          checksum: 'encrypted-payload'
        });
      }
    }

    return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // Restore active database state from target file
  static async restoreBackup(filename: string, encryptionKey?: Buffer): Promise<void> {
    const paths = getRuntimePaths();
    const sourcePath = resolveBackupPath(paths.internalBackupDirectory, filename);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Backup file "${filename}" does not exist.`);
    }

    const tempRestoreDbPath = path.join(paths.temporaryDirectory, 'restore-temp.db');
    
    try {
      // 1. Unpack or copy database snapshot to temporary location
      if (filename.endsWith('.crmbackup')) {
        if (!encryptionKey) {
          throw new Error('Encryption key is required to restore an encrypted backup archive.');
        }
        this.decryptBackupFile(sourcePath, encryptionKey, tempRestoreDbPath);
      } else {
        fs.copyFileSync(sourcePath, tempRestoreDbPath);
      }

      // 2. Perform isolated validation check on temporary copy
      this.verifyIntegrity(tempRestoreDbPath);

      // 3. Close active SQLite connection pool safely
      closeDatabase();

      // 4. Create fallback safety backup of the active database
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safetyBackupPath = path.join(paths.internalBackupDirectory, `pre-restore-safety-${timestamp}.db`);
      if (fs.existsSync(paths.databasePath)) {
        fs.copyFileSync(paths.databasePath, safetyBackupPath);
      }

      try {
        // 5. Replace database file atomically
        fs.copyFileSync(tempRestoreDbPath, paths.databasePath);
      } catch (copyErr) {
        // Rollback safety recovery if copy fails midway
        if (fs.existsSync(safetyBackupPath)) {
          fs.copyFileSync(safetyBackupPath, paths.databasePath);
        }
        throw copyErr;
      }
    } finally {
      // 6. Cleanup temp restore copy
      if (fs.existsSync(tempRestoreDbPath)) {
        fs.unlinkSync(tempRestoreDbPath);
      }
      
      // 7. Restart active connection pool
      openDatabase(paths.databasePath);
    }
  }

  // GFS (Grandfather-Father-Son) Pruning Schedule implementation
  static pruneRetention(options: { daily: number; weekly: number; monthly: number }): void {
    const paths = getRuntimePaths();
    const backups = this.listBackups();
    if (backups.length <= 1) return;

    // Map each item to parse dates
    const parsed = backups.map(b => ({
      filename: b.filename,
      date: new Date(b.createdAt)
    }));

    const keep = new Set<string>();
    // Always retain the latest backup
    keep.add(parsed[0].filename);

    const dailySet = new Map<string, string>();
    const weeklySet = new Map<string, string>();
    const monthlySet = new Map<string, string>();

    for (const item of parsed) {
      const dKey = item.date.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // ISO Week Key calculation
      const tempDate = new Date(item.date.getTime());
      tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7);
      const wYear = tempDate.getFullYear();
      const wWeek = Math.floor((tempDate.getTime() - new Date(wYear, 0, 4).getTime()) / 86400000 / 7) + 1;
      const wKey = `${wYear}-W${wWeek}`;
      
      const mKey = `${item.date.getFullYear()}-${String(item.date.getMonth() + 1).padStart(2, '0')}`;

      if (dailySet.size < options.daily && !dailySet.has(dKey)) {
        dailySet.set(dKey, item.filename);
        keep.add(item.filename);
      }
      if (weeklySet.size < options.weekly && !weeklySet.has(wKey)) {
        weeklySet.set(wKey, item.filename);
        keep.add(item.filename);
      }
      if (monthlySet.size < options.monthly && !monthlySet.has(mKey)) {
        monthlySet.set(mKey, item.filename);
        keep.add(item.filename);
      }
    }

    // Delete pruned files
    for (const b of backups) {
      if (!keep.has(b.filename)) {
        const filePath = path.join(paths.internalBackupDirectory, b.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`[BackupManager] Pruned backup: ${b.filename}`);
        }
        // Also prune matching JSON manifest if exists
        const baseName = b.filename.substring(0, b.filename.lastIndexOf('.'));
        const manifestPath = path.join(paths.internalBackupDirectory, `${baseName}.manifest.json`);
        if (fs.existsSync(manifestPath)) {
          fs.unlinkSync(manifestPath);
        }
      }
    }
  }

  static deleteBackup(filename: string): void {
    const paths = getRuntimePaths();
    const targetPath = resolveBackupPath(paths.internalBackupDirectory, filename);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    const manifestPath = resolveBackupManifestPath(paths.internalBackupDirectory, filename);
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath);
    }
  }
}
