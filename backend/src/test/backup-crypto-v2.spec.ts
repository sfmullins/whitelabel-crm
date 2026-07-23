import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {BackupManager,type BackupManifest} from '../infrastructure/backup/BackupManager';

describe('backup archive cryptography v2',()=>{
  let fixture='';let databasePath='';let archivePath='';let restoredPath='';
  beforeEach(()=>{fixture=fs.mkdtempSync(path.join(os.tmpdir(),'crm-backup-crypto-'));databasePath=path.join(fixture,'source.db');archivePath=path.join(fixture,'archive.crmbackup');restoredPath=path.join(fixture,'restored.db');const database=new Database(databasePath);database.exec('CREATE TABLE settings(id TEXT PRIMARY KEY); INSERT INTO settings(id) VALUES ('default');');database.close();});
  afterEach(()=>fs.rmSync(fixture,{recursive:true,force:true}));
  const manifest=(overrides:Partial<BackupManifest>={}):BackupManifest=>({formatVersion:1,applicationVersion:'1.0.0',schemaVersion:1,createdAt:new Date().toISOString(),deviceId:'test-device',databaseFile:'source.db',databaseSizeBytes:fs.statSync(databasePath).size,sha256:BackupManager.calculateSHA256(databasePath),encrypted:true,...overrides});

  it('uses a unique salted PBKDF2 work factor and authenticates the manifest',()=>{
    const password='correct horse battery staple';const derived=BackupManager.createPasswordKdf(password);const metadata=manifest({kdf:derived.kdf});fs.writeFileSync(archivePath,BackupManager.encryptBackupFile(databasePath,metadata,derived.key));
    const stored=BackupManager.readEncryptedBackupManifest(archivePath);expect(stored.kdf?.algorithm).toBe('pbkdf2-sha256');expect(stored.kdf?.iterations).toBe(600_000);expect(stored.kdf?.saltHex).toMatch(/^[0-9a-f]{32}$/);
    const restoreKey=BackupManager.derivePasswordKey(password,stored.kdf!);expect(BackupManager.decryptBackupFile(archivePath,restoreKey,restoredPath).databaseFile).toBe('source.db');expect(()=>BackupManager.verifyIntegrity(restoredPath)).not.toThrow();
    const wrongKey=BackupManager.derivePasswordKey('wrong password with enough length',stored.kdf!);expect(()=>BackupManager.decryptBackupFile(archivePath,wrongKey,path.join(fixture,'wrong.db'))).toThrow();
    const tampered=fs.readFileSync(archivePath);const manifestStart=38;const deviceOffset=tampered.indexOf(Buffer.from('test-device'),manifestStart);expect(deviceOffset).toBeGreaterThan(manifestStart);tampered[deviceOffset]='X'.charCodeAt(0);fs.writeFileSync(archivePath,tampered);expect(()=>BackupManager.decryptBackupFile(archivePath,restoreKey,path.join(fixture,'tampered.db'))).toThrow();
  });

  it('continues to decrypt legacy version 1 archives',()=>{
    const key=crypto.randomBytes(32);const metadata=manifest();const manifestBuffer=Buffer.from(JSON.stringify(metadata));const nonce=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);const ciphertext=Buffer.concat([cipher.update(fs.readFileSync(databasePath)),cipher.final()]);const version=Buffer.alloc(2);version.writeUInt16BE(1);const length=Buffer.alloc(4);length.writeUInt32BE(manifestBuffer.length);fs.writeFileSync(archivePath,Buffer.concat([Buffer.from('CRMB'),version,nonce,cipher.getAuthTag(),length,manifestBuffer,ciphertext]));
    expect(BackupManager.decryptBackupFile(archivePath,key,restoredPath).databaseFile).toBe('source.db');expect(()=>BackupManager.verifyIntegrity(restoredPath)).not.toThrow();
  });
});
