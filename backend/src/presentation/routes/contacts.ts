import { Router } from 'express';
import { z } from 'zod';
import {
  ContactCreateBodySchema,
  ContactCreateSchema,
  ContactStatusSchema,
  ContactUpdateSchema,
} from 'shared';
import { ContactService } from '../../application/services/CrmDomainServices';
import { ContactRepository } from '../../infrastructure/database/repositories/ContactRepository';
import { OrganisationRepository } from '../../infrastructure/database/repositories/OrganisationRepository';
import {
  IdParamSchema,
  OrganisationIdParamSchema,
  paginationQueryFields,
  parseRequest,
} from './crmValidation';

const router = Router();
const service = new ContactService(
  new OrganisationRepository(),
  new ContactRepository(),
);

const ContactListQuerySchema = z.object({
  status: ContactStatusSchema.optional(),
  ...paginationQueryFields,
}).strict();

router.post('/organisations/:organisationId/contacts', async (req, res, next) => {
  try {
    const { organisationId } = parseRequest(OrganisationIdParamSchema, req.params);
    const body = parseRequest(ContactCreateBodySchema, req.body);
    const input = parseRequest(ContactCreateSchema, { ...body, organisationId });
    res.status(201).json(await service.create(input));
  } catch (error) {
    next(error);
  }
});

router.get('/organisations/:organisationId/contacts', async (req, res, next) => {
  try {
    const { organisationId } = parseRequest(OrganisationIdParamSchema, req.params);
    const query = parseRequest(ContactListQuerySchema, req.query);
    res.json(await service.list({ ...query, organisationId }));
  } catch (error) {
    next(error);
  }
});

router.get('/contacts/:id', async (req, res, next) => {
  try {
    const { id } = parseRequest(IdParamSchema, req.params);
    res.json(await service.get(id));
  } catch (error) {
    next(error);
  }
});

router.patch('/contacts/:id', async (req, res, next) => {
  try {
    const { id } = parseRequest(IdParamSchema, req.params);
    const patch = parseRequest(ContactUpdateSchema, req.body);
    res.json(await service.update(id, patch));
  } catch (error) {
    next(error);
  }
});

router.post('/contacts/:id/archive', async (req, res, next) => {
  try {
    const { id } = parseRequest(IdParamSchema, req.params);
    res.json(await service.archive(id));
  } catch (error) {
    next(error);
  }
});

export default router;
