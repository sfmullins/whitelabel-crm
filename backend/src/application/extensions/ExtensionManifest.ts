import crypto from 'node:crypto';
import { z } from 'zod';
import { WI10_EVENT_TYPES } from '../../infrastructure/database/wi10PlatformSchema';

export const EXTENSION_CAPABILITIES=[
  'custom_fields',
  'custom_entities',
  'forms',
  'views',
  'navigation',
  'themes',
  'reports',
  'workflow_templates',
  'event_subscriptions',
  'localisation',
  'static_assets',
] as const;

const CapabilitySchema=z.enum(EXTENSION_CAPABILITIES);
const KeySchema=z.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/,'Keys must use lowercase letters, numbers and separators');
const SemverSchema=z.string().trim().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/,'Version must use semantic versioning');
const Sha256Schema=z.string().regex(/^[a-f0-9]{64}$/,'Expected a lowercase SHA-256 digest');
const JsonScalarSchema=z.union([z.string(),z.number(),z.boolean(),z.null()]);
const FieldTypeSchema=z.enum(['text','textarea','number','currency','percentage','date','datetime','checkbox','dropdown','multi-select','email','phone','url']);

const FieldSchema=z.object({
  key:KeySchema,
  label:z.string().trim().min(1).max(160),
  type:FieldTypeSchema,
  options:z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  required:z.boolean().default(false),
}).strict();

const WorkflowActionSchema=z.object({
  type:z.enum(['create_task','create_reminder','create_activity','create_email_draft']),
  organisationId:z.string().uuid().optional(),
  title:z.string().max(500).optional(),
  description:z.string().max(4000).optional(),
  priority:z.enum(['low','normal','high','urgent']).optional(),
  dueAt:z.string().datetime({offset:true}).nullable().optional(),
  sourceType:z.string().max(100).optional(),
  sourceId:z.string().max(200).optional(),
  scheduledAt:z.string().datetime({offset:true}).optional(),
  deliveryMethod:z.enum(['in_app']).optional(),
  activityType:z.enum(['note','call','email','meeting','message','other']).optional(),
  body:z.string().max(10000).optional(),
  contactId:z.string().uuid().optional(),
  engagementId:z.string().uuid().optional(),
  accountId:z.string().uuid().optional(),
  to:z.array(z.object({address:z.string().email(),name:z.string().max(200).optional()}).strict()).max(50).optional(),
  cc:z.array(z.object({address:z.string().email(),name:z.string().max(200).optional()}).strict()).max(50).optional(),
  subject:z.string().max(500).optional(),
  documentIds:z.array(z.string().uuid()).max(50).optional(),
}).strict();

const ContributionSchema=z.object({
  customFields:z.array(z.object({entityType:KeySchema,...FieldSchema.shape}).strict()).max(200).default([]),
  customEntities:z.array(z.object({
    key:KeySchema,
    name:z.string().trim().min(1).max(160),
    pluralName:z.string().trim().min(1).max(160),
    description:z.string().trim().max(2000).nullable().optional(),
    fields:z.array(FieldSchema).max(200).default([]),
  }).strict()).max(50).default([]),
  forms:z.array(z.object({key:KeySchema,title:z.string().trim().min(1).max(160),entityType:KeySchema,fields:z.array(KeySchema).min(1).max(100),placement:z.enum(['create','edit','detail','sidebar']).default('detail')}).strict()).max(100).default([]),
  views:z.array(z.object({key:KeySchema,title:z.string().trim().min(1).max(160),entityType:KeySchema,columns:z.array(KeySchema).min(1).max(100),defaultFilters:z.record(JsonScalarSchema).default({})}).strict()).max(100).default([]),
  navigation:z.array(z.object({key:KeySchema,label:z.string().trim().min(1).max(100),route:z.string().startsWith('/extensions/').max(300),order:z.number().int().min(0).max(10000).default(100)}).strict()).max(50).default([]),
  themes:z.array(z.object({key:KeySchema,label:z.string().trim().min(1).max(100),tokens:z.record(z.string().max(200)).refine((value)=>Object.keys(value).length<=100,'Theme token limit exceeded')}).strict()).max(20).default([]),
  reports:z.array(z.object({key:KeySchema,name:z.string().trim().min(1).max(160),description:z.string().trim().max(2000).nullable().optional(),baseReportKey:z.enum(['executive','revenue','pipeline','activity','workload','concentration','operations']),defaultFilters:z.record(JsonScalarSchema).default({}),columns:z.array(z.string().trim().min(1).max(100)).max(100).default([])}).strict()).max(100).default([]),
  workflowTemplates:z.array(z.object({key:KeySchema,name:z.string().trim().min(1).max(160),description:z.string().trim().max(2000).nullable().optional(),triggerType:KeySchema,conditions:z.record(JsonScalarSchema).default({}),actions:z.array(WorkflowActionSchema).min(1).max(50)}).strict()).max(100).default([]),
  eventSubscriptions:z.array(z.object({key:KeySchema,eventTypes:z.array(z.enum(WI10_EVENT_TYPES)).min(1).max(WI10_EVENT_TYPES.length)}).strict()).max(100).default([]),
  localisations:z.array(z.object({locale:z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),messages:z.record(z.string().max(2000)).refine((value)=>Object.keys(value).length<=1000,'Localisation message limit exceeded')}).strict()).max(50).default([]),
  assets:z.array(z.object({key:KeySchema,path:z.string().trim().min(1).max(300).refine((value)=>!value.startsWith('/')&&!value.split('/').includes('..'),'Asset paths must be relative and cannot traverse directories'),mediaType:z.enum(['image/png','image/jpeg','image/webp','image/svg+xml','application/json','text/plain']),sha256:Sha256Schema,sizeBytes:z.number().int().min(0).max(5_000_000)}).strict()).max(200).default([]),
}).strict().default({});

export const ExtensionManifestSchema=z.object({
  formatVersion:z.literal(1),
  packageKey:KeySchema,
  name:z.string().trim().min(1).max(160),
  description:z.string().trim().max(4000).nullable().optional(),
  version:SemverSchema,
  application:z.object({minVersion:SemverSchema,maxVersion:SemverSchema.optional()}).strict(),
  capabilities:z.array(CapabilitySchema).max(EXTENSION_CAPABILITIES.length).refine((items)=>new Set(items).size===items.length,'Capabilities must be unique'),
  contributions:ContributionSchema,
}).strict();

export const ExtensionPackageSchema=z.object({
  manifest:ExtensionManifestSchema,
  signature:z.object({algorithm:z.literal('ed25519'),publicKeyPem:z.string().min(50).max(10000),signatureBase64:z.string().min(20).max(5000)}).strict().optional(),
}).strict();

export type ExtensionCapability=typeof EXTENSION_CAPABILITIES[number];
export type ExtensionManifest=z.infer<typeof ExtensionManifestSchema>;
export type ExtensionPackage=z.infer<typeof ExtensionPackageSchema>;

function canonicalValue(value:unknown):unknown {
  if(Array.isArray(value))return value.map(canonicalValue);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value as Record<string,unknown>).sort().filter((key)=>(value as Record<string,unknown>)[key]!==undefined).map((key)=>[key,canonicalValue((value as Record<string,unknown>)[key])]));
  return value;
}

export function canonicalJson(value:unknown):string{return JSON.stringify(canonicalValue(value));}
export function compareSemver(left:string,right:string):number {
  const parse=(value:string)=>value.split('-')[0].split('.').map(Number);const a=parse(left);const b=parse(right);
  for(let index=0;index<3;index+=1){if(a[index]!==b[index])return a[index]>b[index]?1:-1;}return 0;
}

const CAPABILITY_CONTRIBUTIONS:Record<ExtensionCapability,keyof ExtensionManifest['contributions']>={
  custom_fields:'customFields',custom_entities:'customEntities',forms:'forms',views:'views',navigation:'navigation',themes:'themes',reports:'reports',workflow_templates:'workflowTemplates',event_subscriptions:'eventSubscriptions',localisation:'localisations',static_assets:'assets',
};

export function validateExtensionPackage(input:unknown,approvedCapabilities:string[],applicationVersion=process.env.CRM_APP_VERSION||'1.0.0'):{package:ExtensionPackage;canonicalManifest:string;checksum:string;signatureStatus:'unsigned'|'verified'} {
  const parsed=ExtensionPackageSchema.parse(input);const canonicalManifest=canonicalJson(parsed.manifest);
  if(Buffer.byteLength(canonicalManifest,'utf8')>1_000_000)throw new Error('Extension manifest exceeds the 1 MB limit');
  if(compareSemver(applicationVersion,parsed.manifest.application.minVersion)<0)throw new Error(`Extension requires application version ${parsed.manifest.application.minVersion} or newer`);
  if(parsed.manifest.application.maxVersion&&compareSemver(applicationVersion,parsed.manifest.application.maxVersion)>0)throw new Error(`Extension supports application versions up to ${parsed.manifest.application.maxVersion}`);
  const requested=new Set<ExtensionCapability>(parsed.manifest.capabilities);const approved=new Set(approvedCapabilities);
  for(const capability of requested)if(!approved.has(capability))throw new Error(`Extension capability was not approved: ${capability}`);
  for(const [capability,key] of Object.entries(CAPABILITY_CONTRIBUTIONS) as Array<[ExtensionCapability,keyof ExtensionManifest['contributions']]>)if(parsed.manifest.contributions[key].length>0&&!requested.has(capability))throw new Error(`Contribution ${String(key)} requires capability ${capability}`);
  let signatureStatus:'unsigned'|'verified'='unsigned';
  if(parsed.signature){
    try{
      const valid=crypto.verify(null,Buffer.from(canonicalManifest,'utf8'),crypto.createPublicKey(parsed.signature.publicKeyPem),Buffer.from(parsed.signature.signatureBase64,'base64'));
      if(!valid)throw new Error('Extension signature verification failed');signatureStatus='verified';
    }catch(error){if(error instanceof Error&&error.message==='Extension signature verification failed')throw error;throw new Error('Extension signature could not be verified');}
  }
  return {package:parsed,canonicalManifest,checksum:crypto.createHash('sha256').update(canonicalManifest).digest('hex'),signatureStatus};
}
