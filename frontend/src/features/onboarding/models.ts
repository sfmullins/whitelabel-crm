import type { OnboardingConfiguration,OnboardingWorkspace,SignedDeploymentProfile } from 'shared/onboarding';
import type { OnboardingImportMapping,OnboardingImportPreview } from 'shared/onboarding-import';

export type SaveState='loading'|'unsaved'|'saved'|'saving'|'conflict'|'error';
export type ProvisioningSection='readiness'|'deployment'|'identity'|'brand'|'locale'|'terminology'|'people'|'data-model'|'import'|'integrations'|'extensions'|'recovery'|'employees'|'publish';

export interface AdminPermission {key:string;category:string;description:string;}
export interface AdminRole {id:string;key:string;name:string;description:string|null;permissions:AdminPermission[];}
export interface AdminTeam {id:string;name:string;description:string|null;memberCount:number;createdAt:string;}
export interface AdminUser {id:string;email:string;displayName:string;status:string;roles:Array<{id?:string;key:string;name:string}>;permissions?:string[];teams?:Array<{id:string;name:string}>;}
export interface CustomFieldDefinition {id:string;entityType:string;name:string;label:string;type:string;options:string[];required:boolean;extensionOwned?:boolean;}
export interface CustomObjectDefinition {id:string;name:string;apiName:string;pluralName:string;description:string|null;fields:Array<{id:string;name:string;label:string;type:string;required:boolean}>;extensionOwned?:boolean;}
export interface ExtensionSummary {id:string;packageKey:string;name:string;description:string|null;currentVersion:string;status:string;capabilities:string[];signatureStatus:string;systemManaged:boolean;}
export interface CommunicationAccount {id:string;kind:'email'|'calendar';name:string;serverUrl:string;username:string;enabled:boolean;status?:string;lastTestedAt?:string|null;lastSyncAt?:string|null;}
export interface EnrolmentSummary {id:string;userId:string;userName:string;userEmail:string;codePrefix:string;deviceLimit:number;redeemedCount:number;expiresAt:string;createdAt:string;lastRedeemedAt:string|null;revokedAt:string|null;}
export interface DeviceSummary {id:string;userId:string;userName:string;userEmail:string;deviceName:string;registeredAt:string;lastSeenAt:string;revokedAt:string|null;}
export interface ImportHistory {id:string;target:string;checksum:string;duplicateStrategy:string;status:string;rowCount:number;organisationsCreated:number;contactsCreated:number;duplicatesSkipped:number;createdAt:string;completedAt:string|null;}

export interface ProvisioningState {
  workspace:OnboardingWorkspace;
  draft:OnboardingConfiguration;
  profile:SignedDeploymentProfile|null;
  roles:AdminRole[];
  teams:AdminTeam[];
  users:AdminUser[];
  fields:CustomFieldDefinition[];
  objects:CustomObjectDefinition[];
  extensions:ExtensionSummary[];
  accounts:CommunicationAccount[];
  enrolments:EnrolmentSummary[];
  devices:DeviceSummary[];
  imports:ImportHistory[];
}

export interface ImportWorkspace {
  fileName:string;
  csvData:string;
  preview:OnboardingImportPreview|null;
  mapping:Partial<OnboardingImportMapping>;
  duplicateStrategy:'skip'|'reject';
}
