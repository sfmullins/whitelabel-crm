import { Router } from 'express';
import { z } from 'zod';
import {
  ActivityTypeSchema,
  ContactDirectoryQuerySchema,
  ContactStatusSchema,
  FollowUpBucketSchema,
  FollowUpQuerySchema,
  IsoDateOnlySchema,
  IsoTimestampSchema,
  OrganisationDirectoryQuerySchema,
  OrganisationStatusSchema,
  SavedViewContextSchema,
  SavedViewCreateSchema,
  SavedViewUpdateSchema,
  SearchEntityTypeSchema,
  SearchQuerySchema,
  TimelineEventTypeSchema,
  TimelineFollowUpStatusSchema,
  TimelineQuerySchema,
} from 'shared';
import { WorkspaceService } from '../../application/services/WorkspaceService';
import { WorkspaceRepository } from '../../infrastructure/database/WorkspaceRepository';
import {
  includeArchivedQueryField,
  paginationQueryFields,
  parseRequest,
} from './crmValidation';

const router = Router();
const service = new WorkspaceService(new WorkspaceRepository());

const IdParamsSchema = z.object({ id: z.string().uuid('Invalid ID') }).strict();
const OrganisationParamsSchema = z.object({ organisationId: z.string().uuid('Invalid organisation ID') }).strict();

const optionalString = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  return value;
}, z.string().trim().optional());

const commaSeparated = <T extends z.ZodTypeAny>(item: T) => z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  return String(value).split(',').map((entry) => entry.trim()).filter(Boolean);
}, z.array(item).optional());

const OrganisationDirectoryRequestSchema = z.object({
  status: OrganisationStatusSchema.optional(),
  industry: optionalString,
  country: optionalString,
  search: optionalString,
  includeArchived: includeArchivedQueryField,
  sort: z.enum(['name_asc', 'updated_desc', 'recent_activity', 'next_follow_up']).default('name_asc'),
  ...paginationQueryFields,
}).strict().pipe(OrganisationDirectoryQuerySchema);

const ContactDirectoryRequestSchema = z.object({
  organisationId: z.string().uuid('Invalid organisation ID').optional(),
  status: ContactStatusSchema.optional(),
  search: optionalString,
  includeArchived: includeArchivedQueryField,
  ...paginationQueryFields,
}).strict().pipe(ContactDirectoryQuerySchema);

const SearchRequestSchema = z.object({
  q: z.string().trim().min(2).max(120),
  types: commaSeparated(SearchEntityTypeSchema),
  organisationId: z.string().uuid('Invalid organisation ID').optional(),
  includeArchived: includeArchivedQueryField,
  limit: paginationQueryFields.limit,
  offset: paginationQueryFields.offset,
}).strict().pipe(SearchQuerySchema);

const TimelineRequestSchema = z.object({
  eventTypes: commaSeparated(TimelineEventTypeSchema),
  contactId: z.string().uuid('Invalid contact ID').optional(),
  engagementId: z.string().uuid('Invalid engagement ID').optional(),
  from: IsoTimestampSchema.optional(),
  to: IsoTimestampSchema.optional(),
  activityType: ActivityTypeSchema.optional(),
  followUpStatus: TimelineFollowUpStatusSchema.optional(),
  limit: paginationQueryFields.limit,
  offset: paginationQueryFields.offset,
}).strict().pipe(TimelineQuerySchema);

const FollowUpRequestSchema = z.object({
  bucket: FollowUpBucketSchema.default('open'),
  organisationId: z.string().uuid('Invalid organisation ID').optional(),
  contactId: z.string().uuid('Invalid contact ID').optional(),
  engagementId: z.string().uuid('Invalid engagement ID').optional(),
  type: ActivityTypeSchema.optional(),
  from: IsoDateOnlySchema.optional(),
  to: IsoDateOnlySchema.optional(),
  limit: paginationQueryFields.limit,
  offset: paginationQueryFields.offset,
}).strict().pipe(FollowUpQuerySchema);

const SavedViewListSchema = z.object({
  context: SavedViewContextSchema.optional(),
  pinnedOnly: z.preprocess((value) => value === 'true' || value === true, z.boolean().default(false)),
}).strict();

router.get('/workspace/organisations', async (req, res, next) => {
  try {
    const query = parseRequest(OrganisationDirectoryRequestSchema, req.query);
    res.json(await service.listOrganisations(query));
  } catch (error) {
    next(error);
  }
});

router.get('/workspace/contacts', async (req, res, next) => {
  try {
    const query = parseRequest(ContactDirectoryRequestSchema, req.query);
    res.json(await service.listContacts(query));
  } catch (error) {
    next(error);
  }
});

router.get('/workspace/organisations/:organisationId', async (req, res, next) => {
  try {
    const { organisationId } = parseRequest(OrganisationParamsSchema, req.params);
    res.json(await service.getOrganisationWorkspace(organisationId));
  } catch (error) {
    next(error);
  }
});

router.get('/organisations/:organisationId/timeline', async (req, res, next) => {
  try {
    const { organisationId } = parseRequest(OrganisationParamsSchema, req.params);
    const query = parseRequest(TimelineRequestSchema, req.query);
    res.json(await service.listTimeline(organisationId, query));
  } catch (error) {
    next(error);
  }
});

router.get('/follow-ups', async (req, res, next) => {
  try {
    const query = parseRequest(FollowUpRequestSchema, req.query);
    res.json(await service.listFollowUps(query));
  } catch (error) {
    next(error);
  }
});

router.get('/saved-views', async (req, res, next) => {
  try {
    const query = parseRequest(SavedViewListSchema, req.query);
    res.json(await service.listSavedViews(query.context, query.pinnedOnly));
  } catch (error) {
    next(error);
  }
});

router.post('/saved-views', async (req, res, next) => {
  try {
    const input = parseRequest(SavedViewCreateSchema, req.body);
    res.status(201).json(await service.createSavedView(input));
  } catch (error) {
    next(error);
  }
});

router.patch('/saved-views/:id', async (req, res, next) => {
  try {
    const { id } = parseRequest(IdParamsSchema, req.params);
    const patch = parseRequest(SavedViewUpdateSchema, req.body);
    res.json(await service.updateSavedView(id, patch));
  } catch (error) {
    next(error);
  }
});

router.delete('/saved-views/:id', async (req, res, next) => {
  try {
    const { id } = parseRequest(IdParamsSchema, req.params);
    await service.deleteSavedView(id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get('/workspace/dashboard', async (_req, res, next) => {
  try {
    res.json(await service.getDashboard());
  } catch (error) {
    next(error);
  }
});

export default router;
