import { Router } from 'express';
import { CustomFieldRepository } from '../../infrastructure/database/repositories/CustomFieldRepository';
import { CustomFieldDefinitionSchema } from 'shared';

const router = Router();
const cfRepo = new CustomFieldRepository();

// Get definitions for a specific entity type
router.get('/definitions', async (req, res, next) => {
  try {
    const entityType = req.query.entityType as string;
    if (!entityType) {
      return res.status(400).json({ error: 'entityType query parameter is required' });
    }
    const defs = await cfRepo.getDefinitions(entityType);
    res.json(defs);
  } catch (error) {
    next(error);
  }
});

// Create definition
router.post('/definitions', async (req, res, next) => {
  try {
    const parsed = CustomFieldDefinitionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.format() 
      });
    }
    const created = await cfRepo.createDefinition(parsed.data);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

// Delete definition
router.delete('/definitions/:id', async (req, res, next) => {
  try {
    await cfRepo.deleteDefinition(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
