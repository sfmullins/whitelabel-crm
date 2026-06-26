import { IServiceRepository } from '../../../application/interfaces/IRepositories';
import { Service } from 'shared';
import { db } from '../connection';
import { services } from '../schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { cleanNulls } from './utils';

export class ServiceRepository implements IServiceRepository {
  private mapRow(row: any): Service {
    return cleanNulls(row);
  }

  async getById(id: string): Promise<Service | null> {
    const row = db.select().from(services).where(eq(services.id, id)).get();
    return row ? this.mapRow(row) : null;
  }

  async getAll(includeInactive?: boolean): Promise<Service[]> {
    let rows;
    if (includeInactive) {
      rows = db.select().from(services).all();
    } else {
      rows = db.select().from(services).where(eq(services.isActive, true)).all();
    }
    return rows.map(r => this.mapRow(r));
  }

  async create(service: Service): Promise<Service> {
    const id = service.id || randomUUID();
    const now = new Date().toISOString();
    const row = {
      ...service,
      id,
      createdAt: now,
      updatedAt: now
    };
    db.insert(services).values(row as any).run();
    return this.mapRow(row);
  }

  async update(id: string, serviceUpdates: Partial<Service>): Promise<Service> {
    const now = new Date().toISOString();
    const updates = {
      ...serviceUpdates,
      updatedAt: now
    };
    db.update(services).set(updates).where(eq(services.id, id)).run();
    const updated = db.select().from(services).where(eq(services.id, id)).get();
    if (!updated) throw new Error(`Service with id ${id} not found after update`);
    return this.mapRow(updated);
  }

  async delete(id: string): Promise<void> {
    try {
      db.delete(services).where(eq(services.id, id)).run();
    } catch (error: any) {
      if (error.message.includes('FOREIGN KEY constraint failed')) {
        throw new Error('Cannot delete service because it is linked to existing bookings or invoices. Deactivate it instead.');
      }
      throw error;
    }
  }
}
