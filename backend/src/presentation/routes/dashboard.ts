import { Router } from 'express';
import { CustomerRepository } from '../../infrastructure/database/repositories/CustomerRepository';
import { BookingRepository } from '../../infrastructure/database/repositories/BookingRepository';
import { InvoiceRepository } from '../../infrastructure/database/repositories/InvoiceRepository';
import { db } from '../../infrastructure/database/connection';
import { payments } from '../../infrastructure/database/schema';
import { desc } from 'drizzle-orm';

const router = Router();
const customerRepo = new CustomerRepository();
const bookingRepo = new BookingRepository();
const invoiceRepo = new InvoiceRepository();

router.get('/metrics', async (req, res, next) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    const startOfMonth = `${year}-${month}-01`;
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
    const endOfMonth = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

    const [activeCustomers, bookingsCount, revenueCents, outstandingCents] = await Promise.all([
      customerRepo.count(),
      bookingRepo.count(startOfMonth, endOfMonth),
      invoiceRepo.sumRevenue(startOfMonth, endOfMonth),
      invoiceRepo.sumOutstanding()
    ]);

    // Fetch and slice recent bookings
    const allBookings = await bookingRepo.getAll();
    allBookings.sort((a, b) => b.createdAt!.localeCompare(a.createdAt!));
    const recentBookings = allBookings.slice(0, 5);

    // Fetch recent payments via Drizzle
    const recentPayments = db.select()
      .from(payments)
      .orderBy(desc(payments.createdAt))
      .limit(5)
      .all();

    // Map into a unified dashboard activity feed
    const activityTimeline: any[] = [];
    
    for (const b of recentBookings) {
      activityTimeline.push({
        id: b.id,
        type: 'booking',
        title: 'New Booking Scheduled',
        description: `Appointment set for ${b.date} at ${b.time}`,
        date: b.createdAt,
        metadata: { date: b.date, time: b.time }
      });
    }

    for (const p of recentPayments) {
      activityTimeline.push({
        id: p.id,
        type: 'payment',
        title: 'Payment Received',
        description: `Recorded collection of payment`,
        date: p.createdAt,
        metadata: { amount: p.amount, method: p.paymentMethod }
      });
    }

    // Sort combined timeline desc
    activityTimeline.sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      return dateB.localeCompare(dateA);
    });

    res.json({
      activeCustomers,
      bookingsCount,
      revenueCents,
      outstandingCents,
      recentActivity: activityTimeline.slice(0, 8)
    });
  } catch (error) {
    next(error);
  }
});

export default router;
