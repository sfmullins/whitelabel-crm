import { z } from 'zod';

const HexColourSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hexadecimal colour');
const OptionalAbsoluteUrlSchema = z.string().url().or(z.literal(''));
const OptionalEmailSchema = z.string().email().or(z.literal(''));
const SlugSchema = z.string().trim().min(2).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens');
const VersionSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'Use a semantic version such as 1.0.0');
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'Use a lowercase SHA-256 checksum');

export const DeploymentModeSchema = z.enum(['managed', 'standalone']);
export const ConfigurationRevisionStateSchema = z.enum(['draft', 'published', 'superseded', 'rolled_back']);
export const ReadinessStatusSchema = z.enum(['passed', 'warning', 'failed', 'not_applicable']);
export const ReadinessSeveritySchema = z.enum(['required', 'recommended']);

export const BusinessIdentitySchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  legalName: z.string().trim().max(200).default(''),
  registrationNumber: z.string().trim().max(80).default(''),
  taxIdentifier: z.string().trim().max(80).default(''),
  email: z.string().email(),
  phone: z.string().trim().min(1).max(80),
  website: OptionalAbsoluteUrlSchema.default(''),
  address: z.string().trim().min(1).max(1000),
  supportEmail: OptionalEmailSchema.default(''),
  privacyEmail: OptionalEmailSchema.default(''),
  description: z.string().trim().max(1500).default(''),
}).strict();

export const BrandAssetReferenceSchema = z.object({
  id: Sha256Schema,
  url: z.string().max(500),
  checksum: Sha256Schema,
  mimeType: z.enum(['image/png','image/jpeg','image/webp']),
  byteSize: z.number().int().positive().max(1_048_576),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
}).strict();

export const BrandAssetUploadSchema = z.object({
  contentBase64: z.string().min(4).max(1_500_000),
  mimeType: z.enum(['image/png','image/jpeg','image/webp']),
  fileName: z.string().trim().min(1).max(160),
}).strict();

export const BrandingConfigurationSchema = z.object({
  logoUrl: z.string().max(2_000).default(''),
  logoAsset: BrandAssetReferenceSchema.nullable().default(null),
  compactLogoUrl: z.string().max(2_000_000).default(''),
  monochromeLogoUrl: z.string().max(2_000_000).default(''),
  primaryColor: HexColourSchema.default('#0f172a'),
  secondaryColor: HexColourSchema.default('#3b82f6'),
  accentColor: HexColourSchema.default('#10b981'),
  surfaceColor: HexColourSchema.default('#ffffff'),
  backgroundColor: HexColourSchema.default('#f8fafc'),
  darkModeEnabled: z.boolean().default(true),
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  radius: z.enum(['square', 'subtle', 'rounded']).default('subtle'),
}).strict();

export const LocaleConfigurationSchema = z.object({
  language: z.string().trim().min(2).max(20).default('en-IE'),
  secondaryLanguages: z.array(z.string().trim().min(2).max(20)).max(8).default([]),
  timezone: z.string().trim().min(1).max(100).default('Europe/Dublin'),
  currency: z.string().trim().length(3).transform((value: string) => value.toUpperCase()).default('EUR'),
  dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).default('DD/MM/YYYY'),
  timeFormat: z.enum(['12h', '24h']).default('24h'),
  weekStartsOn: z.enum(['monday', 'sunday']).default('monday'),
  financialYearStartMonth: z.number().int().min(1).max(12).default(1),
}).strict();

const TerminologyEntrySchema = z.object({ singular: z.string().trim().min(1).max(80), plural: z.string().trim().min(1).max(80) }).strict();
export const TerminologyConfigurationSchema = z.object({
  organisation: TerminologyEntrySchema.default({ singular: 'Organisation', plural: 'Organisations' }),
  contact: TerminologyEntrySchema.default({ singular: 'Contact', plural: 'Contacts' }),
  engagement: TerminologyEntrySchema.default({ singular: 'Engagement', plural: 'Engagements' }),
  task: TerminologyEntrySchema.default({ singular: 'Task', plural: 'Tasks' }),
}).strict();

export const DeploymentConfigurationSchema = z.object({
  mode: DeploymentModeSchema.default('managed'),
  instanceSlug: SlugSchema.default('my-business'),
  instanceUrl: OptionalAbsoluteUrlSchema.default(''),
  expectedUsers: z.number().int().min(1).max(100_000).default(10),
  locations: z.array(z.string().trim().min(1).max(120)).max(100).default(['Primary location']),
  minimumClientVersion: VersionSchema.default('1.0.0'),
  distributionMethod: z.enum(['managed-installer', 'portable', 'browser', 'standalone']).default('managed-installer'),
}).strict();

export const OrganisationConfigurationSchema = z.object({
  departments: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  teams: z.array(z.string().trim().min(1).max(120)).max(100).default(['Default operating team']),
  sharedQueues: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  defaultOwnership: z.enum(['creator', 'team', 'unassigned']).default('creator'),
}).strict();

export const CrmOperatingModelSchema = z.object({
  organisationStatuses: z.array(z.string().trim().min(1).max(80)).min(1).max(30).default(['Prospect', 'Active client', 'Past client', 'Partner', 'Inactive']),
  engagementStages: z.array(z.string().trim().min(1).max(80)).min(1).max(30).default(['Proposed', 'Active', 'Paused', 'Completed', 'Cancelled']),
  activityTypes: z.array(z.string().trim().min(1).max(80)).min(1).max(30).default(['Note', 'Call', 'Email', 'Meeting', 'Message', 'Other']),
  taskPriorities: z.array(z.string().trim().min(1).max(80)).min(1).max(20).default(['Low', 'Normal', 'High', 'Urgent']),
  defaultReminderMinutes: z.number().int().min(0).max(525_600).default(1_440),
  workingHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('09:00'),
  workingHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('17:30'),
}).strict();

export const CommunicationsConfigurationSchema = z.object({
  emailEnabled: z.boolean().default(false),
  calendarEnabled: z.boolean().default(false),
  senderName: z.string().trim().max(160).default(''),
  replyToEmail: OptionalEmailSchema.default(''),
  defaultSignature: z.string().max(5000).default(''),
  connectionTested: z.boolean().default(false),
}).strict();

export const FinancialConfigurationSchema = z.object({
  defaultTaxRate: z.number().min(0).max(100).default(0),
  invoicePrefix: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9-]+$/).default('INV'),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  invoiceFooter: z.string().max(4000).default('Thank you for your business.'),
  creditNotesEnabled: z.boolean().default(false),
}).strict();

export const SecurityRecoveryConfigurationSchema = z.object({
  sessionHours: z.number().int().min(1).max(720).default(12),
  backupConfigured: z.boolean().default(false),
  backupEncryptionConfirmed: z.boolean().default(false),
  restoreRehearsed: z.boolean().default(false),
  recoveryPlanConfirmed: z.boolean().default(false),
  retentionPolicyReviewed: z.boolean().default(false),
  requireHttps: z.boolean().default(true),
}).strict();

export const EmployeeConfigurationSchema = z.object({
  defaultRoleKey: z.string().trim().min(1).max(80).default('member'),
  requireOneTimeEnrolment: z.boolean().default(true),
  enrolmentTtlHours: z.number().int().min(1).max(168).default(24),
  deviceRegistrationRequired: z.boolean().default(true),
}).strict();

export const ExtensionSelectionSchema = z.object({
  packageKey: z.string().trim().min(3).max(160),
  enabled: z.boolean(),
  approvedCapabilities: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
}).strict();

export const OnboardingConfigurationSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  deployment: DeploymentConfigurationSchema,
  identity: BusinessIdentitySchema,
  branding: BrandingConfigurationSchema,
  locale: LocaleConfigurationSchema,
  terminology: TerminologyConfigurationSchema,
  organisation: OrganisationConfigurationSchema,
  crm: CrmOperatingModelSchema,
  communications: CommunicationsConfigurationSchema,
  financial: FinancialConfigurationSchema,
  security: SecurityRecoveryConfigurationSchema,
  employees: EmployeeConfigurationSchema,
  extensions: z.array(ExtensionSelectionSchema).max(200).default([]),
}).strict();

export type OnboardingConfiguration = z.infer<typeof OnboardingConfigurationSchema>;

export const DEFAULT_ONBOARDING_CONFIGURATION: OnboardingConfiguration = {
  schemaVersion: 1,
  deployment: { mode: 'managed', instanceSlug: 'my-business', instanceUrl: '', expectedUsers: 10, locations: ['Primary location'], minimumClientVersion: '1.0.0', distributionMethod: 'managed-installer' },
  identity: { displayName: '', legalName: '', registrationNumber: '', taxIdentifier: '', email: '', phone: '', website: '', address: '', supportEmail: '', privacyEmail: '', description: '' },
  branding: { logoUrl: '', logoAsset: null, compactLogoUrl: '', monochromeLogoUrl: '', primaryColor: '#0f172a', secondaryColor: '#3b82f6', accentColor: '#10b981', surfaceColor: '#ffffff', backgroundColor: '#f8fafc', darkModeEnabled: true, density: 'comfortable', radius: 'subtle' },
  locale: { language: 'en-IE', secondaryLanguages: [], timezone: 'Europe/Dublin', currency: 'EUR', dateFormat: 'DD/MM/YYYY', timeFormat: '24h', weekStartsOn: 'monday', financialYearStartMonth: 1 },
  terminology: { organisation: { singular: 'Organisation', plural: 'Organisations' }, contact: { singular: 'Contact', plural: 'Contacts' }, engagement: { singular: 'Engagement', plural: 'Engagements' }, task: { singular: 'Task', plural: 'Tasks' } },
  organisation: { departments: [], teams: ['Default operating team'], sharedQueues: [], defaultOwnership: 'creator' },
  crm: { organisationStatuses: ['Prospect', 'Active client', 'Past client', 'Partner', 'Inactive'], engagementStages: ['Proposed', 'Active', 'Paused', 'Completed', 'Cancelled'], activityTypes: ['Note', 'Call', 'Email', 'Meeting', 'Message', 'Other'], taskPriorities: ['Low', 'Normal', 'High', 'Urgent'], defaultReminderMinutes: 1440, workingHoursStart: '09:00', workingHoursEnd: '17:30' },
  communications: { emailEnabled: false, calendarEnabled: false, senderName: '', replyToEmail: '', defaultSignature: '', connectionTested: false },
  financial: { defaultTaxRate: 0, invoicePrefix: 'INV', paymentTermsDays: 30, invoiceFooter: 'Thank you for your business.', creditNotesEnabled: false },
  security: { sessionHours: 12, backupConfigured: false, backupEncryptionConfirmed: false, restoreRehearsed: false, recoveryPlanConfirmed: false, retentionPolicyReviewed: false, requireHttps: true },
  employees: { defaultRoleKey: 'member', requireOneTimeEnrolment: true, enrolmentTtlHours: 24, deviceRegistrationRequired: true },
  extensions: [],
};

export const ReadinessCheckSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  status: ReadinessStatusSchema,
  severity: ReadinessSeveritySchema,
  title: z.string().min(1),
  explanation: z.string().min(1),
  remediation: z.string().default(''),
  section: z.string().min(1),
  evidence: z.record(z.unknown()).default({}),
}).strict();

export const ReadinessResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  publishable: z.boolean(),
  passed: z.number().int().min(0),
  warnings: z.number().int().min(0),
  failures: z.number().int().min(0),
  checks: z.array(ReadinessCheckSchema),
  validatedAt: z.string().datetime(),
}).strict();

export const DeploymentProfileSchema = z.object({
  schemaVersion: z.literal(1),
  instanceId: z.string().uuid(),
  configurationRevision: z.number().int().positive(),
  deploymentMode: DeploymentModeSchema,
  instanceUrl: z.string().url().nullable(),
  businessIdentity: z.object({ displayName: z.string(), legalName: z.string(), supportEmail: z.string() }).strict(),
  branding: BrandingConfigurationSchema,
  locale: LocaleConfigurationSchema,
  terminology: TerminologyConfigurationSchema,
  capabilities: z.array(z.string()),
  minimumClientVersion: VersionSchema,
  publishedAt: z.string().datetime(),
}).strict();

export const SignedDeploymentProfileSchema = z.object({
  profile: DeploymentProfileSchema,
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().min(40),
  publicKey: z.string().min(40),
  algorithm: z.literal('Ed25519'),
}).strict();

export const OnboardingRevisionSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  state: ConfigurationRevisionStateSchema,
  configuration: OnboardingConfigurationSchema,
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
  createdByUserId: z.string().uuid().nullable(),
}).strict();

export const OnboardingWorkspaceSchema = z.object({
  instance: z.object({
    id: z.string().uuid(),
    slug: SlugSchema,
    status: z.enum(['provisioning', 'active', 'suspended']),
    currentPublishedRevisionId: z.string().uuid().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }).strict(),
  draft: OnboardingRevisionSchema,
  published: OnboardingRevisionSchema.nullable(),
  readiness: ReadinessResultSchema,
  history: z.array(OnboardingRevisionSchema.omit({ configuration: true })),
  deploymentProfileAvailable: z.boolean(),
}).strict();

export const OnboardingStatusSchema = z.object({
  instanceId: z.string().uuid(),
  slug: SlugSchema,
  status: z.enum(['provisioning','active','suspended']),
  hasPublishedRevision: z.boolean(),
  currentPublishedRevisionId: z.string().uuid().nullable(),
  requiresOnboarding: z.boolean(),
  canAccessWorkspace: z.boolean(),
  reason: z.enum(['onboarding-required','ready','suspended','publication-missing']),
}).strict();

export const CreateEnrolmentSchema = z.object({
  userId: z.string().uuid(),
  expiresInHours: z.number().int().min(1).max(168).optional(),
  deviceLimit: z.number().int().min(1).max(20).default(1),
}).strict();

export const RedeemEnrolmentSchema = z.object({
  code: z.string().min(20).max(300),
  deviceName: z.string().trim().min(1).max(160),
  deviceFingerprint: z.string().trim().min(16).max(300),
}).strict();

export type DeploymentMode = z.infer<typeof DeploymentModeSchema>;
export type ReadinessCheck = z.infer<typeof ReadinessCheckSchema>;
export type ReadinessResult = z.infer<typeof ReadinessResultSchema>;
export type DeploymentProfile = z.infer<typeof DeploymentProfileSchema>;
export type SignedDeploymentProfile = z.infer<typeof SignedDeploymentProfileSchema>;
export type OnboardingRevision = z.infer<typeof OnboardingRevisionSchema>;
export type OnboardingWorkspace = z.infer<typeof OnboardingWorkspaceSchema>;
export type OnboardingStatus = z.infer<typeof OnboardingStatusSchema>;
export type BrandAssetReference = z.infer<typeof BrandAssetReferenceSchema>;
export type BrandAssetUpload = z.infer<typeof BrandAssetUploadSchema>;
export type CreateEnrolment = z.infer<typeof CreateEnrolmentSchema>;
export type RedeemEnrolment = z.infer<typeof RedeemEnrolmentSchema>;
