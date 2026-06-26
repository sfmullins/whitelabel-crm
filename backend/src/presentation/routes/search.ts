import { Router } from 'express';
import { CustomerRepository } from '../../infrastructure/database/repositories/CustomerRepository';
import { InvoiceRepository } from '../../infrastructure/database/repositories/InvoiceRepository';

const router = Router();
const customerRepo = new CustomerRepository();
const invoiceRepo = new InvoiceRepository();

router.get('/', async (req, res, next) => {
  try {
    const q = req.query.q as string;
    if (!q || q.trim().length < 2) {
      return res.json([]);
    }

    const queryPattern = q.trim();
    const [customersList, invoicesList] = await Promise.all([
      customerRepo.getAll(queryPattern),
      invoiceRepo.getAll({ search: queryPattern })
    ]);

    const results = [];

    if (customersList.length > 0) {
      results.push({
        category: 'Customers',
        items: customersList.map(c => ({
          id: c.id,
          title: `${c.firstName} ${c.lastName}`,
          subtitle: `${c.email} ${c.company ? `(${c.company})` : ''}`,
          url: `/customers/${c.id}`
        }))
      });
    }

    if (invoicesList.length > 0) {
      results.push({
        category: 'Invoices',
        items: invoicesList.map(inv => {
          let totalCents = 0;
          for (const item of inv.items) {
            const sub = item.quantity * item.unitPrice;
            const tax = Math.round(sub * (item.taxRate / 100));
            totalCents += sub + tax;
          }
          totalCents -= inv.discount;
          
          return {
            id: inv.id,
            title: inv.invoiceNumber,
            subtitle: `${inv.status.toUpperCase()} — $${(totalCents / 100).toFixed(2)}`,
            url: '/invoices'
          };
        })
      });
    }

    res.json(results);
  } catch (error) {
    next(error);
  }
});

export default router;
