from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def read(path): return (ROOT/path).read_text(encoding='utf-8')
def write(path,content): (ROOT/path).write_text(content,encoding='utf-8')
def replace_once(path,old,new):
    content=read(path)
    if content.count(old)!=1: raise RuntimeError(f'Expected one match in {path}, found {content.count(old)}')
    write(path,content.replace(old,new,1))

replace_once(
    'backend/src/infrastructure/backup/BackupManager.ts',
    """export interface BackupManifest {
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
""",
    """export interface BackupKdfMetadata {
  algorithm: 'pbkdf2-sha256';
  saltHex: string;
  iterations: number;
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
  kdf?: BackupKdfMetadata;
}

const PBKDF2_SHA256_ITERATIONS=600_000;
const MAX_ARCHIVE_MANIFEST_BYTES=1_000_000;
""",
)

replace_once(
    'backend/src/infrastructure/backup/BackupManager.ts',
    """  // Pure binary AES-256-GCM encryption archive generator
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
""",
    """  static createPasswordKdf(password: string): { key: Buffer; kdf: BackupKdfMetadata } {
    if (password.length < 12 || password.length > 1024) throw new Error('Backup encryption password must contain between 12 and 1024 characters.');
    const kdf: BackupKdfMetadata = { algorithm: 'pbkdf2-sha256', saltHex: crypto.randomBytes(16).toString('hex'), iterations: PBKDF2_SHA256_ITERATIONS };
    return { key: this.derivePasswordKey(password, kdf), kdf };
  }

  static derivePasswordKey(password: string, kdf: BackupKdfMetadata): Buffer {
    if (kdf.algorithm !== 'pbkdf2-sha256') throw new Error(`Unsupported backup key derivation algorithm: ${String(kdf.algorithm)}`);
    if (!/^[0-9a-f]{32}$/i.test(kdf.saltHex)) throw new Error('Backup key derivation salt is invalid.');
    if (!Number.isInteger(kdf.iterations) || kdf.iterations < 100_000 || kdf.iterations > 2_000_000) throw new Error('Backup key derivation work factor is invalid.');
    return crypto.pbkdf2Sync(password, Buffer.from(kdf.saltHex, 'hex'), kdf.iterations, 32, 'sha256');
  }

  static deriveLegacyPasswordKey(password: string): Buffer {
    return crypto.createHash('sha256').update(password, 'utf8').digest();
  }

  private static parseEncryptedArchive(data: Buffer): { version: number; nonce: Buffer; authTag: Buffer; manifestBuffer: Buffer; manifest: BackupManifest; ciphertext: Buffer } {
    if (data.length < 38) throw new Error('Invalid backup archive format (truncated header)');
    const magic = data.subarray(0, 4).toString('utf8');
    if (magic !== 'CRMB') throw new Error('Invalid backup archive format (missing CRMB header)');
    const version = data.readUInt16BE(4);
    if (version !== 1 && version !== 2) throw new Error(`Unsupported backup archive version: ${version}`);
    const manifestLength = data.readUInt32BE(34);
    if (manifestLength < 2 || manifestLength > MAX_ARCHIVE_MANIFEST_BYTES || 38 + manifestLength >= data.length) throw new Error('Invalid backup archive manifest length');
    const manifestBuffer = data.subarray(38, 38 + manifestLength);
    let manifest: BackupManifest;
    try { manifest = JSON.parse(manifestBuffer.toString('utf8')) as BackupManifest; } catch { throw new Error('Invalid backup archive manifest'); }
    return { version, nonce: data.subarray(6, 18), authTag: data.subarray(18, 34), manifestBuffer, manifest, ciphertext: data.subarray(38 + manifestLength) };
  }

  static readEncryptedBackupManifest(archivePath: string): BackupManifest {
    return this.parseEncryptedArchive(fs.readFileSync(archivePath)).manifest;
  }

  // Archive version 2 authenticates the plaintext manifest as AES-GCM additional authenticated data.
  static encryptBackupFile(dbPath: string, manifest: BackupManifest, key: Buffer): Buffer {
    if (key.length !== 32) throw new Error('Backup encryption key must contain exactly 32 bytes.');
    const dbData = fs.readFileSync(dbPath);
    const manifestBuffer = Buffer.from(JSON.stringify(manifest), 'utf8');
    if (manifestBuffer.length > MAX_ARCHIVE_MANIFEST_BYTES) throw new Error('Backup archive manifest is too large.');
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(manifestBuffer);
    const ciphertext = Buffer.concat([cipher.update(dbData), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const version = Buffer.alloc(2); version.writeUInt16BE(2, 0);
    const manifestLength = Buffer.alloc(4); manifestLength.writeUInt32BE(manifestBuffer.length, 0);
    return Buffer.concat([Buffer.from('CRMB', 'utf8'), version, nonce, authTag, manifestLength, manifestBuffer, ciphertext]);
  }

  // Version 1 remains readable for backups created before authenticated-manifest archives were introduced.
  static decryptBackupFile(archivePath: string, key: Buffer, destDbPath: string): BackupManifest {
    if (key.length !== 32) throw new Error('Backup encryption key must contain exactly 32 bytes.');
    const parsed = this.parseEncryptedArchive(fs.readFileSync(archivePath));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, parsed.nonce);
    if (parsed.version >= 2) decipher.setAAD(parsed.manifestBuffer);
    decipher.setAuthTag(parsed.authTag);
    const decrypted = Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]);
    const directory = path.dirname(destDbPath);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(destDbPath, decrypted);
    return parsed.manifest;
  }
""",
)

replace_once(
    'backend/src/infrastructure/backup/BackupManager.ts',
    """  static async createBackup(options?: {
    externalDirectory?: string;
    encryptionKey?: Buffer;
    s3Config?: S3BackupConfiguration;
    isPreMigration?: boolean;
  }): Promise<string> {
    const paths = getRuntimePaths();
""",
    """  static async createBackup(options?: {
    externalDirectory?: string;
    encryptionKey?: Buffer;
    encryptionPassword?: string;
    s3Config?: S3BackupConfiguration;
    isPreMigration?: boolean;
  }): Promise<string> {
    const paths = getRuntimePaths();
    if (options?.encryptionKey && options?.encryptionPassword) throw new Error('Provide either an encryption key or an encryption password, not both.');
    let encryptionKey=options?.encryptionKey; let kdf:BackupKdfMetadata|undefined;
    if (options?.encryptionPassword) { const derived=this.createPasswordKdf(options.encryptionPassword); encryptionKey=derived.key; kdf=derived.kdf; }
""",
)
replace_once('backend/src/infrastructure/backup/BackupManager.ts',"        encrypted: !!options?.encryptionKey\n","        encrypted: !!encryptionKey,\n        ...(kdf ? { kdf } : {})\n")
for old,new in [
    ("if (options?.encryptionKey) {","if (encryptionKey) {"),
    ("this.encryptBackupFile(localDbBackupPath, manifest, options.encryptionKey)","this.encryptBackupFile(localDbBackupPath, manifest, encryptionKey)"),
    ("if (options?.s3Config && options?.encryptionKey) {","if (options?.s3Config && encryptionKey) {")
]:
    content=read('backend/src/infrastructure/backup/BackupManager.ts')
    if old not in content: raise RuntimeError(f'Missing {old}')
    write('backend/src/infrastructure/backup/BackupManager.ts',content.replace(old,new))

replace_once(
    'backend/src/infrastructure/backup/BackupManager.ts',
    """  static async restoreBackup(filename: string, encryptionKey?: Buffer): Promise<void> {
    const paths = getRuntimePaths();
""",
    """  static async restoreBackup(filename: string, encryptionKey?: Buffer, encryptionPassword?: string): Promise<void> {
    const paths = getRuntimePaths();
""",
)
replace_once(
    'backend/src/infrastructure/backup/BackupManager.ts',
    """      if (filename.endsWith('.crmbackup')) {
        if (!encryptionKey) {
          throw new Error('Encryption key is required to restore an encrypted backup archive.');
        }
        this.decryptBackupFile(sourcePath, encryptionKey, tempRestoreDbPath);
      } else {
""",
    """      if (filename.endsWith('.crmbackup')) {
        let restoreKey=encryptionKey;
        if (encryptionPassword) {
          const manifest=this.readEncryptedBackupManifest(sourcePath);
          restoreKey=manifest.kdf?this.derivePasswordKey(encryptionPassword,manifest.kdf):this.deriveLegacyPasswordKey(encryptionPassword);
        }
        if (!restoreKey) throw new Error('Encryption password or key is required to restore an encrypted backup archive.');
        this.decryptBackupFile(sourcePath, restoreKey, tempRestoreDbPath);
      } else {
""",
)

replace_once(
    'backend/src/presentation/routes/backups.ts',
    """function parseRetentionCount(value:unknown,fallback:number,maximum:number):number {
""",
    """function parseEncryptionPassword(value:unknown):string|undefined {
  if(value===undefined||value===null||value==='')return undefined;
  if(typeof value!=='string'||value.length<12||value.length>1024)throw new ValidationError('Backup encryption password must contain between 12 and 1024 characters');
  return value;
}

function parseRetentionCount(value:unknown,fallback:number,maximum:number):number {
""",
)
replace_once(
    'backend/src/presentation/routes/backups.ts',
    """    const { externalDirectory, encryptionKeyHex, s3Config } = req.body;
    const encryptionKey=parseEncryptionKeyHex(encryptionKeyHex);

    const filename = await BackupManager.createBackup({
      externalDirectory,
      encryptionKey,
      s3Config
    });
""",
    """    const { externalDirectory, encryptionKeyHex, encryptionPassword, s3Config } = req.body;
    const encryptionKey=parseEncryptionKeyHex(encryptionKeyHex);const password=parseEncryptionPassword(encryptionPassword);
    if(encryptionKey&&password)throw new ValidationError('Provide either an encryption password or a legacy encryption key, not both');

    const filename = await BackupManager.createBackup({ externalDirectory, encryptionKey, encryptionPassword:password, s3Config });
""",
)
replace_once(
    'backend/src/presentation/routes/backups.ts',
    """    const { filename, encryptionKeyHex } = req.body;
""",
    """    const { filename, encryptionKeyHex, encryptionPassword } = req.body;
""",
)
replace_once(
    'backend/src/presentation/routes/backups.ts',
    """    const encryptionKey=parseEncryptionKeyHex(encryptionKeyHex);
    await BackupManager.restoreBackup(filename, encryptionKey);
""",
    """    const encryptionKey=parseEncryptionKeyHex(encryptionKeyHex);const password=parseEncryptionPassword(encryptionPassword);
    if(encryptionKey&&password)throw new ValidationError('Provide either an encryption password or a legacy encryption key, not both');
    await BackupManager.restoreBackup(filename, encryptionKey, password);
""",
)

replace_once(
    'frontend/src/pages/Settings.tsx',
    """      let keyHex: string | undefined;
      if (encryptionEnabled && backupPassword) {
        const msgBuffer = new TextEncoder().encode(backupPassword);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        keyHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }

""",
    """      const encryptionPassword=encryptionEnabled&&backupPassword?backupPassword:undefined;

""",
)
replace_once('frontend/src/pages/Settings.tsx',"          encryptionKeyHex: keyHex,\n","          encryptionPassword,\n")
replace_once('frontend/src/pages/Settings.tsx',"        body: JSON.stringify({ filename, encryptionKeyHex: keyHex })\n","        body: JSON.stringify({ filename, encryptionPassword: backupPassword || undefined })\n")

replace_once(
    'backend/src/test/audit-redaction.spec.ts',
    """      encryptionKeyHex:secret,
""",
    """      encryptionKeyHex:secret,
      encryptionPassword:secret,
""",
)
replace_once(
    'backend/src/test/audit-redaction.spec.ts',
    """      encryptionKeyHex:'[redacted]',
""",
    """      encryptionKeyHex:'[redacted]',
      encryptionPassword:'[redacted]',
""",
)
replace_once(
    'backend/src/test/backup-route-security.spec.ts',
    """    const encryptionKeyHex='ab'.repeat(32);
    const response=await fetch(`${server!.url}/api/backups`,{method:'POST',headers:headers(),body:JSON.stringify({encryptionKeyHex,dailyRetentionCount:1,weeklyRetentionCount:1,monthlyRetentionCount:1})});
""",
    """    const encryptionPassword='correct horse battery staple';
    const response=await fetch(`${server!.url}/api/backups`,{method:'POST',headers:headers(),body:JSON.stringify({encryptionPassword,dailyRetentionCount:1,weeklyRetentionCount:1,monthlyRetentionCount:1})});
""",
)
replace_once(
    'backend/src/test/backup-route-security.spec.ts',
    """    expect(JSON.stringify(event.metadata)).not.toContain(encryptionKeyHex);
    expect((event.metadata as {body:{encryptionKeyHex:string}}).body.encryptionKeyHex).toBe('[redacted]');
""",
    """    expect(JSON.stringify(event.metadata)).not.toContain(encryptionPassword);
    expect((event.metadata as {body:{encryptionPassword:string}}).body.encryptionPassword).toBe('[redacted]');
""",
)

write(
    'backend/src/test/backup-crypto-v2.spec.ts',
    """import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {BackupManager,type BackupManifest} from '../infrastructure/backup/BackupManager';

describe('backup archive cryptography v2',()=>{
  let fixture='';let databasePath='';let archivePath='';let restoredPath='';
  beforeEach(()=>{fixture=fs.mkdtempSync(path.join(os.tmpdir(),'crm-backup-crypto-'));databasePath=path.join(fixture,'source.db');archivePath=path.join(fixture,'archive.crmbackup');restoredPath=path.join(fixture,'restored.db');const database=new Database(databasePath);database.exec('CREATE TABLE settings(id TEXT PRIMARY KEY); INSERT INTO settings(id) VALUES (\'default\');');database.close();});
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
""",
)

print('Backup cryptography v2 patch applied.')
