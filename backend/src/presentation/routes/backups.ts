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

// Create manual backup
router.post('/', async (req, res, next) => {
  try {
    const filename = await BackupManager.createBackup();
    res.status(201).json({ message: 'Backup created successfully', filename });
  } catch (error) {
    next(error);
  }
});

// Restore database from backup
router.post('/restore', async (req, res, next) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ error: 'Missing filename in body' });
    }
    await BackupManager.restoreBackup(filename);
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
