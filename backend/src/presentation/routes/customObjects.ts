import { Router } from 'express';
import { CustomObjectRepository } from '../../infrastructure/database/repositories/CustomObjectRepository';
import { CustomObjectDefinitionSchema, CustomObjectRecordSchema } from 'shared';

const router = Router();
const coRepo = new CustomObjectRepository();

// GET all custom object definitions
router.get('/definitions', async (req, res, next) => {
  try {
    const list = await coRepo.getDefinitions();
    res.json(list);
  } catch (error) {
    next(error);
  }
});

// POST register custom object definition
router.post('/definitions', async (req, res, next) => {
  try {
    const parsed = CustomObjectDefinitionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.format() 
      });
    }
    const created = await coRepo.createDefinition(parsed.data);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

// DELETE definition
router.delete('/definitions/:id', async (req, res, next) => {
  try {
    await coRepo.deleteDefinition(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// GET records for definition
router.get('/records', async (req, res, next) => {
  try {
    const definitionId = req.query.definitionId as string;
    const customerId = req.query.customerId as string;
    if (!definitionId) {
      return res.status(400).json({ error: 'definitionId query parameter is required' });
    }
    const records = await coRepo.getRecords(definitionId, customerId);
    res.json(records);
  } catch (error) {
    next(error);
  }
});

// POST create record and save its values
router.post('/records', async (req, res, next) => {
  try {
    const parsed = CustomObjectRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.format() 
      });
    }
    const created = await coRepo.createRecord(parsed.data);
    
    if (req.body.values) {
      await coRepo.saveRecordValues(created.id!, req.body.values);
    }
    
    const finalRecord = await coRepo.getRecordById(created.id!);
    res.status(201).json(finalRecord);
  } catch (error) {
    next(error);
  }
});

// GET single record
router.get('/records/:id', async (req, res, next) => {
  try {
    const record = await coRepo.getRecordById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json(record);
  } catch (error) {
    next(error);
  }
});

// PUT update record values
router.put('/records/:id', async (req, res, next) => {
  try {
    if (req.body.values) {
      await coRepo.saveRecordValues(req.params.id, req.body.values);
    }
    const record = await coRepo.getRecordById(req.params.id);
    res.json(record);
  } catch (error) {
    next(error);
  }
});

// DELETE record
router.delete('/records/:id', async (req, res, next) => {
  try {
    await coRepo.deleteRecord(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
