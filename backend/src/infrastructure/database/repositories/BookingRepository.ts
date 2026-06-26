import { IBookingRepository } from '../../../application/interfaces/IRepositories';
import { Booking } from 'shared';
import { db } from '../connection';
import { bookings } from '../schema';
import { eq, and, gte, lte, count } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { cleanNulls } from './utils';

export class BookingRepository implements IBookingRepository {
  private mapRow(row: any): Booking {
    return cleanNulls(row);
  }

  async getById(id: string): Promise<Booking | null> {
    const row = db.select().from(bookings).where(eq(bookings.id, id)).get();
    return row ? this.mapRow(row) : null;
  }

  async getAll(filters?: { customerId?: string; date?: string; startDate?: string; endDate?: string }): Promise<Booking[]> {
    let selectQuery = db.select().from(bookings);
    const conditions = [];

    if (filters?.customerId) {
      conditions.push(eq(bookings.customerId, filters.customerId));
    }
    if (filters?.date) {
      conditions.push(eq(bookings.date, filters.date));
    }
    if (filters?.startDate) {
      conditions.push(gte(bookings.date, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(bookings.date, filters.endDate));
    }

    const rows = conditions.length > 0 
      ? selectQuery.where(and(...conditions)).all() 
      : selectQuery.all();
      
    return rows.map(r => this.mapRow(r));
  }

  async create(booking: Booking): Promise<Booking> {
    const id = booking.id || randomUUID();
    const now = new Date().toISOString();
    const row = {
      ...booking,
      id,
      createdAt: now,
      updatedAt: now
    };
    db.insert(bookings).values(row as any).run();
    return this.mapRow(row);
  }

  async update(id: string, bookingUpdates: Partial<Booking>): Promise<Booking> {
    const now = new Date().toISOString();
    const updates = {
      ...bookingUpdates,
      updatedAt: now
    };
    db.update(bookings).set(updates).where(eq(bookings.id, id)).run();
    const updated = db.select().from(bookings).where(eq(bookings.id, id)).get();
    if (!updated) throw new Error(`Booking with id ${id} not found after update`);
    return this.mapRow(updated);
  }

  async delete(id: string): Promise<void> {
    db.delete(bookings).where(eq(bookings.id, id)).run();
  }

  async count(startDate?: string, endDate?: string): Promise<number> {
    let selectQuery = db.select({ value: count(bookings.id) }).from(bookings);
    const conditions = [];

    if (startDate) {
      conditions.push(gte(bookings.date, startDate));
    }
    if (endDate) {
      conditions.push(lte(bookings.date, endDate));
    }

    let result;
    if (conditions.length > 0) {
      result = selectQuery.where(and(...conditions)).get();
    } else {
      result = selectQuery.get();
    }
    return result ? result.value : 0;
  }
}
