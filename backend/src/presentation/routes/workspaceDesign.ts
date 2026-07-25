import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { getSqliteConnection } from '../../infrastructure/database/connection';
import type { CrmRequest } from '../middleware/security';

const router = Router();
const relationshipSchema = z.object({
  sourceDefinitionId: z.string().uuid(),
  targetType: z.enum(['customer', 'custom_object']),
  targetDefinitionId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).regex(/^[a-z0-9_]+$/),
  label: z.string().trim().min(1),
  cardinality: z.enum(['many-to-one', 'one-to-one']),
}).superRefine((value, context) => {
  if (value.targetType === 'customer' && value.targetDefinitionId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Customer relationships cannot have a custom target object' });
  }
  if (value.targetType === 'custom_object' && !value.targetDefinitionId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Select the object to connect' });
  }
});

const navigationSchema = z.object({
  scope: z.enum(['organisation', 'personal']),
  orderedKeys: z.array(z.string().trim().min(1).max(180)).max(200)
    .refine((keys) => new Set(keys).size === keys.length, 'Navigation entries must be unique'),
});

function identity(request: CrmRequest) {
  const current = request.crm?.identity;
  if (!current) throw new Error('Authenticated identity is required');
  return current;
}

function isAdministrator(request: CrmRequest): boolean {
  return Boolean(request.crm?.identity?.roles.some((role) => role.key === 'owner' || role.key === 'administrator'));
}

router.get('/', (request, response, next) => {
  try {
    const connection = getSqliteConnection();
    const relationships = connection.prepare(`
      SELECT r.id,r.source_definition_id AS sourceDefinitionId,r.target_type AS targetType,
        r.target_definition_id AS targetDefinitionId,r.name,r.label,r.cardinality,r.created_at AS createdAt,
        source.name AS sourceName,source.plural_name AS sourcePluralName,
        target.name AS targetName,target.plural_name AS targetPluralName
      FROM custom_object_relationships r
      JOIN custom_objects_definition source ON source.id=r.source_definition_id
      LEFT JOIN custom_objects_definition target ON target.id=r.target_definition_id
      ORDER BY source.plural_name,r.label
    `).all();
    response.json({ relationships });
  } catch (error) {
    next(error);
  }
});

router.post('/relationships', (request, response, next) => {
  try {
    const input = relationshipSchema.parse(request.body);
    const connection = getSqliteConnection();
    const source = connection.prepare(`SELECT id FROM custom_objects_definition WHERE id=?`).get(input.sourceDefinitionId);
    if (!source) return response.status(404).json({ error: 'SOURCE_OBJECT_NOT_FOUND', message: 'The source object no longer exists' });
    if (input.targetType === 'custom_object') {
      const target = connection.prepare(`SELECT id FROM custom_objects_definition WHERE id=?`).get(input.targetDefinitionId);
      if (!target) return response.status(404).json({ error: 'TARGET_OBJECT_NOT_FOUND', message: 'The target object no longer exists' });
    }
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    connection.prepare(`
      INSERT INTO custom_object_relationships(
        id,source_definition_id,target_type,target_definition_id,name,label,cardinality,created_at
      ) VALUES(?,?,?,?,?,?,?,?)
    `).run(id, input.sourceDefinitionId, input.targetType, input.targetDefinitionId ?? null, input.name, input.label, input.cardinality, createdAt);
    response.status(201).json({ id, ...input, targetDefinitionId: input.targetDefinitionId ?? null, createdAt });
  } catch (error) {
    next(error);
  }
});

router.delete('/relationships/:id', (request, response, next) => {
  try {
    const result = getSqliteConnection().prepare(`DELETE FROM custom_object_relationships WHERE id=?`).run(request.params.id);
    if (!result.changes) return response.status(404).json({ error: 'RELATIONSHIP_NOT_FOUND', message: 'The relationship no longer exists' });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/navigation', (request: CrmRequest, response, next) => {
  try {
    const current = identity(request);
    const rows = getSqliteConnection().prepare(`
      SELECT scope_key,ordered_keys_json FROM workspace_navigation_preferences
      WHERE scope_key IN ('organisation',?)
    `).all(`user:${current.id}`) as Array<{ scope_key: string; ordered_keys_json: string }>;
    const read = (key: string) => {
      const value = rows.find((row) => row.scope_key === key)?.ordered_keys_json;
      try { return value ? JSON.parse(value) as string[] : []; } catch { return []; }
    };
    response.json({
      organisationOrder: read('organisation'),
      personalOrder: read(`user:${current.id}`),
      canManageOrganisation: isAdministrator(request),
    });
  } catch (error) {
    next(error);
  }
});

router.put('/navigation', (request: CrmRequest, response, next) => {
  try {
    const input = navigationSchema.parse(request.body);
    const current = identity(request);
    if (input.scope === 'organisation' && !isAdministrator(request)) {
      return response.status(403).json({ error: 'FORBIDDEN', message: 'Only an owner or administrator can change organisation navigation' });
    }
    const scopeKey = input.scope === 'organisation' ? 'organisation' : `user:${current.id}`;
    const scopeType = input.scope === 'organisation' ? 'organisation' : 'user';
    const userId = input.scope === 'organisation' ? null : current.id;
    const timestamp = new Date().toISOString();
    getSqliteConnection().prepare(`
      INSERT INTO workspace_navigation_preferences(
        scope_key,scope_type,user_id,ordered_keys_json,updated_by_user_id,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(scope_key) DO UPDATE SET
        ordered_keys_json=excluded.ordered_keys_json,
        updated_by_user_id=excluded.updated_by_user_id,
        updated_at=excluded.updated_at
    `).run(scopeKey, scopeType, userId, JSON.stringify(input.orderedKeys), current.id, timestamp, timestamp);
    response.json({ scope: input.scope, orderedKeys: input.orderedKeys, updatedAt: timestamp });
  } catch (error) {
    next(error);
  }
});

export default router;
