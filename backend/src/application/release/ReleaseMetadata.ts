import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ReleaseMetadataSchema,channelForVersion,type DeploymentMode,type ReleaseArchitecture,type ReleaseMetadata,type ReleasePlatform } from 'shared/release';

interface ReleaseConfig {
  productName:string;
  minimumProfileVersion:number;
  minimumDatabaseVersion:number;
}

function readJson<T>(target:string):T{return JSON.parse(fs.readFileSync(target,'utf8')) as T;}
function packageVersion():string {
  const candidate=path.resolve(__dirname,'../../../package.json');
  try{return readJson<{version:string}>(candidate).version;}catch{return process.env.npm_package_version||'1.0.0';}
}
function releaseConfig():ReleaseConfig {
  const candidates=[path.resolve(__dirname,'../../../../release.config.json'),path.resolve(process.cwd(),'release.config.json')];
  for(const candidate of candidates)try{return readJson<ReleaseConfig>(candidate);}catch{}
  return {productName:'WhiteLabelCRM',minimumProfileVersion:1,minimumDatabaseVersion:3};
}
function buildTimestamp():string {
  if(process.env.CRM_BUILD_TIMESTAMP)return new Date(process.env.CRM_BUILD_TIMESTAMP).toISOString();
  if(process.env.SOURCE_DATE_EPOCH)return new Date(Number(process.env.SOURCE_DATE_EPOCH)*1000).toISOString();
  return new Date().toISOString();
}
function platform():ReleasePlatform {const value=process.env.CRM_RELEASE_PLATFORM;if(value==='windows'||value==='linux'||value==='container')return value;return process.env.CRM_CONTAINER==='true'?'container':process.platform==='win32'?'windows':'linux';}
function architecture():ReleaseArchitecture {return process.arch==='arm64'?'arm64':'x64';}
function deploymentMode():DeploymentMode {const value=process.env.CRM_DEPLOYMENT_MODE;if(value==='managed'||value==='standalone'||value==='server')return value;return process.env.CRM_CONTAINER==='true'?'server':'standalone';}

let cached:ReleaseMetadata|null=null;
export function getReleaseMetadata(overrides:Partial<ReleaseMetadata>={}):ReleaseMetadata {
  if(Object.keys(overrides).length===0&&cached)return cached;
  const config=releaseConfig();const version=process.env.CRM_RELEASE_VERSION||packageVersion();
  const requested=process.env.CRM_RELEASE_CHANNEL as ReleaseMetadata['channel']|undefined;
  const commitSha=(process.env.CRM_COMMIT_SHA||process.env.GITHUB_SHA||'unknown').toLowerCase();
  const metadata=ReleaseMetadataSchema.parse({
    productName:config.productName,version,channel:channelForVersion(version,requested),commitSha,
    buildId:process.env.CRM_BUILD_ID||process.env.GITHUB_RUN_ID||`local-${crypto.createHash('sha256').update(`${version}:${commitSha}`).digest('hex').slice(0,12)}`,
    buildTimestamp:buildTimestamp(),deploymentMode:deploymentMode(),platform:platform(),architecture:architecture(),
    minimumProfileVersion:config.minimumProfileVersion,minimumDatabaseVersion:config.minimumDatabaseVersion,...overrides,
  });
  if(Object.keys(overrides).length===0)cached=metadata;return metadata;
}
