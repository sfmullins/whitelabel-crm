import fs from 'fs';
import os from 'os';
import path from 'path';
import { closeDatabase, openDatabase, sqlite } from '../../infrastructure/database/connection';
import { configureRuntimePaths } from '../../config/runtimePaths';
import { runMigrations } from '../../infrastructure/database/migrate';
import { OrganisationRepository } from '../../infrastructure/database/repositories/OrganisationRepository';
import { ContactRepository, type ContactRepositoryOptions } from '../../infrastructure/database/repositories/ContactRepository';
import { EngagementRepository } from '../../infrastructure/database/repositories/EngagementRepository';
import { ContactService, EngagementService, OrganisationService } from '../../application/services/CrmDomainServices';

export const migrationsFolder = path.resolve(__dirname, '../../../drizzle');
let tempDir: string | null = null;

export function setupTempDatabase() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whitelabel-crm-test-'));
  const databasePath = path.join(tempDir, 'test.sqlite');
  configureRuntimePaths({ dataDirectory: tempDir, databasePath, internalBackupDirectory: path.join(tempDir, 'backups'), temporaryDirectory: path.join(tempDir, 'tmp'), logDirectory: path.join(tempDir, 'logs'), documentDirectory: path.join(tempDir, 'documents') });
  const database = openDatabase(databasePath);
  runMigrations(database, migrationsFolder);
}

export function cleanupTempDatabase() {
  closeDatabase();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
}

export function createRepositories(contactOptions?: ContactRepositoryOptions) {
  const organisations = new OrganisationRepository();
  const contacts = new ContactRepository(contactOptions);
  const engagements = new EngagementRepository();
  return { organisations, contacts, engagements };
}

export function createServices(contactOptions?: ContactRepositoryOptions) {
  const repositories = createRepositories(contactOptions);
  return {
    organisationService: new OrganisationService(repositories.organisations),
    contactService: new ContactService(repositories.organisations, repositories.contacts),
    engagementService: new EngagementService(
      repositories.organisations,
      repositories.contacts,
      repositories.engagements,
    ),
    ...repositories,
  };
}

export async function createOrganisation(name = 'Acme') {
  const { organisationService } = createServices();
  return organisationService.create({ name, status: 'prospect' });
}

export async function requestJson(baseUrl: string, pathName: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json();
  return { response, body };
}

export { sqlite };
