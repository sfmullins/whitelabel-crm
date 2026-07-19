import type {
  IOrganisationRepository,
  IContactRepository,
  IEngagementRepository,
  OrganisationListOptions,
  ContactListOptions,
  EngagementListOptions,
} from '../interfaces/IRepositories';
import type {
  OrganisationCreate,
  OrganisationUpdate,
  ContactCreate,
  ContactUpdate,
  EngagementCreate,
  EngagementUpdate,
} from 'shared';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import {
  ContactRepositoryAffectedRowsError,
  ContactRepositoryArchivedError,
  ContactRepositoryInactivePrimaryError,
  ContactRepositoryNotFoundError,
  ContactRepositoryUniquePrimaryError,
} from '../../infrastructure/database/repositories/ContactRepository';

export class OrganisationService {
  constructor(private readonly organisations: IOrganisationRepository) {}

  async create(input: OrganisationCreate) {
    return this.organisations.create(input);
  }

  async get(id: string) {
    const organisation = await this.organisations.getById(id);
    if (!organisation) {
      throw new NotFoundError('Organisation not found');
    }
    return organisation;
  }

  async list(options: OrganisationListOptions) {
    return this.organisations.list(options);
  }

  async update(id: string, patch: OrganisationUpdate) {
    const current = await this.organisations.getById(id, { includeArchived: true });
    if (!current) {
      throw new NotFoundError('Organisation not found');
    }
    if (current.archivedAt) {
      throw new ConflictError('Archived organisations cannot be edited');
    }

    const updated = await this.organisations.update(id, patch);
    if (!updated) {
      throw new NotFoundError('Organisation not found');
    }
    return updated;
  }


  async archive(id: string) {
    const organisation = await this.organisations.archive(id, new Date().toISOString());
    if (!organisation) {
      throw new NotFoundError('Organisation not found');
    }
    return organisation;
  }
}

export class ContactService {
  constructor(
    private readonly organisations: IOrganisationRepository,
    private readonly contacts: IContactRepository,
  ) {}

  private async requireExistingOrganisation(organisationId: string) {
    const organisation = await this.organisations.getById(organisationId, {
      includeArchived: true,
    });
    if (!organisation) {
      throw new NotFoundError('Organisation not found');
    }
    return organisation;
  }

  private async requireActiveOrganisationForCreate(organisationId: string) {
    const organisation = await this.requireExistingOrganisation(organisationId);
    if (organisation.archivedAt) {
      throw new ConflictError('Archived organisations cannot receive new contacts');
    }
    return organisation;
  }

  async create(input: ContactCreate) {
    await this.requireActiveOrganisationForCreate(input.organisationId);
    if (input.isPrimary && input.status !== 'active') {
      throw new ConflictError('An inactive contact cannot be primary');
    }
    try {
      return input.isPrimary ? await this.contacts.createPrimary(input) : await this.contacts.create(input);
    } catch (error) {
      this.translateContactRepositoryError(error);
    }
  }

  async get(id: string) {
    const contact = await this.contacts.getById(id);
    if (!contact) {
      throw new NotFoundError('Contact not found');
    }
    return contact;
  }

  async list(options: ContactListOptions) {
    await this.requireExistingOrganisation(options.organisationId);
    return this.contacts.list(options);
  }

  async update(id: string, patch: ContactUpdate) {
    const current = await this.contacts.getById(id, { includeArchived: true });
    if (!current) {
      throw new NotFoundError('Contact not found');
    }
    if (current.archivedAt) {
      throw new ConflictError('Archived contacts cannot be edited');
    }

    if (patch.status === 'inactive' && patch.isPrimary === true) {
      throw new ConflictError('An inactive contact cannot be primary');
    }

    const effectivePatch = { ...patch };
    if (patch.status === 'inactive') {
      effectivePatch.isPrimary = false;
    }

    const merged = { ...current, ...effectivePatch };
    if (!merged.firstName && !merged.lastName && !merged.email) {
      throw new ValidationError('At least one of firstName, lastName or email is required');
    }
    if (merged.isPrimary && merged.status !== 'active') {
      throw new ConflictError('An inactive contact cannot be primary');
    }

    try {
      const updated = effectivePatch.isPrimary
        ? await this.contacts.updatePrimary(id, effectivePatch)
        : await this.contacts.update(id, effectivePatch);
      if (!updated) {
        throw new NotFoundError('Contact not found');
      }
      return updated;
    } catch (error) {
      this.translateContactRepositoryError(error);
    }
  }

  private translateContactRepositoryError(error: unknown): never {
    if (error instanceof ContactRepositoryNotFoundError) {
      throw new NotFoundError('Contact not found');
    }
    if (error instanceof ContactRepositoryArchivedError) {
      throw new ConflictError('Archived contacts cannot be edited');
    }
    if (error instanceof ContactRepositoryInactivePrimaryError) {
      throw new ConflictError('An inactive contact cannot be primary');
    }
    if (error instanceof ContactRepositoryUniquePrimaryError) {
      throw new ConflictError('Only one active primary contact is allowed');
    }
    if (error instanceof ContactRepositoryAffectedRowsError) {
      throw new ConflictError('Contact primary update could not be completed');
    }
    throw error;
  }

  async archive(id: string) {
    const contact = await this.contacts.archive(id, new Date().toISOString());
    if (!contact) {
      throw new NotFoundError('Contact not found');
    }
    return contact;
  }
}

export class EngagementService {
  constructor(
    private readonly organisations: IOrganisationRepository,
    private readonly contacts: IContactRepository,
    private readonly engagements: IEngagementRepository,
  ) {}

  private async requireExistingOrganisation(organisationId: string) {
    const organisation = await this.organisations.getById(organisationId, {
      includeArchived: true,
    });
    if (!organisation) {
      throw new NotFoundError('Organisation not found');
    }
    return organisation;
  }

  private async requireActiveOrganisationForCreate(organisationId: string) {
    const organisation = await this.requireExistingOrganisation(organisationId);
    if (organisation.archivedAt) {
      throw new ConflictError('Archived organisations cannot receive new engagements');
    }
    return organisation;
  }

  private async validatePrimaryContact(
    organisationId: string,
    contactId: string | null | undefined,
  ) {
    if (contactId === null || contactId === undefined) {
      return;
    }

    const contact = await this.contacts.getById(contactId, { includeArchived: true });
    if (!contact) {
      throw new NotFoundError('Primary contact not found');
    }
    if (contact.organisationId !== organisationId) {
      throw new ConflictError('Primary contact must belong to the engagement organisation');
    }
    if (contact.archivedAt || contact.status !== 'active') {
      throw new ConflictError('Primary contact must be active and non-archived');
    }
  }

  async create(input: EngagementCreate) {
    await this.requireActiveOrganisationForCreate(input.organisationId);
    await this.validatePrimaryContact(input.organisationId, input.primaryContactId);
    return this.engagements.create(input);
  }

  async get(id: string) {
    const engagement = await this.engagements.getById(id);
    if (!engagement) {
      throw new NotFoundError('Engagement not found');
    }
    return engagement;
  }

  async list(options: EngagementListOptions) {
    await this.requireExistingOrganisation(options.organisationId);
    return this.engagements.list(options);
  }

  async update(id: string, patch: EngagementUpdate) {
    const current = await this.engagements.getById(id, { includeArchived: true });
    if (!current) {
      throw new NotFoundError('Engagement not found');
    }
    if (current.archivedAt) {
      throw new ConflictError('Archived engagements cannot be edited');
    }

    const merged = { ...current, ...patch };
    if (merged.endDate !== null && merged.endDate < merged.startDate) {
      throw new ValidationError('End date cannot precede start date');
    }

    await this.validatePrimaryContact(current.organisationId, patch.primaryContactId);

    const updated = await this.engagements.update(id, patch);
    if (!updated) {
      throw new NotFoundError('Engagement not found');
    }
    return updated;
  }

  async archive(id: string) {
    const engagement = await this.engagements.archive(id, new Date().toISOString());
    if (!engagement) {
      throw new NotFoundError('Engagement not found');
    }
    return engagement;
  }
}
