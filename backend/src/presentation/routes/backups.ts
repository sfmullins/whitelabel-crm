import { Router } from 'express';
import { ValidationError } from '../../application/errors';
import { BackupManager } from '../../infrastructure/backup/BackupManager';

const router = Router();

function parseEncryptionKeyHex(value:unknown):Buffer|undefined {
  if(value===undefined||value===null||value==='')return undefined;
  if(typeof value!=='string'||!/^[0-9a-f]{64}$/i.test(value))throw new ValidationError('Backup encryption key must be exactly 32 bytes encoded as hexadecimal');
  return Buffer.from(value,'hex');
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
    const { externalDirectory, encryptionKeyHex, s3Config } = req.body;
    const encryptionKey=parseEncryptionKeyHex(encryptionKeyHex);

    const filename = await BackupManager.createBackup({
      externalDirectory,
      encryptionKey,
      s3Config
    });

    // Automatically trigger pruning on new backup creation
    const daily=parseRetentionCount(req.body.dailyRetentionCount,7,365);
    const weekly=parseRetentionCount(req.body.weeklyRetentionCount,4,260);
    const monthly=parseRetentionCount(req.body.monthlyRetentionCount,12,120);
    BackupManager.pruneRetention({ daily, weekly, monthly });

    res.status(201).json({ message: 'Backup created successfully', filename });
  } catch (error) {
    next(error);
  }
});

// Restore database from backup (with optional decryption)
router.post('/restore', async (req, res, next) => {
  try {
    const { filename, encryptionKeyHex } = req.body;
    if (!filename) {
      throw new ValidationError('Missing filename in body');
    }

    const encryptionKey=parseEncryptionKeyHex(encryptionKeyHex);
    await BackupManager.restoreBackup(filename, encryptionKey);
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
