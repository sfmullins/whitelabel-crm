import { Router } from 'express';
import { InvoiceRepository } from '../../infrastructure/database/repositories/InvoiceRepository';
import { PaymentRepository } from '../../infrastructure/database/repositories/PaymentRepository';
import { SettingsRepository } from '../../infrastructure/database/repositories/SettingsRepository';
import { CustomerRepository } from '../../infrastructure/database/repositories/CustomerRepository';
import { generateInvoicePDF } from '../../infrastructure/document/PDFGenerator';
import { InvoiceSchema, PaymentSchema } from 'shared';

const router = Router();
const invoiceRepo = new InvoiceRepository();
const paymentRepo = new PaymentRepository();
const settingsRepo = new SettingsRepository();
const customerRepo = new CustomerRepository();

// Get all invoices with customer & status filters
router.get('/', async (req, res, next) => {
  try {
    const filters: any = {};
    if (req.query.customerId) filters.customerId = req.query.customerId as string;
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.startDate) filters.startDate = req.query.startDate as string;
    if (req.query.endDate) filters.endDate = req.query.endDate as string;
    if (req.query.search) filters.search = req.query.search as string;

    const list = await invoiceRepo.getAll(filters);
    res.json(list);
  } catch (error) {
    next(error);
  }
});

// Get single invoice PDF
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const invoice = await invoiceRepo.getById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const customer = await customerRepo.getById(invoice.customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const settings = await settingsRepo.get();
    if (!settings) {
      return res.status(404).json({ error: 'Settings not configured' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`);

    await generateInvoicePDF(invoice, customer, settings, res);
  } catch (error) {
    next(error);
  }
});

// Get single invoice with item sub-records
router.get('/:id', async (req, res, next) => {
  try {
    const invoice = await invoiceRepo.getById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    res.json(invoice);
  } catch (error) {
    next(error);
  }
});

// Create manual invoice
router.post('/', async (req, res, next) => {
  try {
    const parsed = InvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.format() 
      });
    }
    const created = await invoiceRepo.create(parsed.data);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

// Update invoice and items
router.put('/:id', async (req, res, next) => {
  try {
    const parsed = InvoiceSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.format() 
      });
    }
    const updated = await invoiceRepo.update(req.params.id, parsed.data);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Delete invoice
router.delete('/:id', async (req, res, next) => {
  try {
    await invoiceRepo.delete(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// GET all payments for a specific invoice
router.get('/:id/payments', async (req, res, next) => {
  try {
    const paymentsList = await paymentRepo.getByInvoiceId(req.params.id);
    res.json(paymentsList);
  } catch (error) {
    next(error);
  }
});

// POST payment against a specific invoice
router.post('/:id/payments', async (req, res, next) => {
  try {
    const paymentData = {
      ...req.body,
      invoiceId: req.params.id
    };
    const parsed = PaymentSchema.safeParse(paymentData);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.format() 
      });
    }
    const created = await paymentRepo.create(parsed.data);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

export default router;
