import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BackupManager, BackupManifest } from '../infrastructure/backup/BackupManager';
import { configureRuntimePaths, getRuntimePaths } from '../config/runtimePaths';
import { openDatabase, closeDatabase, db, sqlite } from '../infrastructure/database/connection';
import { settings } from '../infrastructure/database/schema';
import { runMigrations } from '../infrastructure/database/migrate';

describe('Backup and Recovery Suite', () => {
  const testDataDir = path.resolve(__dirname, '../../data-test-backup');
  const encryptionKey = crypto.randomBytes(32);

  beforeEach(() => {
    // 1. Setup isolated test paths
    configureRuntimePaths({
      dataDirectory: testDataDir,
      databasePath: path.join(testDataDir, 'crm.db'),
      internalBackupDirectory: path.join(testDataDir, 'backups'),
      temporaryDirectory: path.join(testDataDir, 'temp'),
      logDirectory: path.join(testDataDir, 'logs')
    });

    // 2. Open DB and run migrations
    const conn = openDatabase(getRuntimePaths().databasePath);
    runMigrations(conn);

    // Seed dummy settings row
    const now = new Date().toISOString();
    conn.insert(settings).values({
      id: 'default',
      businessName: 'Test CRM Corp',
      logoUrl: '',
      primaryColor: '#6366f1',
      secondaryColor: '#3b82f6',
      accentColor: '#10b981',
      address: '123 Test Street',
      phone: '555-555-5555',
      email: 'test@crm.com',
      website: 'https://test.com',
      invoiceFooter: 'Thank you!',
      defaultTaxRate: 10.0,
      currency: 'USD',
      timezone: 'UTC',
      dateFormat: 'YYYY-MM-DD',
      createdAt: now,
      updatedAt: now
    }).run();
  });

  afterEach(() => {
    closeDatabase();
    // Cleanup files
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  it('should generate a verified snapshot with manifest metadata', async () => {
    const paths = getRuntimePaths();
    
    // Create backup
    const baseName = await BackupManager.createBackup();
    
    const dbBackupFile = path.join(paths.internalBackupDirectory, `${baseName}.db`);
    const manifestFile = path.join(paths.internalBackupDirectory, `${baseName}.manifest.json`);

    expect(fs.existsSync(dbBackupFile)).toBe(true);
    expect(fs.existsSync(manifestFile)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as BackupManifest;
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.encrypted).toBe(false);
    expect(manifest.sha256).toBe(BackupManager.calculateSHA256(dbBackupFile));
  });

  it('should encrypt and decrypt backup files using AES-256-GCM', async () => {
    const paths = getRuntimePaths();
    
    // 1. Create encrypted backup
    const baseName = await BackupManager.createBackup({ encryptionKey });
    
    const encryptedFile = path.join(paths.internalBackupDirectory, `${baseName}.crmbackup`);
    expect(fs.existsSync(encryptedFile)).toBe(true);

    // 2. Decrypt to temporary location
    const decryptedDbPath = path.join(paths.temporaryDirectory, 'decrypted.db');
    const manifest = BackupManager.decryptBackupFile(encryptedFile, encryptionKey, decryptedDbPath);

    expect(manifest.encrypted).toBe(true);
    expect(fs.existsSync(decryptedDbPath)).toBe(true);

    // 3. Verify decrypted DB integrity
    expect(() => BackupManager.verifyIntegrity(decryptedDbPath)).not.toThrow();
  });

  it('should prune old backups correctly according to GFS schedule', () => {
    const paths = getRuntimePaths();
    
    // Write 3 mock backup files dated daily
    const mockBackups = [
      { filename: 'mock-1.db', date: new Date('2026-06-20T12:00:00.000Z') },
      { filename: 'mock-2.db', date: new Date('2026-06-21T12:00:00.000Z') },
      { filename: 'mock-3.db', date: new Date('2026-06-22T12:00:00.000Z') } // Latest
    ];

    for (const b of mockBackups) {
      const dbPath = path.join(paths.internalBackupDirectory, b.filename);
      const manifestPath = path.join(paths.internalBackupDirectory, `${b.filename.replace('.db', '')}.manifest.json`);
      fs.writeFileSync(dbPath, 'dummy-data');
      
      const manifest: BackupManifest = {
        formatVersion: 1,
        applicationVersion: '1.0.0',
        schemaVersion: 1,
        createdAt: b.date.toISOString(),
        deviceId: 'device',
        databaseFile: b.filename,
        databaseSizeBytes: 10,
        sha256: 'sha',
        encrypted: false
      };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      // Mutate mtime of file to simulate age
      fs.utimesSync(dbPath, b.date, b.date);
    }

    // Prune with daily count of 1 (forces deletion of older daily snapshots)
    BackupManager.pruneRetention({ daily: 1, weekly: 1, monthly: 1 });

    const remaining = fs.readdirSync(paths.internalBackupDirectory);
    // Should keep latest ('mock-3.db' & manifest)
    expect(remaining.includes('mock-3.db')).toBe(true);
    expect(remaining.includes('mock-1.db')).toBe(false);
  });
});
