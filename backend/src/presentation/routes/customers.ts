import { Router } from 'express';
import { CustomerRepository } from '../../infrastructure/database/repositories/CustomerRepository';
import { CustomFieldRepository } from '../../infrastructure/database/repositories/CustomFieldRepository';
import { CustomerSchema } from 'shared';

const router = Router();
const customerRepo = new CustomerRepository();
const customFieldRepo = new CustomFieldRepository();

import { importCustomersFromCSV } from '../../infrastructure/import/CSVImporter';

// Get all customers (supports query search)
router.get('/', async (req, res, next) => {
  try {
    const search = req.query.search as string;
    const list = await customerRepo.getAll(search);
    res.json(list);
  } catch (error) {
    next(error);
  }
});

// Import customers from CSV
router.post('/import', async (req, res, next) => {
  try {
    const { csvData } = req.body;
    if (!csvData) {
      return res.status(400).json({ error: 'Missing csvData in body' });
    }
    const result = await importCustomersFromCSV(csvData);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get single customer with custom fields values
router.get('/:id', async (req, res, next) => {
  try {
    const customer = await customerRepo.getById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const customFields = await customFieldRepo.getValues(customer.id!);
    res.json({
      ...customer,
      customFields
    });
  } catch (error) {
    next(error);
  }
});

// Create new customer
router.post('/', async (req, res, next) => {
  try {
    const parsed = CustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.format() 
      });
    }
    const created = await customerRepo.create(parsed.data);
    
    if (req.body.customFields) {
      await customFieldRepo.saveValues(created.id!, req.body.customFields);
    }
    
    const customFields = await customFieldRepo.getValues(created.id!);
    res.status(201).json({
      ...created,
      customFields
    });
  } catch (error) {
    next(error);
  }
});

// Update customer
router.put('/:id', async (req, res, next) => {
  try {
    const parsed = CustomerSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.format() 
      });
    }
    const updated = await customerRepo.update(req.params.id, parsed.data);
    
    if (req.body.customFields) {
      await customFieldRepo.saveValues(req.params.id, req.body.customFields);
    }
    
    const customFields = await customFieldRepo.getValues(req.params.id);
    res.json({
      ...updated,
      customFields
    });
  } catch (error) {
    next(error);
  }
});

// Delete customer
router.delete('/:id', async (req, res, next) => {
  try {
    await customerRepo.delete(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
