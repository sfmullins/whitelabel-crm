import { ICustomObjectRepository } from '../../../application/interfaces/IRepositories';
import { CustomObjectDefinition, CustomObjectRecord } from 'shared';
import { db } from '../connection';
import { customObjectsDefinition, customObjectsRecords, customObjectsValues, customFieldsDefinition } from '../schema';
import { eq, and, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { cleanNulls } from './utils';

export class CustomObjectRepository implements ICustomObjectRepository {
  private mapDefRow(row: any): CustomObjectDefinition {
    return cleanNulls(row);
  }

  private mapRecordRow(row: any, values: Record<string, string>): CustomObjectRecord {
    const cleaned = cleanNulls(row);
    return {
      ...cleaned,
      values
    };
  }

  // Definitions
  async createDefinition(def: CustomObjectDefinition): Promise<CustomObjectDefinition> {
    const id = def.id || randomUUID();
    const now = new Date().toISOString();
    const row = {
      ...def,
      id,
      createdAt: now
    };
    db.insert(customObjectsDefinition).values(row as any).run();
    return this.mapDefRow(row);
  }

  async getDefinitions(): Promise<CustomObjectDefinition[]> {
    const rows = db.select().from(customObjectsDefinition).all();
    return rows.map(r => this.mapDefRow(r));
  }

  async getDefinitionByApiName(apiName: string): Promise<CustomObjectDefinition | null> {
    const row = db.select()
      .from(customObjectsDefinition)
      .where(eq(customObjectsDefinition.apiName, apiName))
      .get();
    return row ? this.mapDefRow(row) : null;
  }

  async deleteDefinition(id: string): Promise<void> {
    db.delete(customObjectsDefinition).where(eq(customObjectsDefinition.id, id)).run();
  }

  // Records
  async createRecord(record: Omit<CustomObjectRecord, 'values'>): Promise<CustomObjectRecord> {
    const id = record.id || randomUUID();
    const now = new Date().toISOString();
    const row = {
      id,
      objectDefinitionId: record.objectDefinitionId,
      customerId: record.customerId,
      createdAt: now,
      updatedAt: now
    };
    db.insert(customObjectsRecords).values(row).run();
    return {
      ...row,
      values: {}
    };
  }

  async getRecords(definitionId: string, customerId?: string): Promise<CustomObjectRecord[]> {
    const conditions = [eq(customObjectsRecords.objectDefinitionId, definitionId)];
    
    if (customerId) {
      conditions.push(eq(customObjectsRecords.customerId, customerId));
    }

    const rows = db.select()
      .from(customObjectsRecords)
      .where(and(...conditions))
      .all();
    const result: CustomObjectRecord[] = [];
    for (const row of rows) {
      const values = await this.getRecordValues(row.id);
      result.push(this.mapRecordRow(row, values));
    }
    return result;
  }

  async getRecordById(recordId: string): Promise<CustomObjectRecord | null> {
    const row = db.select().from(customObjectsRecords).where(eq(customObjectsRecords.id, recordId)).get();
    if (!row) return null;
    const values = await this.getRecordValues(row.id);
    return this.mapRecordRow(row, values);
  }

  async deleteRecord(recordId: string): Promise<void> {
    db.delete(customObjectsRecords).where(eq(customObjectsRecords.id, recordId)).run();
  }

  // Values
  async saveRecordValues(recordId: string, values: Record<string, string>): Promise<void> {
    const names = Object.keys(values);
    if (names.length === 0) return;

    // Retrieve definitions matching the keys to get their IDs
    const fieldDefs = db.select()
      .from(customFieldsDefinition)
      .where(inArray(customFieldsDefinition.name, names))
      .all();

    db.transaction((tx) => {
      const now = new Date().toISOString();
      for (const def of fieldDefs) {
        const val = values[def.name];
        
        const existing = tx.select()
          .from(customObjectsValues)
          .where(
            and(
              eq(customObjectsValues.recordId, recordId),
              eq(customObjectsValues.fieldId, def.id)
            )
          )
          .get();

        if (existing) {
          tx.update(customObjectsValues)
            .set({ value: val, updatedAt: now })
            .where(eq(customObjectsValues.id, existing.id))
            .run();
        } else {
          tx.insert(customObjectsValues)
            .values({
              id: randomUUID(),
              recordId,
              fieldId: def.id,
              value: val,
              createdAt: now,
              updatedAt: now
            })
            .run();
        }
      }
    });
  }

  async getRecordValues(recordId: string): Promise<Record<string, string>> {
    const rows = db.select({
      name: customFieldsDefinition.name,
      value: customObjectsValues.value
    })
    .from(customObjectsValues)
    .innerJoin(customFieldsDefinition, eq(customObjectsValues.fieldId, customFieldsDefinition.id))
    .where(eq(customObjectsValues.recordId, recordId))
    .all();

    const result: Record<string, string> = {};
    for (const r of rows) {
      result[r.name] = r.value;
    }
    return result;
  }
}
