import { IInvoiceRepository } from '../../../application/interfaces/IRepositories';
import { Invoice, InvoiceItem } from 'shared';
import { db } from '../connection';
import { invoices, invoiceItems, payments } from '../schema';
import { eq, and, gte, lte, like, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { cleanNulls } from './utils';

export class InvoiceRepository implements IInvoiceRepository {
  private mapRow(row: any, items: InvoiceItem[]): Invoice {
    const cleanedMain = cleanNulls(row);
    const cleanedItems = items.map(it => cleanNulls(it));
    return {
      ...cleanedMain,
      items: cleanedItems
    } as any;
  }

  private async getItemsForInvoice(invoiceId: string): Promise<InvoiceItem[]> {
    return db.select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, invoiceId))
      .all() as any;
  }

  async getById(id: string): Promise<Invoice | null> {
    const row = db.select().from(invoices).where(eq(invoices.id, id)).get();
    if (!row) return null;
    const items = await this.getItemsForInvoice(row.id);
    return this.mapRow(row, items);
  }

  async getByBookingId(bookingId: string): Promise<Invoice | null> {
    const row = db.select().from(invoices).where(eq(invoices.bookingId, bookingId)).get();
    if (!row) return null;
    const items = await this.getItemsForInvoice(row.id);
    return this.mapRow(row, items);
  }

  async getAll(filters?: { customerId?: string; status?: string; startDate?: string; endDate?: string; search?: string }): Promise<Invoice[]> {
    let selectQuery = db.select().from(invoices);
    const conditions = [];

    if (filters?.customerId) {
      conditions.push(eq(invoices.customerId, filters.customerId));
    }
    if (filters?.status) {
      conditions.push(eq(invoices.status, filters.status));
    }
    if (filters?.startDate) {
      conditions.push(gte(invoices.createdAt, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(invoices.createdAt, filters.endDate));
    }
    if (filters?.search) {
      conditions.push(like(invoices.invoiceNumber, `%${filters.search}%`));
    }

    const rows = conditions.length > 0 
      ? selectQuery.where(and(...conditions)).all() 
      : selectQuery.all();

    const results: Invoice[] = [];
    for (const row of rows) {
      const items = await this.getItemsForInvoice(row.id);
      results.push(this.mapRow(row, items));
    }
    return results;
  }

  async getNextInvoiceNumber(date: string): Promise<string> {
    const dateStr = date.replace(/-/g, '').substring(0, 8); // Ensure YYYYMMDD
    const prefix = `INV-${dateStr}-`;
    const searchPattern = `${prefix}%`;
    const rows = db.select({ num: invoices.invoiceNumber })
      .from(invoices)
      .where(like(invoices.invoiceNumber, searchPattern))
      .all();
      
    if (rows.length === 0) {
      return `${prefix}0001`;
    }
    
    let maxSeq = 0;
    for (const r of rows) {
      const parts = r.num.split('-');
      const seqStr = parts[parts.length - 1];
      const seq = parseInt(seqStr, 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
    
    const nextSeq = String(maxSeq + 1).padStart(4, '0');
    return `${prefix}${nextSeq}`;
  }

  async create(invoiceDto: Omit<Invoice, 'invoiceNumber'>): Promise<Invoice> {
    const id = invoiceDto.id || randomUUID();
    const now = new Date().toISOString();
    const invoiceNumber = await this.getNextInvoiceNumber(now);

    return db.transaction(async (tx) => {
      const invoiceRow = {
        id,
        invoiceNumber,
        customerId: invoiceDto.customerId,
        bookingId: invoiceDto.bookingId || null,
        status: invoiceDto.status || 'unpaid',
        notes: invoiceDto.notes || '',
        taxRate: invoiceDto.taxRate || 0,
        discount: invoiceDto.discount || 0,
        createdAt: now,
        updatedAt: now
      };

      tx.insert(invoices).values(invoiceRow as any).run();

      const items: InvoiceItem[] = [];
      if (invoiceDto.items && invoiceDto.items.length > 0) {
        for (const item of invoiceDto.items) {
          const itemId = item.id || randomUUID();
          const itemRow = {
            id: itemId,
            invoiceId: id,
            serviceId: item.serviceId || null,
            name: item.name,
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            createdAt: now
          };
          tx.insert(invoiceItems).values(itemRow as any).run();
          items.push(itemRow as any);
        }
      }

      return this.mapRow(invoiceRow, items);
    });
  }

  async update(id: string, invoiceUpdates: Partial<Invoice>): Promise<Invoice> {
    const now = new Date().toISOString();
    
    return db.transaction(async (tx) => {
      const mainUpdates: any = {
        updatedAt: now
      };
      if (invoiceUpdates.status !== undefined) mainUpdates.status = invoiceUpdates.status;
      if (invoiceUpdates.notes !== undefined) mainUpdates.notes = invoiceUpdates.notes;
      if (invoiceUpdates.taxRate !== undefined) mainUpdates.taxRate = invoiceUpdates.taxRate;
      if (invoiceUpdates.discount !== undefined) mainUpdates.discount = invoiceUpdates.discount;

      tx.update(invoices).set(mainUpdates).where(eq(invoices.id, id)).run();

      if (invoiceUpdates.items !== undefined) {
        // Replace items
        tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id)).run();
        for (const item of invoiceUpdates.items) {
          const itemId = item.id || randomUUID();
          const itemRow = {
            id: itemId,
            invoiceId: id,
            serviceId: item.serviceId || null,
            name: item.name,
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            createdAt: now
          };
          tx.insert(invoiceItems).values(itemRow as any).run();
        }
      }

      const updatedRow = tx.select().from(invoices).where(eq(invoices.id, id)).get();
      if (!updatedRow) throw new Error(`Invoice ${id} not found after update`);
      const items = await this.getItemsForInvoice(id);
      
      return this.mapRow(updatedRow, items);
    });
  }

  async delete(id: string): Promise<void> {
    db.delete(invoices).where(eq(invoices.id, id)).run();
  }

  async sumRevenue(startDate?: string, endDate?: string): Promise<number> {
    let selectQuery = db.select({ total: sql<number>`sum(${payments.amount})` }).from(payments);
    const conditions = [];

    if (startDate) {
      conditions.push(gte(payments.paymentDate, startDate));
    }
    if (endDate) {
      conditions.push(lte(payments.paymentDate, endDate));
    }

    const result = conditions.length > 0
      ? selectQuery.where(and(...conditions)).get()
      : selectQuery.get();

    return result?.total || 0;
  }

  async sumOutstanding(startDate?: string, endDate?: string): Promise<number> {
    const conditions = [eq(invoices.status, 'unpaid')];

    if (startDate) {
      conditions.push(gte(invoices.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(invoices.createdAt, endDate));
    }

    const rows = db.select()
      .from(invoices)
      .where(and(...conditions))
      .all();

    let totalOutstanding = 0;

    for (const row of rows) {
      const items = await this.getItemsForInvoice(row.id);
      let invoiceTotal = 0;
      for (const item of items) {
        const itemSubtotal = item.quantity * item.unitPrice;
        const itemTax = Math.round(itemSubtotal * (item.taxRate / 100));
        invoiceTotal += itemSubtotal + itemTax;
      }
      invoiceTotal -= row.discount;

      // Subtract any partial payments made against this invoice
      const paymentsSumRow = db.select({ total: sql<number>`sum(${payments.amount})` })
        .from(payments)
        .where(eq(payments.invoiceId, row.id))
        .get();
      
      const paymentsTotal = paymentsSumRow?.total || 0;
      const outstanding = invoiceTotal - paymentsTotal;
      if (outstanding > 0) {
        totalOutstanding += outstanding;
      }
    }

    return totalOutstanding;
  }
}
