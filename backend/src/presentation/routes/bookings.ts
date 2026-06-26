import { Router } from 'express';
import { BookingRepository } from '../../infrastructure/database/repositories/BookingRepository';
import { ServiceRepository } from '../../infrastructure/database/repositories/ServiceRepository';
import { InvoiceRepository } from '../../infrastructure/database/repositories/InvoiceRepository';
import { BookingSchema } from 'shared';

const router = Router();
const bookingRepo = new BookingRepository();
const serviceRepo = new ServiceRepository();
const invoiceRepo = new InvoiceRepository();

// Get all bookings with calendar/customer filters
router.get('/', async (req, res, next) => {
  try {
    const filters: any = {};
    if (req.query.customerId) filters.customerId = req.query.customerId as string;
    if (req.query.date) filters.date = req.query.date as string;
    if (req.query.startDate) filters.startDate = req.query.startDate as string;
    if (req.query.endDate) filters.endDate = req.query.endDate as string;
    
    const list = await bookingRepo.getAll(filters);
    res.json(list);
  } catch (error) {
    next(error);
  }
});

// Get single booking
router.get('/:id', async (req, res, next) => {
  try {
    const booking = await bookingRepo.getById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    res.json(booking);
  } catch (error) {
    next(error);
  }
});

// Create booking + auto-generate invoice
router.post('/', async (req, res, next) => {
  try {
    const parsed = BookingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.format() 
      });
    }

    const service = await serviceRepo.getById(parsed.data.serviceId);
    if (!service) {
      return res.status(400).json({ error: 'Selected service catalog item does not exist' });
    }

    // Insert Booking
    const createdBooking = await bookingRepo.create(parsed.data);

    // Trigger Invoice Auto-Generation
    const createdInvoice = await invoiceRepo.create({
      customerId: createdBooking.customerId,
      bookingId: createdBooking.id!,
      status: 'unpaid',
      notes: `Automated booking invoice generated for ${createdBooking.date} at ${createdBooking.time}.`,
      taxRate: service.taxRate,
      discount: 0,
      items: [
        {
          serviceId: service.id,
          name: service.name,
          quantity: 1,
          unitPrice: service.price,
          taxRate: service.taxRate
        }
      ]
    });

    res.status(201).json({
      booking: createdBooking,
      invoice: createdInvoice
    });
  } catch (error) {
    next(error);
  }
});

// Update booking
router.put('/:id', async (req, res, next) => {
  try {
    const parsed = BookingSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.format() 
      });
    }
    const updated = await bookingRepo.update(req.params.id, parsed.data);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Delete booking
router.delete('/:id', async (req, res, next) => {
  try {
    await bookingRepo.delete(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
