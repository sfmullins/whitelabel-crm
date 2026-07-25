import { ICustomObjectRepository } from '../../../application/interfaces/IRepositories';
import { CustomObjectDefinition, CustomObjectRecord } from 'shared';
import { db,sqlite } from '../connection';
import { customObjectsDefinition, customObjectsRecords, customObjectsValues, customFieldsDefinition } from '../schema';
import { eq, and, inArray, count } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { cleanNulls } from './utils';
import { assertResourceNotExtensionOwned,getExtensionResourceOwner,isExtensionResourceEnabled,LEGACY_CUSTOMISATIONS_PACKAGE_KEY,releaseLegacyResourceBinding } from '../ExtensionVisibility';

export class CustomObjectRepository implements ICustomObjectRepository {
  private mapDefRow(row: any): CustomObjectDefinition {
    return cleanNulls(row);
  }

  private mapRecordRow(row: any, values: Record<string, string>): CustomObjectRecord {
    const cleaned = cleanNulls(row);
    return {
      ...cleaned,
      values,
      relationships:this.getRecordRelationships(row.id),
    };
  }

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
    return rows.filter((row)=>isExtensionResourceEnabled(sqlite,'custom_entity',row.id)).map(r => this.mapDefRow(r));
  }

  async getDefinitionByApiName(apiName: string): Promise<CustomObjectDefinition | null> {
    const row = db.select()
      .from(customObjectsDefinition)
      .where(eq(customObjectsDefinition.apiName, apiName))
      .get();
    return row&&isExtensionResourceEnabled(sqlite,'custom_entity',row.id) ? this.mapDefRow(row) : null;
  }

  async getDefinitionImpact(id:string):Promise<{
    id:string;name:string;apiName:string;recordCount:number;fieldCount:number;
    relationshipCount:number;linkedRecordCount:number;managedByExtension:string|null;
  }|null>{
    const definition=sqlite.prepare(`
      SELECT id,name,api_name AS apiName FROM custom_objects_definition WHERE id=?
    `).get(id) as {id:string;name:string;apiName:string}|undefined;
    if(!definition)return null;
    const recordCount=(sqlite.prepare(`SELECT count(*) AS count FROM custom_objects_records WHERE object_definition_id=?`).get(id) as {count:number}).count;
    const fieldCount=(sqlite.prepare(`SELECT count(*) AS count FROM custom_fields_definition WHERE entity_type=?`).get(definition.apiName) as {count:number}).count;
    const relationshipCount=(sqlite.prepare(`
      SELECT count(*) AS count FROM custom_object_relationships
      WHERE source_definition_id=? OR target_definition_id=?
    `).get(id,id) as {count:number}).count;
    const linkedRecordCount=(sqlite.prepare(`
      SELECT count(*) AS count FROM custom_object_record_relationships rr
      JOIN custom_object_relationships r ON r.id=rr.relationship_id
      WHERE r.source_definition_id=? OR r.target_definition_id=?
    `).get(id,id) as {count:number}).count;
    const fieldIds=(sqlite.prepare(`SELECT id FROM custom_fields_definition WHERE entity_type=?`).all(definition.apiName) as Array<{id:string}>).map((row)=>row.id);
    const owners=[
      getExtensionResourceOwner(sqlite,'custom_entity',id),
      ...fieldIds.map((fieldId)=>getExtensionResourceOwner(sqlite,'custom_field',fieldId)),
    ];
    const managedByExtension=owners.find((owner)=>owner&&owner.packageKey!==LEGACY_CUSTOMISATIONS_PACKAGE_KEY)?.packageKey??null;
    return {...definition,recordCount,fieldCount,relationshipCount,linkedRecordCount,managedByExtension};
  }

  async deleteDefinition(id: string): Promise<void> {
    const impact=await this.getDefinitionImpact(id);
    if(!impact)throw new Error('Custom object definition was not found');
    assertResourceNotExtensionOwned(sqlite,'custom_entity',id);
    const fieldIds=(sqlite.prepare(`SELECT id FROM custom_fields_definition WHERE entity_type=?`).all(impact.apiName) as Array<{id:string}>).map((row)=>row.id);
    for(const fieldId of fieldIds)assertResourceNotExtensionOwned(sqlite,'custom_field',fieldId);
    sqlite.transaction(()=>{
      releaseLegacyResourceBinding(sqlite,'custom_entity',id);
      for(const fieldId of fieldIds)releaseLegacyResourceBinding(sqlite,'custom_field',fieldId);
      sqlite.prepare(`DELETE FROM custom_fields_definition WHERE entity_type=?`).run(impact.apiName);
      sqlite.prepare(`DELETE FROM custom_objects_definition WHERE id=?`).run(id);
    })();
  }

  async updateDefinition(id:string,input:{name:string;pluralName:string;description?:string}):Promise<CustomObjectDefinition>{
    assertResourceNotExtensionOwned(sqlite,'custom_entity',id);
    db.update(customObjectsDefinition).set(input).where(eq(customObjectsDefinition.id,id)).run();
    const row=db.select().from(customObjectsDefinition).where(eq(customObjectsDefinition.id,id)).get();
    if(!row)throw new Error('Custom object definition was not found');
    return this.mapDefRow(row);
  }

  async createRecord(record: Omit<CustomObjectRecord, 'values'>): Promise<CustomObjectRecord> {
    if(!isExtensionResourceEnabled(sqlite,'custom_entity',record.objectDefinitionId))throw new Error('Custom object definition is disabled');
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
    if(!isExtensionResourceEnabled(sqlite,'custom_entity',definitionId))return [];
    const conditions = [eq(customObjectsRecords.objectDefinitionId, definitionId)];
    if (customerId) conditions.push(eq(customObjectsRecords.customerId, customerId));
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

  async countRecords(definitionId:string):Promise<number>{
    if(!isExtensionResourceEnabled(sqlite,'custom_entity',definitionId))return 0;
    const result=db.select({value:count(customObjectsRecords.id)}).from(customObjectsRecords)
      .where(eq(customObjectsRecords.objectDefinitionId,definitionId)).get();
    return result?.value??0;
  }

  async getRecordById(recordId: string): Promise<CustomObjectRecord | null> {
    const row = db.select().from(customObjectsRecords).where(eq(customObjectsRecords.id, recordId)).get();
    if (!row||!isExtensionResourceEnabled(sqlite,'custom_entity',row.objectDefinitionId)) return null;
    const values = await this.getRecordValues(row.id);
    return this.mapRecordRow(row, values);
  }

  async deleteRecord(recordId: string): Promise<void> {
    db.delete(customObjectsRecords).where(eq(customObjectsRecords.id, recordId)).run();
  }

  async saveRecordValues(recordId: string, values: Record<string, string>): Promise<void> {
    const names = Object.keys(values);
    if (names.length === 0) return;
    const record=db.select().from(customObjectsRecords).where(eq(customObjectsRecords.id,recordId)).get();
    if(!record||!isExtensionResourceEnabled(sqlite,'custom_entity',record.objectDefinitionId))throw new Error('Custom object record is unavailable');

    const definition=db.select().from(customObjectsDefinition)
      .where(eq(customObjectsDefinition.id,record.objectDefinitionId)).get();
    if(!definition)throw new Error('Custom object definition is unavailable');

    const fieldDefs = db.select()
      .from(customFieldsDefinition)
      .where(and(
        eq(customFieldsDefinition.entityType,definition.apiName),
        inArray(customFieldsDefinition.name, names),
      ))
      .all()
      .filter((definition)=>isExtensionResourceEnabled(sqlite,'custom_field',definition.id));

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

  saveRecordRelationships(recordId:string,relationships:Record<string,string>):void{
    const record=sqlite.prepare(`SELECT object_definition_id AS definitionId FROM custom_objects_records WHERE id=?`).get(recordId) as {definitionId:string}|undefined;
    if(!record)throw new Error('Custom object record is unavailable');
    const timestamp=new Date().toISOString();
    sqlite.transaction(()=>{
      for(const [relationshipId,targetId] of Object.entries(relationships)){
        const relationship=sqlite.prepare(`
          SELECT source_definition_id AS sourceDefinitionId,target_type AS targetType,target_definition_id AS targetDefinitionId,cardinality
          FROM custom_object_relationships WHERE id=?
        `).get(relationshipId) as {sourceDefinitionId:string;targetType:'customer'|'custom_object';targetDefinitionId:string|null;cardinality:'many-to-one'|'one-to-one'}|undefined;
        if(!relationship||relationship.sourceDefinitionId!==record.definitionId)throw new Error('Relationship does not belong to this object');
        if(relationship.targetType==='customer'){
          if(!sqlite.prepare(`SELECT 1 FROM customers WHERE id=?`).get(targetId))throw new Error('Connected customer was not found');
        }else{
          const target=sqlite.prepare(`SELECT object_definition_id AS definitionId FROM custom_objects_records WHERE id=?`).get(targetId) as {definitionId:string}|undefined;
          if(!target||target.definitionId!==relationship.targetDefinitionId)throw new Error('Connected record does not match the relationship target');
        }
        if(relationship.cardinality==='one-to-one'){
          const duplicate=sqlite.prepare(`
            SELECT 1 FROM custom_object_record_relationships
            WHERE relationship_id=? AND source_record_id<>?
              AND coalesce(target_customer_id,target_record_id)=?
          `).get(relationshipId,recordId,targetId);
          if(duplicate)throw new Error('This target is already connected through a one-to-one relationship');
        }
        sqlite.prepare(`
          INSERT INTO custom_object_record_relationships(
            relationship_id,source_record_id,target_customer_id,target_record_id,created_at
          ) VALUES(?,?,?,?,?)
          ON CONFLICT(relationship_id,source_record_id) DO UPDATE SET
            target_customer_id=excluded.target_customer_id,target_record_id=excluded.target_record_id
        `).run(relationshipId,recordId,relationship.targetType==='customer'?targetId:null,relationship.targetType==='custom_object'?targetId:null,timestamp);
      }
    })();
  }

  getRecordRelationships(recordId:string):Record<string,string>{
    const rows=sqlite.prepare(`
      SELECT relationship_id AS relationshipId,coalesce(target_customer_id,target_record_id) AS targetId
      FROM custom_object_record_relationships WHERE source_record_id=?
    `).all(recordId) as Array<{relationshipId:string;targetId:string}>;
    return Object.fromEntries(rows.map((row)=>[row.relationshipId,row.targetId]));
  }

  async getRecordValues(recordId: string): Promise<Record<string, string>> {
    const rows = db.select({
      id: customFieldsDefinition.id,
      name: customFieldsDefinition.name,
      value: customObjectsValues.value
    })
    .from(customObjectsValues)
    .innerJoin(customFieldsDefinition, eq(customObjectsValues.fieldId, customFieldsDefinition.id))
    .where(eq(customObjectsValues.recordId, recordId))
    .all();

    const result: Record<string, string> = {};
    for (const r of rows) {
      if(isExtensionResourceEnabled(sqlite,'custom_field',r.id))result[r.name] = r.value;
    }
    return result;
  }
}
