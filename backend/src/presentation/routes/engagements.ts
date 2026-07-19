import { Router } from 'express';
import { z } from 'zod';
import {
  EngagementCreateBodySchema,
  EngagementCreateSchema,
  EngagementStatusSchema,
  EngagementUpdateSchema,
} from 'shared';
import { EngagementService } from '../../application/services/CrmDomainServices';
import { ContactRepository } from '../../infrastructure/database/repositories/ContactRepository';
import { EngagementRepository } from '../../infrastructure/database/repositories/EngagementRepository';
import { OrganisationRepository } from '../../infrastructure/database/repositories/OrganisationRepository';
import {
  IdParamSchema,
  OrganisationIdParamSchema,
  paginationQueryFields,
  parseRequest,
} from './crmValidation';

const router = Router();
const service = new EngagementService(
  new OrganisationRepository(),
  new ContactRepository(),
  new EngagementRepository(),
);

const EngagementListQuerySchema = z.object({
  status: EngagementStatusSchema.optional(),
  ...paginationQueryFields,
}).strict();

router.post('/organisations/:organisationId/engagements', async (req, res, next) => {
  try {
    const { organisationId } = parseRequest(OrganisationIdParamSchema, req.params);
    const body = parseRequest(EngagementCreateBodySchema, req.body);
    const input = parseRequest(EngagementCreateSchema, { ...body, organisationId });
    res.status(201).json(await service.create(input));
  } catch (error) {
    next(error);
  }
});

router.get('/organisations/:organisationId/engagements', async (req, res, next) => {
  try {
    const { organisationId } = parseRequest(OrganisationIdParamSchema, req.params);
    const query = parseRequest(EngagementListQuerySchema, req.query);
    res.json(await service.list({ ...query, organisationId }));
  } catch (error) {
    next(error);
  }
});

router.get('/engagements/:id', async (req, res, next) => {
  try {
    const { id } = parseRequest(IdParamSchema, req.params);
    res.json(await service.get(id));
  } catch (error) {
    next(error);
  }
});

router.patch('/engagements/:id', async (req, res, next) => {
  try {
    const { id } = parseRequest(IdParamSchema, req.params);
    const patch = parseRequest(EngagementUpdateSchema, req.body);
    res.json(await service.update(id, patch));
  } catch (error) {
    next(error);
  }
});

router.post('/engagements/:id/archive', async (req, res, next) => {
  try {
    const { id } = parseRequest(IdParamSchema, req.params);
    res.json(await service.archive(id));
  } catch (error) {
    next(error);
  }
});

export default router;
