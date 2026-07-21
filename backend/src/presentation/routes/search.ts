import { Router } from 'express';
import { z } from 'zod';
import { SearchEntityTypeSchema, SearchQuerySchema } from 'shared';
import { WorkspaceService } from '../../application/services/WorkspaceService';
import { WorkspaceRepository } from '../../infrastructure/database/WorkspaceRepository';
import { includeArchivedQueryField, paginationQueryFields, parseRequest } from './crmValidation';

const router = Router();
const service = new WorkspaceService(new WorkspaceRepository());

const SearchRequestSchema = z.object({
  q: z.string().trim().min(2, 'Search requires at least two characters').max(120),
  types: z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (Array.isArray(value)) return value;
    return String(value).split(',').map((entry) => entry.trim()).filter(Boolean);
  }, z.array(SearchEntityTypeSchema).max(6).optional()),
  organisationId: z.string().uuid('Invalid organisation ID').optional(),
  includeArchived: includeArchivedQueryField,
  limit: paginationQueryFields.limit,
  offset: paginationQueryFields.offset,
}).strict().pipe(SearchQuerySchema);

router.get('/', async (req, res, next) => {
  try {
    const query = parseRequest(SearchRequestSchema, req.query);
    res.json(await service.search(query));
  } catch (error) {
    next(error);
  }
});

export default router;
