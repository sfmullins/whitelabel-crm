import { IPaymentRepository } from '../../../application/interfaces/IRepositories';
import { Payment } from 'shared';
import { db } from '../connection';
import { payments, invoices, invoiceItems } from '../schema';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { cleanNulls } from './utils';

export class PaymentRepository implements IPaymentRepository {
  private mapRow(row: any): Payment {
    return cleanNulls(row);
  }

  async getById(id: string): Promise<Payment | null> {
    const row = db.select().from(payments).where(eq(payments.id, id)).get();
    return row ? this.mapRow(row) : null;
  }

  async getByInvoiceId(invoiceId: string): Promise<Payment[]> {
    const rows = db.select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId))
      .all();
    return rows.map(r => this.mapRow(r));
  }

  async create(payment: Payment): Promise<Payment> {
    const id = payment.id || randomUUID();
    const now = new Date().toISOString();
    const paymentDate = payment.paymentDate || now;
    
    const row = {
      id,
      invoiceId: payment.invoiceId,
      amount: payment.amount,
      paymentMethod: payment.paymentMethod || 'cash',
      paymentDate,
      notes: payment.notes || '',
      createdAt: now
    };

    return db.transaction(async (tx) => {
      tx.insert(payments).values(row as any).run();

      // Check if invoice is fully paid
      const invoiceId = payment.invoiceId;
      const invoiceRow = tx.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
      if (invoiceRow) {
        const items = tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId)).all();
        let invoiceTotal = 0;
        for (const item of items) {
          const itemSubtotal = item.quantity * item.unitPrice;
          const itemTax = Math.round(itemSubtotal * (item.taxRate / 100));
          invoiceTotal += itemSubtotal + itemTax;
        }
        invoiceTotal -= invoiceRow.discount;

        // Sum payments for this invoice
        const sumRow = tx.select({ total: sql<number>`sum(${payments.amount})` })
          .from(payments)
          .where(eq(payments.invoiceId, invoiceId))
          .get();
        const totalPaid = sumRow?.total || 0;

        if (totalPaid >= invoiceTotal) {
          tx.update(invoices)
            .set({ status: 'paid', updatedAt: now })
            .where(eq(invoices.id, invoiceId))
            .run();
        }
      }

      return this.mapRow(row);
    });
  }

  async delete(id: string): Promise<void> {
    return db.transaction(async (tx) => {
      const paymentRow = tx.select().from(payments).where(eq(payments.id, id)).get();
      if (!paymentRow) return;

      tx.delete(payments).where(eq(payments.id, id)).run();

      // Re-evaluate invoice status to unpaid if it was marked paid
      const invoiceId = paymentRow.invoiceId;
      const invoiceRow = tx.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
      if (invoiceRow && invoiceRow.status === 'paid') {
        const items = tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId)).all();
        let invoiceTotal = 0;
        for (const item of items) {
          const itemSubtotal = item.quantity * item.unitPrice;
          const itemTax = Math.round(itemSubtotal * (item.taxRate / 100));
          invoiceTotal += itemSubtotal + itemTax;
        }
        invoiceTotal -= invoiceRow.discount;

        const sumRow = tx.select({ total: sql<number>`sum(${payments.amount})` })
          .from(payments)
          .where(eq(payments.invoiceId, invoiceId))
          .get();
        const totalPaid = sumRow?.total || 0;

        if (totalPaid < invoiceTotal) {
          tx.update(invoices)
            .set({ status: 'unpaid', updatedAt: new Date().toISOString() })
            .where(eq(invoices.id, invoiceId))
            .run();
        }
      }
    });
  }
}
