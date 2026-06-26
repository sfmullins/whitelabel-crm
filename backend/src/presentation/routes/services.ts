import { Router } from 'express';
import { ServiceRepository } from '../../infrastructure/database/repositories/ServiceRepository';
import { ServiceSchema } from 'shared';

const router = Router();
const serviceRepo = new ServiceRepository();

// Get all services
router.get('/', async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const list = await serviceRepo.getAll(includeInactive);
    res.json(list);
  } catch (error) {
    next(error);
  }
});

// Get single service
router.get('/:id', async (req, res, next) => {
  try {
    const service = await serviceRepo.getById(req.params.id);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }
    res.json(service);
  } catch (error) {
    next(error);
  }
});

// Create service
router.post('/', async (req, res, next) => {
  try {
    const parsed = ServiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.format() 
      });
    }
    const created = await serviceRepo.create(parsed.data);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

// Update service
router.put('/:id', async (req, res, next) => {
  try {
    const parsed = ServiceSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.format() 
      });
    }
    const updated = await serviceRepo.update(req.params.id, parsed.data);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Delete service
router.delete('/:id', async (req, res, next) => {
  try {
    await serviceRepo.delete(req.params.id);
    res.status(204).end();
  } catch (error: any) {
    if (error.message.includes('Cannot delete service')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

export default router;
