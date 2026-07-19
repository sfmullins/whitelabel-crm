import { z } from 'zod';
import { ValidationError } from '../../application/errors';

export const IdParamSchema = z.object({
  id: z.string().uuid('Invalid ID'),
}).strict();

export const OrganisationIdParamSchema = z.object({
  organisationId: z.string().uuid('Invalid organisation ID'),
}).strict();

export const includeArchivedQueryField = z.enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true');

export const paginationQueryFields = {
  includeArchived: includeArchivedQueryField,
  limit: z.coerce.number().int().min(0).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
};

export function parseRequest(schema: z.ZodTypeAny, value: unknown): any {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError('Request validation failed', parsed.error.format());
  }
  return parsed.data;
}
