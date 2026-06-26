import { ICustomerRepository } from '../../../application/interfaces/IRepositories';
import { Customer } from 'shared';
import { db } from '../connection';
import { customers } from '../schema';
import { eq, or, like, count, and, gte, lte } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { cleanNulls } from './utils';

export class CustomerRepository implements ICustomerRepository {
  private mapRow(row: any): Customer {
    const cleaned = cleanNulls(row);
    return {
      ...cleaned,
      tags: row.tags ? JSON.parse(row.tags) : []
    };
  }

  async getById(id: string): Promise<Customer | null> {
    const row = db.select().from(customers).where(eq(customers.id, id)).get();
    return row ? this.mapRow(row) : null;
  }

  async getAll(search?: string): Promise<Customer[]> {
    if (search) {
      const searchPattern = `%${search}%`;
      const rows = db.select()
        .from(customers)
        .where(
          or(
            like(customers.firstName, searchPattern),
            like(customers.lastName, searchPattern),
            like(customers.company, searchPattern),
            like(customers.email, searchPattern)
          )
        )
        .all();
      return rows.map(r => this.mapRow(r));
    }
    const rows = db.select().from(customers).all();
    return rows.map(r => this.mapRow(r));
  }

  async create(customer: Customer): Promise<Customer> {
    const id = customer.id || randomUUID();
    const now = new Date().toISOString();
    const row = {
      ...customer,
      id,
      tags: JSON.stringify(customer.tags || []),
      createdAt: now,
      updatedAt: now
    };
    db.insert(customers).values(row as any).run();
    return this.mapRow(row);
  }

  async update(id: string, customerUpdates: Partial<Customer>): Promise<Customer> {
    const now = new Date().toISOString();
    const updates: any = {
      ...customerUpdates,
      updatedAt: now
    };
    if (customerUpdates.tags !== undefined) {
      updates.tags = JSON.stringify(customerUpdates.tags);
    }
    
    db.update(customers)
      .set(updates)
      .where(eq(customers.id, id))
      .run();

    const updatedRow = db.select().from(customers).where(eq(customers.id, id)).get();
    if (!updatedRow) throw new Error(`Customer with id ${id} not found after update`);
    return this.mapRow(updatedRow);
  }

  async delete(id: string): Promise<void> {
    db.delete(customers).where(eq(customers.id, id)).run();
  }

  async count(): Promise<number> {
    const result = db.select({ value: count(customers.id) }).from(customers).get();
    return result ? result.value : 0;
  }

  async countNewByPeriod(startDate: string, endDate: string): Promise<number> {
    const result = db.select({ value: count(customers.id) })
      .from(customers)
      .where(
        and(
          gte(customers.createdAt, startDate),
          lte(customers.createdAt, endDate)
        )
      )
      .get();
    return result ? result.value : 0;
  }
}
