import { Router } from 'express';
import { BackupManager } from '../../infrastructure/backup/BackupManager';

const router = Router();

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
    
    let encryptionKey: Buffer | undefined;
    if (encryptionKeyHex) {
      encryptionKey = Buffer.from(encryptionKeyHex, 'hex');
    }

    const filename = await BackupManager.createBackup({
      externalDirectory,
      encryptionKey,
      s3Config
    });

    // Automatically trigger pruning on new backup creation
    const daily = Number(req.body.dailyRetentionCount ?? 7);
    const weekly = Number(req.body.weeklyRetentionCount ?? 4);
    const monthly = Number(req.body.monthlyRetentionCount ?? 12);
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
      return res.status(400).json({ error: 'Missing filename in body' });
    }

    let encryptionKey: Buffer | undefined;
    if (encryptionKeyHex) {
      encryptionKey = Buffer.from(encryptionKeyHex, 'hex');
    }

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
