import { Router } from 'express';
import { ValidationError } from '../../application/errors';
import { BackupManager } from '../../infrastructure/backup/BackupManager';

const router = Router();

function parseEncryptionKeyHex(value:unknown):Buffer|undefined {
  if(value===undefined||value===null||value==='')return undefined;
  if(typeof value!=='string'||!/^[0-9a-f]{64}$/i.test(value))throw new ValidationError('Backup encryption key must be exactly 32 bytes encoded as hexadecimal');
  return Buffer.from(value,'hex');
}

function parseEncryptionPassword(value:unknown):string|undefined {
  if(value===undefined||value===null||value==='')return undefined;
  if(typeof value!=='string'||value.length<12||value.length>1024)throw new ValidationError('Backup encryption password must contain between 12 and 1024 characters');
  return value;
}

function parseRetentionCount(value:unknown,fallback:number,maximum:number):number {
  if(value===undefined||value===null||value==='')return fallback;
  const parsed=Number(value);
  if(!Number.isInteger(parsed)||parsed<1||parsed>maximum)throw new ValidationError(`Backup retention count must be an integer between 1 and ${maximum}`);
  return parsed;
}

// Get list of backups
router.get('/', (req, res, next) => {
  try {
    const list = BackupManager.listBackups();
    res.json(list);
  } catch (error) {
    next(error);
  }
});

// Create manual backup (with optional S3, encryption, external path)
router.post('/', async (req, res, next) => {
  try {
    const { externalDirectory, encryptionKeyHex, encryptionPassword, s3Config } = req.body;
    const encryptionKey=parseEncryptionKeyHex(encryptionKeyHex);const password=parseEncryptionPassword(encryptionPassword);
    if(encryptionKey&&password)throw new ValidationError('Provide either an encryption password or a legacy encryption key, not both');
    if(s3Config&&!encryptionKey&&!password)throw new ValidationError('Remote backups require an encryption password or key');
    const daily=parseRetentionCount(req.body.dailyRetentionCount,7,365);
    const weekly=parseRetentionCount(req.body.weeklyRetentionCount,4,260);
    const monthly=parseRetentionCount(req.body.monthlyRetentionCount,12,120);

    const filename = await BackupManager.createBackup({ externalDirectory, encryptionKey, encryptionPassword:password, s3Config });
    BackupManager.pruneRetention({ daily, weekly, monthly });

    res.status(201).json({ message: 'Backup created successfully', filename });
  } catch (error) {
    next(error);
  }
});

// Restore database from backup (with optional decryption)
router.post('/restore', async (req, res, next) => {
  try {
    const { filename, encryptionKeyHex, encryptionPassword } = req.body;
    if (!filename) {
      throw new ValidationError('Missing filename in body');
    }

    const encryptionKey=parseEncryptionKeyHex(encryptionKeyHex);const password=parseEncryptionPassword(encryptionPassword);
    if(encryptionKey&&password)throw new ValidationError('Provide either an encryption password or a legacy encryption key, not both');
    await BackupManager.restoreBackup(filename, encryptionKey, password);
    res.json({ message: 'Database state restored successfully.' });
  } catch (error) {
    next(error);
  }
});

// Delete backup
router.delete('/:filename', (req, res, next) => {
  try {
    const { filename } = req.params;
    BackupManager.deleteBackup(filename);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
