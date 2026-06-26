import { Router } from 'express';
import { SettingsRepository } from '../../infrastructure/database/repositories/SettingsRepository';
import { SettingsSchema } from 'shared';

const router = Router();
const settingsRepo = new SettingsRepository();

router.get('/', async (req, res, next) => {
  try {
    const settings = await settingsRepo.get();
    if (!settings) {
      return res.status(404).json({ error: 'Settings not configured' });
    }
    return res.json(settings);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = SettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.format() 
      });
    }
    const updated = await settingsRepo.save(parsed.data);
    return res.json(updated);
  } catch (error) {
    next(error);
  }
});

export default router;
