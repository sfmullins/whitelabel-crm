import { Router } from 'express';
import { z } from 'zod';
import {
  OrganisationCreateSchema,
  OrganisationUpdateSchema,
  OrganisationStatusSchema,
} from 'shared';
import { OrganisationService } from '../../application/services/CrmDomainServices';
import { OrganisationRepository } from '../../infrastructure/database/repositories/OrganisationRepository';
import { IdParamSchema, paginationQueryFields, parseRequest } from './crmValidation';

const router = Router();
const service = new OrganisationService(new OrganisationRepository());

const OrganisationListQuerySchema = z.object({
  status: OrganisationStatusSchema.optional(),
  search: z.string().trim().optional(),
  ...paginationQueryFields,
}).strict();

router.post('/', async (req, res, next) => {
  try {
    const input = parseRequest(OrganisationCreateSchema, req.body);
    res.status(201).json(await service.create(input));
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const query = parseRequest(OrganisationListQuerySchema, req.query);
    res.json(await service.list(query));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = parseRequest(IdParamSchema, req.params);
    res.json(await service.get(id));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = parseRequest(IdParamSchema, req.params);
    const patch = parseRequest(OrganisationUpdateSchema, req.body);
    res.json(await service.update(id, patch));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/archive', async (req, res, next) => {
  try {
    const { id } = parseRequest(IdParamSchema, req.params);
    res.json(await service.archive(id));
  } catch (error) {
    next(error);
  }
});

export default router;
