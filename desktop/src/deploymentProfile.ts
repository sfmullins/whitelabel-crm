import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SignedDeploymentProfileSchema,type SignedDeploymentProfile } from 'shared/onboarding';

const secretKeyPattern=/password|secret|token|credential|privatekey|encryptionkey|accesskey/i;
function canonicalize(value:unknown):unknown{if(Array.isArray(value))return value.map(canonicalize);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value as Record<string,unknown>).sort().map((key)=>[key,canonicalize((value as Record<string,unknown>)[key])]));return value;}
function canonicalJson(value:unknown):string{return JSON.stringify(canonicalize(value));}
function containsSecret(value:unknown,depth=0):boolean{if(depth>12)return false;if(Array.isArray(value))return value.some((entry)=>containsSecret(entry,depth+1));if(value&&typeof value==='object')return Object.entries(value as Record<string,unknown>).some(([key,entry])=>secretKeyPattern.test(key)||containsSecret(entry,depth+1));return false;}
function parseVersion(value:string):[number,number,number]{const match=value.match(/^(\d+)\.(\d+)\.(\d+)/);if(!match)throw new Error(`Invalid semantic version: ${value}`);return [Number(match[1]),Number(match[2]),Number(match[3])];}
function compareVersions(left:string,right:string):number{const a=parseVersion(left);const b=parseVersion(right);for(let index=0;index<3;index+=1){if(a[index]!==b[index])return a[index]-b[index];}return 0;}
function normalisePublicKey(value:string):string{const trimmed=value.trim();if(!trimmed)throw new Error('Deployment trust anchor is empty');const decoded=Buffer.from(trimmed,'base64');if(decoded.length<40)throw new Error('Deployment trust anchor is not a valid Ed25519 SPKI key');crypto.createPublicKey({key:decoded,format:'der',type:'spki'});return trimmed;}
function readTrustAnchor(value:string):string{const candidate=path.resolve(value);return normalisePublicKey(fs.existsSync(candidate)?fs.readFileSync(candidate,'utf8'):value);}

export interface DeploymentRuntime {
  mode:'managed'|'standalone';
  envelope:SignedDeploymentProfile|null;
  instanceId:string|null;
  instanceUrl:string|null;
  configurationRevision:number|null;
}
export interface DeploymentVerificationOptions {allowInsecureManaged?:boolean;currentClientVersion?:string;trustedPublicKey:string;}
interface BootstrapFiles {profilePath:string;trustedPublicKey:string;}

export function verifyDeploymentProfile(value:unknown,options:DeploymentVerificationOptions):SignedDeploymentProfile{
  const envelope=SignedDeploymentProfileSchema.parse(value);const trustedPublicKey=normalisePublicKey(options.trustedPublicKey);if(envelope.publicKey!==trustedPublicKey)throw new Error('Deployment profile signing key does not match the detached trust anchor');
  const serialized=canonicalJson(envelope.profile);const calculated=crypto.createHash('sha256').update(serialized,'utf8').digest('hex');if(calculated!==envelope.checksum)throw new Error('Deployment profile checksum verification failed');
  const publicKey=crypto.createPublicKey({key:Buffer.from(trustedPublicKey,'base64'),format:'der',type:'spki'});if(!crypto.verify(null,Buffer.from(serialized,'utf8'),publicKey,Buffer.from(envelope.signature,'base64')))throw new Error('Deployment profile signature verification failed');if(containsSecret(envelope.profile))throw new Error('Deployment profile contains prohibited secret-bearing fields');
  if(envelope.profile.deploymentMode==='managed'){
    if(!envelope.profile.instanceUrl)throw new Error('Managed deployment profile has no instance URL');const url=new URL(envelope.profile.instanceUrl);if(url.protocol!=='https:'&&!options.allowInsecureManaged)throw new Error('Managed deployment profiles require HTTPS');if(url.username||url.password||url.hash)throw new Error('Managed instance URL contains unsupported credentials or fragments');
  }
  if(options.currentClientVersion&&compareVersions(options.currentClientVersion,envelope.profile.minimumClientVersion)<0)throw new Error(`Client ${options.currentClientVersion} is older than required version ${envelope.profile.minimumClientVersion}`);
  return envelope;
}

export function loadDeploymentProfile(filePath:string,options:DeploymentVerificationOptions):SignedDeploymentProfile{
  const resolved=path.resolve(filePath);const stats=fs.statSync(resolved);if(!stats.isFile()||stats.size>2_500_000)throw new Error('Deployment profile file is invalid or too large');const parsed=JSON.parse(fs.readFileSync(resolved,'utf8')) as unknown;return verifyDeploymentProfile(parsed,options);
}

export function findBootstrapProfile(resourcesPath:string):BootstrapFiles|null{
  const explicit=process.env.CRM_DEPLOYMENT_PROFILE?.trim();
  if(explicit){
    const profilePath=path.resolve(explicit);if(!fs.existsSync(profilePath))throw new Error(`CRM_DEPLOYMENT_PROFILE does not exist: ${profilePath}`);
    const configuredAnchor=process.env.CRM_DEPLOYMENT_PUBLIC_KEY?.trim();const sidecar=`${profilePath}.pub`;if(!configuredAnchor&&!fs.existsSync(sidecar))throw new Error('A detached deployment public-key trust anchor is required through CRM_DEPLOYMENT_PUBLIC_KEY or a .pub sidecar');
    return {profilePath,trustedPublicKey:readTrustAnchor(configuredAnchor||sidecar)};
  }
  const profilePath=path.join(resourcesPath,'deployment-profile.crmdeploy.json');if(!fs.existsSync(profilePath))return null;
  const trustAnchorPath=path.join(resourcesPath,'deployment-profile-public-key.txt');if(!fs.existsSync(trustAnchorPath))throw new Error('Packaged deployment profile is missing deployment-profile-public-key.txt');
  return {profilePath,trustedPublicKey:readTrustAnchor(trustAnchorPath)};
}

export async function refreshManagedProfile(anchor:SignedDeploymentProfile,options:DeploymentVerificationOptions&{timeoutMs?:number}):Promise<SignedDeploymentProfile>{
  if(anchor.profile.deploymentMode!=='managed'||!anchor.profile.instanceUrl)return anchor;const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),options.timeoutMs??5_000);
  try{
    const endpoint=new URL('/api/onboarding/public-profile',anchor.profile.instanceUrl).toString();const response=await fetch(endpoint,{signal:controller.signal,headers:{accept:'application/json'}});if(!response.ok)return anchor;const candidate=verifyDeploymentProfile(await response.json(),options);
    if(candidate.profile.instanceId!==anchor.profile.instanceId)throw new Error('Remote deployment profile belongs to another CRM instance');if(candidate.profile.instanceUrl!==anchor.profile.instanceUrl)throw new Error('Remote deployment profile attempted to replace the bound instance URL');if(candidate.profile.configurationRevision<anchor.profile.configurationRevision)throw new Error('Remote deployment profile is older than the trusted bootstrap profile');return candidate;
  }finally{clearTimeout(timeout);}
}

export async function resolveDeploymentRuntime(resourcesPath:string,options:{allowInsecureManaged?:boolean;currentClientVersion?:string}={}):Promise<DeploymentRuntime>{
  const bootstrapFiles=findBootstrapProfile(resourcesPath);if(!bootstrapFiles)return {mode:'standalone',envelope:null,instanceId:null,instanceUrl:null,configurationRevision:null};
  const verification={...options,trustedPublicKey:bootstrapFiles.trustedPublicKey};const bootstrap=loadDeploymentProfile(bootstrapFiles.profilePath,verification);const envelope=bootstrap.profile.deploymentMode==='managed'?await refreshManagedProfile(bootstrap,verification).catch(()=>bootstrap):bootstrap;
  return {mode:envelope.profile.deploymentMode,envelope,instanceId:envelope.profile.instanceId,instanceUrl:envelope.profile.instanceUrl,configurationRevision:envelope.profile.configurationRevision};
}
