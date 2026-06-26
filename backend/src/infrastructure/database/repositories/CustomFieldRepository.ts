import { ICustomFieldRepository } from '../../../application/interfaces/IRepositories';
import { CustomFieldDefinition } from 'shared';
import { db } from '../connection';
import { customFieldsDefinition, customFieldsValues } from '../schema';
import { eq, and, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { cleanNulls } from './utils';

export class CustomFieldRepository implements ICustomFieldRepository {
  private mapDefRow(row: any): CustomFieldDefinition {
    const cleaned = cleanNulls(row);
    return {
      ...cleaned,
      options: row.options ? JSON.parse(row.options) : [],
      required: Boolean(row.required)
    };
  }

  async createDefinition(def: CustomFieldDefinition): Promise<CustomFieldDefinition> {
    const id = def.id || randomUUID();
    const now = new Date().toISOString();
    const row = {
      ...def,
      id,
      options: JSON.stringify(def.options || []),
      required: def.required ? 1 : 0,
      createdAt: now
    };
    db.insert(customFieldsDefinition).values(row as any).run();
    return this.mapDefRow(row);
  }

  async getDefinitions(entityType: string): Promise<CustomFieldDefinition[]> {
    const rows = db.select()
      .from(customFieldsDefinition)
      .where(eq(customFieldsDefinition.entityType, entityType))
      .all();
    return rows.map(r => this.mapDefRow(r));
  }

  async getDefinitionByName(entityType: string, name: string): Promise<CustomFieldDefinition | null> {
    const row = db.select()
      .from(customFieldsDefinition)
      .where(and(eq(customFieldsDefinition.entityType, entityType), eq(customFieldsDefinition.name, name)))
      .get();
    return row ? this.mapDefRow(row) : null;
  }

  async deleteDefinition(id: string): Promise<void> {
    db.delete(customFieldsDefinition).where(eq(customFieldsDefinition.id, id)).run();
  }

  async saveValues(entityId: string, values: Record<string, string>): Promise<void> {
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
          .from(customFieldsValues)
          .where(
            and(
              eq(customFieldsValues.entityId, entityId),
              eq(customFieldsValues.fieldId, def.id)
            )
          )
          .get();

        if (existing) {
          tx.update(customFieldsValues)
            .set({ value: val, updatedAt: now })
            .where(eq(customFieldsValues.id, existing.id))
            .run();
        } else {
          tx.insert(customFieldsValues)
            .values({
              id: randomUUID(),
              entityId,
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

  async getValues(entityId: string): Promise<Record<string, string>> {
    const rows = db.select({
      name: customFieldsDefinition.name,
      value: customFieldsValues.value
    })
    .from(customFieldsValues)
    .innerJoin(customFieldsDefinition, eq(customFieldsValues.fieldId, customFieldsDefinition.id))
    .where(eq(customFieldsValues.entityId, entityId))
    .all();

    const result: Record<string, string> = {};
    for (const r of rows) {
      result[r.name] = r.value;
    }
    return result;
  }
}
