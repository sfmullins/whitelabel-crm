import { Router } from 'express';
import { z } from 'zod';
import {
  ActivityCreateBodySchema,
  ActivityListQuerySchema,
  ActivityTypeSchema,
  CustomerActivityCreateBodySchema,
  IsoDateOnlySchema,
  IsoTimestampSchema,
  ActivityUpdateSchema,
} from 'shared';
import { ActivityService, LegacyCustomerActivityService } from '../../application/services/ActivityService';
import { ActivityRepository } from '../../infrastructure/database/repositories/ActivityRepository';
import { ContactRepository } from '../../infrastructure/database/repositories/ContactRepository';
import { EngagementRepository } from '../../infrastructure/database/repositories/EngagementRepository';
import { OrganisationRepository } from '../../infrastructure/database/repositories/OrganisationRepository';
import { LegacyCustomerMappingRepository } from '../../infrastructure/database/LegacyCustomerMappingRepository';
import { includeArchivedQueryField, paginationQueryFields, parseRequest } from './crmValidation';

const router = Router();
const activityService = new ActivityService(
  new OrganisationRepository(),
  new ContactRepository(),
  new EngagementRepository(),
  new ActivityRepository(),
);
const customerActivityService = new LegacyCustomerActivityService(
  new LegacyCustomerMappingRepository(),
  activityService,
);

const OrganisationActivityParamsSchema = z.object({ organisationId: z.string().uuid('Invalid organisation ID') }).strict();
const ActivityParamsSchema = z.object({ activityId: z.string().uuid('Invalid activity ID') }).strict();
const CustomerActivityParamsSchema = z.object({ customerId: z.string().uuid('Invalid customer ID') }).strict();

const ActivityListRequestFields = {
  contactId: z.string().uuid('Invalid contact ID').optional(),
  engagementId: z.string().uuid('Invalid engagement ID').optional(),
  type: ActivityTypeSchema.optional(),
  occurredFrom: IsoTimestampSchema.optional(),
  occurredTo: IsoTimestampSchema.optional(),
  followUpFrom: IsoDateOnlySchema.optional(),
  followUpTo: IsoDateOnlySchema.optional(),
  includeArchived: includeArchivedQueryField,
  limit: paginationQueryFields.limit,
  offset: paginationQueryFields.offset,
};

const ActivityListRequestQuerySchema = z.object(ActivityListRequestFields).strict().pipe(ActivityListQuerySchema);
const CustomerActivityListRequestQuerySchema = z.object({
  engagementId: ActivityListRequestFields.engagementId,
  type: ActivityListRequestFields.type,
  occurredFrom: ActivityListRequestFields.occurredFrom,
  occurredTo: ActivityListRequestFields.occurredTo,
  followUpFrom: ActivityListRequestFields.followUpFrom,
  followUpTo: ActivityListRequestFields.followUpTo,
  includeArchived: ActivityListRequestFields.includeArchived,
  limit: ActivityListRequestFields.limit,
  offset: ActivityListRequestFields.offset,
}).strict().pipe(ActivityListQuerySchema);

router.get('/organisations/:organisationId/activities', async (req, res, next) => {
  try {
    const { organisationId } = parseRequest(OrganisationActivityParamsSchema, req.params);
    const query = parseRequest(ActivityListRequestQuerySchema, req.query);
    res.json(await activityService.list(organisationId, query));
  } catch (error) { next(error); }
});

router.post('/organisations/:organisationId/activities', async (req, res, next) => {
  try {
    const { organisationId } = parseRequest(OrganisationActivityParamsSchema, req.params);
    const body = parseRequest(ActivityCreateBodySchema, req.body);
    res.status(201).json(await activityService.create({ ...body, organisationId }));
  } catch (error) { next(error); }
});

router.get('/activities/:activityId', async (req, res, next) => {
  try {
    const { activityId } = parseRequest(ActivityParamsSchema, req.params);
    res.json(await activityService.get(activityId));
  } catch (error) { next(error); }
});

router.patch('/activities/:activityId', async (req, res, next) => {
  try {
    const { activityId } = parseRequest(ActivityParamsSchema, req.params);
    const patch = parseRequest(ActivityUpdateSchema, req.body);
    res.json(await activityService.update(activityId, patch));
  } catch (error) { next(error); }
});

router.post('/activities/:activityId/archive', async (req, res, next) => {
  try {
    const { activityId } = parseRequest(ActivityParamsSchema, req.params);
    res.json(await activityService.archive(activityId));
  } catch (error) { next(error); }
});

router.post('/activities/:activityId/follow-up/complete', async (req, res, next) => {
  try {
    const { activityId } = parseRequest(ActivityParamsSchema, req.params);
    res.json(await activityService.completeFollowUp(activityId));
  } catch (error) { next(error); }
});

router.post('/activities/:activityId/follow-up/reopen', async (req, res, next) => {
  try {
    const { activityId } = parseRequest(ActivityParamsSchema, req.params);
    res.json(await activityService.reopenFollowUp(activityId));
  } catch (error) { next(error); }
});

router.get('/customers/:customerId/activities', async (req, res, next) => {
  try {
    const { customerId } = parseRequest(CustomerActivityParamsSchema, req.params);
    const query = parseRequest(CustomerActivityListRequestQuerySchema, req.query);
    res.json(await customerActivityService.list(customerId, query));
  } catch (error) { next(error); }
});

router.post('/customers/:customerId/activities', async (req, res, next) => {
  try {
    const { customerId } = parseRequest(CustomerActivityParamsSchema, req.params);
    const body = parseRequest(CustomerActivityCreateBodySchema, req.body);
    res.status(201).json(await customerActivityService.create(customerId, body));
  } catch (error) { next(error); }
});

export default router;
