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

const numericQueryValue = (label: string, minimum: number, maximum?: number) => z.preprocess(
  (value) => (value === '' ? Number.NaN : value),
  maximum === undefined
    ? z.coerce.number({ invalid_type_error: `${label} must be a number` }).int().min(minimum)
    : z.coerce.number({ invalid_type_error: `${label} must be a number` }).int().min(minimum).max(maximum),
);

export const paginationQueryFields = {
  includeArchived: includeArchivedQueryField,
  limit: numericQueryValue('Limit', 1, 200).default(50),
  offset: numericQueryValue('Offset', 0).default(0),
};

export function parseRequest<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): z.infer<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError('Request validation failed', parsed.error.format());
  }
  return parsed.data;
}
