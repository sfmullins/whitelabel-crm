import type {
  ContactDirectoryQuery,
  FollowUpQuery,
  OrganisationDirectoryQuery,
  SavedViewCreate,
  SavedViewUpdate,
  SearchQuery,
  TimelineQuery,
} from 'shared';
import type { IWorkspaceRepository } from '../interfaces/IRepositories';
import { ConflictError, NotFoundError } from '../errors';

export class WorkspaceService {
  constructor(private readonly repository: IWorkspaceRepository) {}

  search(query: SearchQuery) {
    return this.repository.search(query);
  }

  listOrganisations(query: OrganisationDirectoryQuery) {
    return this.repository.listOrganisations(query);
  }

  listContacts(query: ContactDirectoryQuery) {
    return this.repository.listContacts(query);
  }

  async getOrganisationWorkspace(organisationId: string) {
    const workspace = await this.repository.getOrganisationWorkspace(organisationId);
    if (!workspace) throw new NotFoundError('Organisation not found');
    return workspace;
  }

  async listTimeline(organisationId: string, query: TimelineQuery) {
    const workspace = await this.repository.getOrganisationWorkspace(organisationId);
    if (!workspace) throw new NotFoundError('Organisation not found');
    return this.repository.listTimeline(organisationId, query);
  }

  listFollowUps(query: FollowUpQuery) {
    return this.repository.listFollowUps(query);
  }

  async completeFollowUp(activityId: string) {
    const updated = await this.repository.completeFollowUp(activityId, new Date().toISOString());
    if (!updated) throw new ConflictError('Activity must exist, remain active and have a follow-up date');
    return { activityId, completed: true };
  }

  async reopenFollowUp(activityId: string) {
    const updated = await this.repository.reopenFollowUp(activityId, new Date().toISOString());
    if (!updated) throw new ConflictError('Activity must exist, remain active and have a follow-up date');
    return { activityId, completed: false };
  }

  listSavedViews(context?: string, pinnedOnly = false) {
    return this.repository.listSavedViews(context, pinnedOnly);
  }

  async createSavedView(input: SavedViewCreate) {
    try {
      return await this.repository.createSavedView(input);
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed: saved_views.context, saved_views.normalized_name')) {
        throw new ConflictError('A saved view with this name already exists in the selected context');
      }
      throw error;
    }
  }

  async updateSavedView(id: string, patch: SavedViewUpdate) {
    try {
      const view = await this.repository.updateSavedView(id, patch);
      if (!view) throw new NotFoundError('Saved view not found');
      return view;
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed: saved_views.context, saved_views.normalized_name')) {
        throw new ConflictError('A saved view with this name already exists in the selected context');
      }
      throw error;
    }
  }

  async deleteSavedView(id: string) {
    const deleted = await this.repository.deleteSavedView(id);
    if (!deleted) throw new NotFoundError('Saved view not found');
  }

  getDashboard() {
    return this.repository.getDashboard();
  }
}
