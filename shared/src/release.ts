import { z } from 'zod';

export const ReleaseChannelSchema = z.enum(['development', 'candidate', 'stable']);
export const DeploymentModeSchema = z.enum(['managed', 'standalone', 'server']);
export const ReleasePlatformSchema = z.enum(['windows', 'linux', 'container']);
export const ReleaseArchitectureSchema = z.enum(['x64', 'arm64']);
export const SemanticVersionSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, 'Expected semantic version');

export const ReleaseMetadataSchema = z.object({
  productName: z.string().min(1).max(120),
  version: SemanticVersionSchema,
  channel: ReleaseChannelSchema,
  commitSha: z.string().regex(/^(?:unknown|[a-f0-9]{7,64})$/),
  buildId: z.string().min(1).max(200),
  buildTimestamp: z.string().datetime(),
  deploymentMode: DeploymentModeSchema,
  platform: ReleasePlatformSchema,
  architecture: ReleaseArchitectureSchema,
  minimumProfileVersion: z.number().int().positive(),
  minimumDatabaseVersion: z.number().int().positive(),
});

export type ReleaseChannel = z.infer<typeof ReleaseChannelSchema>;
export type DeploymentMode = z.infer<typeof DeploymentModeSchema>;
export type ReleasePlatform = z.infer<typeof ReleasePlatformSchema>;
export type ReleaseArchitecture = z.infer<typeof ReleaseArchitectureSchema>;
export type ReleaseMetadata = z.infer<typeof ReleaseMetadataSchema>;

export interface ReleaseCompatibility {
  compatible: boolean;
  code: 'COMPATIBLE'|'CLIENT_TOO_OLD'|'CLIENT_TOO_NEW'|'PROFILE_TOO_NEW'|'DATABASE_TOO_OLD'|'DATABASE_TOO_NEW'|'INVALID_VERSION';
  message: string;
}

function core(version:string):[number,number,number]|null {
  const match=version.match(/^(\d+)\.(\d+)\.(\d+)/);
  return match?[Number(match[1]),Number(match[2]),Number(match[3])]:null;
}

export function compareSemanticVersions(left:string,right:string):number {
  const a=core(left);const b=core(right);
  if(!a||!b)throw new Error(`Cannot compare invalid semantic versions: ${left}, ${right}`);
  for(let index=0;index<3;index+=1){if(a[index]!==b[index])return a[index]-b[index];}
  const leftPre=left.split('-',2)[1];const rightPre=right.split('-',2)[1];
  if(leftPre===rightPre)return 0;if(!leftPre)return 1;if(!rightPre)return -1;
  return leftPre.localeCompare(rightPre,undefined,{numeric:true});
}

export function channelForVersion(version:string,requested?:ReleaseChannel):ReleaseChannel {
  SemanticVersionSchema.parse(version);
  const inferred:ReleaseChannel=/-rc\.\d+(?:\+.*)?$/.test(version)?'candidate':'development';
  if(requested==='stable'&&version.includes('-'))throw new Error('Stable releases cannot use a prerelease version');
  if(requested==='candidate'&&!/-rc\.\d+(?:\+.*)?$/.test(version))throw new Error('Candidate releases require an -rc.N suffix');
  return requested??inferred;
}

export function checkReleaseCompatibility(input:{
  clientVersion:string;
  minimumClientVersion:string;
  maximumClientVersion?:string|null;
  profileVersion:number;
  maximumProfileVersion:number;
  databaseVersion:number;
  minimumDatabaseVersion:number;
  maximumDatabaseVersion:number;
}):ReleaseCompatibility {
  try {
    if(compareSemanticVersions(input.clientVersion,input.minimumClientVersion)<0)return {compatible:false,code:'CLIENT_TOO_OLD',message:`Client ${input.clientVersion} is older than required ${input.minimumClientVersion}`};
    if(input.maximumClientVersion&&compareSemanticVersions(input.clientVersion,input.maximumClientVersion)>0)return {compatible:false,code:'CLIENT_TOO_NEW',message:`Client ${input.clientVersion} is newer than supported ${input.maximumClientVersion}`};
    if(input.profileVersion>input.maximumProfileVersion)return {compatible:false,code:'PROFILE_TOO_NEW',message:`Deployment profile version ${input.profileVersion} is newer than supported ${input.maximumProfileVersion}`};
    if(input.databaseVersion<input.minimumDatabaseVersion)return {compatible:false,code:'DATABASE_TOO_OLD',message:`Database schema ${input.databaseVersion} is older than required ${input.minimumDatabaseVersion}`};
    if(input.databaseVersion>input.maximumDatabaseVersion)return {compatible:false,code:'DATABASE_TOO_NEW',message:`Database schema ${input.databaseVersion} is newer than supported ${input.maximumDatabaseVersion}`};
    return {compatible:true,code:'COMPATIBLE',message:'Release contracts are compatible'};
  } catch (error) {
    return {compatible:false,code:'INVALID_VERSION',message:error instanceof Error?error.message:'Invalid version'};
  }
}

export const ReleaseManifestSchema = z.object({
  schemaVersion: z.literal(1),
  release: ReleaseMetadataSchema,
  sourceRepository: z.string().min(1),
  lockfileSha256: z.string().regex(/^[a-f0-9]{64}$/),
  artifacts: z.array(z.object({
    filename: z.string().min(1),
    kind: z.enum(['installer','portable','container','sbom','notices','provenance','report']),
    platform: ReleasePlatformSchema,
    deploymentMode: DeploymentModeSchema,
    architecture: ReleaseArchitectureSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().nonnegative(),
    signed: z.boolean(),
  })),
  evidence: z.record(z.string(),z.string()),
});
export type ReleaseManifest = z.infer<typeof ReleaseManifestSchema>;
