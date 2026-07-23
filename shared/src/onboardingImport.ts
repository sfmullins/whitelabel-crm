import { z } from 'zod';

export const OnboardingImportTargetSchema=z.enum(['organisations-and-contacts']);
export const OnboardingImportDuplicateStrategySchema=z.enum(['skip','reject']);

const optionalColumn=z.string().trim().max(200).nullable().default(null);
export const OnboardingImportMappingSchema=z.object({
  organisationName:z.string().trim().min(1).max(200),
  organisationLegalName:optionalColumn,
  organisationWebsite:optionalColumn,
  organisationIndustry:optionalColumn,
  organisationCountry:optionalColumn,
  organisationStatus:optionalColumn,
  contactFirstName:optionalColumn,
  contactLastName:optionalColumn,
  contactEmail:optionalColumn,
  contactPhone:optionalColumn,
  contactJobTitle:optionalColumn,
  contactIsPrimary:optionalColumn,
}).strict();

export const OnboardingImportPreviewRequestSchema=z.object({
  target:OnboardingImportTargetSchema.default('organisations-and-contacts'),
  csvData:z.string().min(1).max(5_000_000),
  mapping:OnboardingImportMappingSchema.partial().optional(),
  duplicateStrategy:OnboardingImportDuplicateStrategySchema.default('skip'),
}).strict();

export const OnboardingImportCommitRequestSchema=z.object({
  target:OnboardingImportTargetSchema.default('organisations-and-contacts'),
  csvData:z.string().min(1).max(5_000_000),
  mapping:OnboardingImportMappingSchema,
  duplicateStrategy:OnboardingImportDuplicateStrategySchema.default('skip'),
  previewChecksum:z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const OnboardingImportIssueSchema=z.object({
  row:z.number().int().positive(),
  field:z.string(),
  severity:z.enum(['error','warning']),
  message:z.string(),
}).strict();

export const OnboardingImportPreviewSchema=z.object({
  checksum:z.string().regex(/^[a-f0-9]{64}$/),
  target:OnboardingImportTargetSchema,
  headers:z.array(z.string()),
  mapping:OnboardingImportMappingSchema,
  rowCount:z.number().int().nonnegative(),
  validRows:z.number().int().nonnegative(),
  invalidRows:z.number().int().nonnegative(),
  organisationsToCreate:z.number().int().nonnegative(),
  contactsToCreate:z.number().int().nonnegative(),
  duplicatesToSkip:z.number().int().nonnegative(),
  issues:z.array(OnboardingImportIssueSchema),
  sample:z.array(z.record(z.string())),
  previewedAt:z.string().datetime(),
}).strict();

export const OnboardingImportResultSchema=z.object({
  runId:z.string().uuid(),
  checksum:z.string().regex(/^[a-f0-9]{64}$/),
  organisationsCreated:z.number().int().nonnegative(),
  contactsCreated:z.number().int().nonnegative(),
  duplicatesSkipped:z.number().int().nonnegative(),
  completedAt:z.string().datetime(),
}).strict();

export type OnboardingImportMapping=z.infer<typeof OnboardingImportMappingSchema>;
export type OnboardingImportPreviewRequest=z.infer<typeof OnboardingImportPreviewRequestSchema>;
export type OnboardingImportCommitRequest=z.infer<typeof OnboardingImportCommitRequestSchema>;
export type OnboardingImportPreview=z.infer<typeof OnboardingImportPreviewSchema>;
export type OnboardingImportResult=z.infer<typeof OnboardingImportResultSchema>;
