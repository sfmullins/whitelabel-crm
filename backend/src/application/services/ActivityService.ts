import type {
  Activity,
  ActivityCreate,
  ActivityListQuery,
  ActivityUpdate,
  CustomerActivityCreateBody,
} from 'shared';
import { ConflictError, NotFoundError } from '../errors';
import type {
  IActivityRepository,
  IContactRepository,
  IEngagementRepository,
  ILegacyCustomerMappingRepository,
  IOrganisationRepository,
} from '../interfaces/IRepositories';

type ParentIds = {
  organisationId: string;
  contactId?: string | null;
  engagementId?: string | null;
};

export class ActivityService {
  constructor(
    private readonly organisations: IOrganisationRepository,
    private readonly contacts: IContactRepository,
    private readonly engagements: IEngagementRepository,
    private readonly activities: IActivityRepository,
  ) {}

  private async validateParents(
    input: ParentIds,
    options: {
      creating: boolean;
      currentContactId?: string | null;
      currentEngagementId?: string | null;
    },
  ): Promise<void> {
    const organisation = await this.organisations.getById(input.organisationId, { includeArchived: true });
    if (!organisation) throw new NotFoundError('Organisation not found');
    if (options.creating && organisation.archivedAt) {
      throw new ConflictError('Archived organisations cannot receive new activities');
    }

    if (input.contactId) {
      const contact = await this.contacts.getById(input.contactId, { includeArchived: true });
      if (!contact) throw new NotFoundError('Contact not found');
      if (contact.organisationId !== input.organisationId) {
        throw new ConflictError('Contact must belong to the activity organisation');
      }
      const assignmentChanged = options.creating || input.contactId !== options.currentContactId;
      if (assignmentChanged && contact.archivedAt) {
        throw new ConflictError('Archived contacts cannot be assigned to activities');
      }
    }

    if (input.engagementId) {
      const engagement = await this.engagements.getById(input.engagementId, { includeArchived: true });
      if (!engagement) throw new NotFoundError('Engagement not found');
      if (engagement.organisationId !== input.organisationId) {
        throw new ConflictError('Engagement must belong to the activity organisation');
      }
      const assignmentChanged = options.creating || input.engagementId !== options.currentEngagementId;
      if (assignmentChanged && engagement.archivedAt) {
        throw new ConflictError('Archived engagements cannot be assigned to activities');
      }
    }
  }

  async create(input: ActivityCreate): Promise<Activity> {
    await this.validateParents(input, { creating: true });
    const now = new Date().toISOString();
    return this.activities.create({
      ...input,
      body: input.body.trim(),
      author: input.author?.trim() || 'Local user',
      occurredAt: input.occurredAt ?? now,
      source: 'user',
      sourceReference: null,
    });
  }

  async list(organisationId: string, query: ActivityListQuery, forcedContactId?: string): Promise<Activity[]> {
    const organisation = await this.organisations.getById(organisationId, { includeArchived: true });
    if (!organisation) throw new NotFoundError('Organisation not found');
    return this.activities.list({
      organisationId,
      contactId: forcedContactId ?? query.contactId,
      engagementId: query.engagementId,
      type: query.type,
      occurredFrom: query.occurredFrom,
      occurredTo: query.occurredTo,
      followUpFrom: query.followUpFrom,
      followUpTo: query.followUpTo,
      includeArchived: query.includeArchived,
      limit: query.limit,
      offset: query.offset,
    });
  }

  async get(id: string): Promise<Activity> {
    const activity = await this.activities.getById(id);
    if (!activity) throw new NotFoundError('Activity not found');
    return activity;
  }

  async update(id: string, patch: ActivityUpdate): Promise<Activity> {
    const current = await this.activities.getById(id, { includeArchived: true });
    if (!current) throw new NotFoundError('Activity not found');
    if (current.archivedAt) throw new ConflictError('Archived activities cannot be edited');

    const merged = { ...current, ...patch };
    await this.validateParents({
      organisationId: current.organisationId,
      contactId: merged.contactId,
      engagementId: merged.engagementId,
    }, {
      creating: false,
      currentContactId: current.contactId,
      currentEngagementId: current.engagementId,
    });

    const updated = await this.activities.update(id, {
      ...patch,
      ...(patch.body === undefined ? {} : { body: patch.body.trim() }),
      ...(patch.author === undefined ? {} : { author: patch.author.trim() }),
    });
    if (!updated) throw new NotFoundError('Activity not found');
    return updated;
  }

  async archive(id: string): Promise<Activity> {
    const archived = await this.activities.archive(id, new Date().toISOString());
    if (!archived) throw new NotFoundError('Activity not found');
    return archived;
  }

  async completeFollowUp(id: string): Promise<Activity> {
    const activity = await this.activities.getById(id, { includeArchived: true });
    if (!activity) throw new NotFoundError('Activity not found');
    if (activity.archivedAt) throw new ConflictError('Archived activities cannot be updated');
    if (!activity.followUpDate) throw new ConflictError('Activity does not have a follow-up date');
    const updated = await this.activities.completeFollowUp(id, new Date().toISOString());
    if (!updated) throw new NotFoundError('Activity not found');
    return updated;
  }

  async reopenFollowUp(id: string): Promise<Activity> {
    const activity = await this.activities.getById(id, { includeArchived: true });
    if (!activity) throw new NotFoundError('Activity not found');
    if (activity.archivedAt) throw new ConflictError('Archived activities cannot be updated');
    if (!activity.followUpDate) throw new ConflictError('Activity does not have a follow-up date');
    const updated = await this.activities.reopenFollowUp(id, new Date().toISOString());
    if (!updated) throw new NotFoundError('Activity not found');
    return updated;
  }
}

export class LegacyCustomerActivityService {
  constructor(
    private readonly mappings: ILegacyCustomerMappingRepository,
    private readonly activities: ActivityService,
  ) {}

  async list(customerId: string, query: ActivityListQuery): Promise<Activity[]> {
    const mapping = this.mappings.ensureCustomerMapping(customerId);
    if (!mapping) throw new NotFoundError('Customer not found');
    return this.activities.list(mapping.organisationId, query, mapping.contactId);
  }

  async create(customerId: string, body: CustomerActivityCreateBody): Promise<Activity> {
    const mapping = this.mappings.ensureCustomerMapping(customerId);
    if (!mapping) throw new NotFoundError('Customer not found');
    return this.activities.create({
      ...body,
      organisationId: mapping.organisationId,
      contactId: mapping.contactId,
    });
  }
}
