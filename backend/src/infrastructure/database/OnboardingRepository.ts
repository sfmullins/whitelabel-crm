import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  DeploymentProfileSchema,
  OnboardingConfigurationSchema,
  ReadinessResultSchema,
  SignedDeploymentProfileSchema,
  type CreateEnrolment,
  type DeploymentProfile,
  type OnboardingConfiguration,
  type OnboardingRevision,
  type OnboardingWorkspace,
  type ReadinessCheck,
  type ReadinessResult,
  type RedeemEnrolment,
  type SignedDeploymentProfile,
} from 'shared/onboarding';
import { ConflictError,NotFoundError,ValidationError } from '../../application/errors';
import { BackupManager } from '../backup/BackupManager';
import { CredentialVault } from '../security/CredentialVault';
import { sqlite } from './connection';
import { SecurityRepository } from './SecurityRepository';
import { DEFAULT_INSTANCE_ID } from './wi12OnboardingSchema';

interface InstanceRow {id:string;slug:string;status:'provisioning'|'active'|'suspended';deployment_mode:'managed'|'standalone';current_published_revision_id:string|null;signing_credential_key:string;created_at:string;updated_at:string;}
interface RevisionRow {id:string;instance_id:string;revision:number;state:OnboardingRevision['state'];configuration_json:string;checksum:string;created_by_user_id:string|null;created_at:string;updated_at:string;published_at:string|null;}
interface PublicationRow {profile_json:string;checksum:string;signature:string;public_key:string;}

const now=()=>new Date().toISOString();
const sha256=(value:string)=>crypto.createHash('sha256').update(value,'utf8').digest('hex');
const secretKeyPattern=/password|secret|token|credential|privatekey|encryptionkey|accesskey|refreshtoken/i;
function canonicalize(value:unknown):unknown{
  if(Array.isArray(value))return value.map(canonicalize);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value as Record<string,unknown>).sort().map((key)=>[key,canonicalize((value as Record<string,unknown>)[key])]));
  return value;
}
export function canonicalJson(value:unknown):string{return JSON.stringify(canonicalize(value));}
function containsSecretKey(value:unknown,depth=0):boolean{
  if(depth>12)return false;
  if(Array.isArray(value))return value.some((item)=>containsSecretKey(item,depth+1));
  if(value&&typeof value==='object')return Object.entries(value as Record<string,unknown>).some(([key,item])=>secretKeyPattern.test(key)||containsSecretKey(item,depth+1));
  return false;
}
function hexToRgb(hex:string):[number,number,number]{return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];}
function luminance(hex:string):number{
  return hexToRgb(hex).map((channel)=>channel/255).map((value)=>value<=0.03928?value/12.92:Math.pow((value+0.055)/1.055,2.4)).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
}
function contrast(a:string,b:string):number{const first=luminance(a);const second=luminance(b);return (Math.max(first,second)+0.05)/(Math.min(first,second)+0.05);}
function asObject(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError('Onboarding configuration must be a JSON object');return value as Record<string,unknown>;}

export class OnboardingRepository {
  private readonly security:SecurityRepository;
  constructor(
    private readonly connection:Database.Database=sqlite as Database.Database,
    private readonly suppliedVault?:CredentialVault,
    private readonly createPrePublicationBackup:()=>Promise<string>=()=>BackupManager.createBackup({isPreMigration:true}),
  ){this.security=new SecurityRepository(connection);}
  private vault():CredentialVault{return this.suppliedVault??new CredentialVault();}
  private getInstance():InstanceRow{
    const row=this.connection.prepare(`SELECT * FROM crm_instances ORDER BY created_at LIMIT 1`).get() as InstanceRow|undefined;
    if(!row)throw new NotFoundError('CRM instance has not been initialised');return row;
  }
  private getRevisionRow(id:string):RevisionRow{
    const row=this.connection.prepare(`SELECT * FROM instance_configuration_revisions WHERE id=?`).get(id) as RevisionRow|undefined;
    if(!row)throw new NotFoundError('Configuration revision was not found');return row;
  }
  private getDraftRow():RevisionRow{
    const instance=this.getInstance();const row=this.connection.prepare(`SELECT * FROM instance_configuration_revisions WHERE instance_id=? AND state='draft'`).get(instance.id) as RevisionRow|undefined;
    if(!row)throw new NotFoundError('No editable onboarding draft exists');return row;
  }
  private mapRevision(row:RevisionRow,includeConfiguration=true):OnboardingRevision{
    return {
      id:row.id,revision:Number(row.revision),state:row.state,
      configuration:(includeConfiguration?JSON.parse(row.configuration_json):undefined) as OnboardingConfiguration,
      checksum:row.checksum,createdAt:row.created_at,updatedAt:row.updated_at,publishedAt:row.published_at,createdByUserId:row.created_by_user_id,
    };
  }
  private configuration(row:RevisionRow):OnboardingConfiguration{return JSON.parse(row.configuration_json) as OnboardingConfiguration;}

  getWorkspace():OnboardingWorkspace{
    const instance=this.getInstance();const draft=this.getDraftRow();
    const published=instance.current_published_revision_id?this.getRevisionRow(instance.current_published_revision_id):null;
    const historyRows=this.connection.prepare(`SELECT * FROM instance_configuration_revisions WHERE instance_id=? ORDER BY revision DESC`).all(instance.id) as RevisionRow[];
    const readiness=this.evaluate(this.configuration(draft));
    const history=historyRows.map((row)=>{const mapped=this.mapRevision(row);const {configuration:_configuration,...summary}=mapped;return summary;});
    return {
      instance:{id:instance.id,slug:instance.slug,status:instance.status,currentPublishedRevisionId:instance.current_published_revision_id,createdAt:instance.created_at,updatedAt:instance.updated_at},
      draft:this.mapRevision(draft),published:published?this.mapRevision(published):null,readiness,history,deploymentProfileAvailable:Boolean(instance.current_published_revision_id),
    };
  }

  saveDraft(value:unknown,actorUserId:string|null):OnboardingWorkspace{
    const configuration=asObject(value);
    if(containsSecretKey(configuration))throw new ValidationError('Onboarding configuration cannot contain credentials, passwords, tokens or private keys');
    const serialized=canonicalJson(configuration);if(Buffer.byteLength(serialized,'utf8')>2_000_000)throw new ValidationError('Onboarding configuration exceeds the 2 MB limit');
    const draft=this.getDraftRow();const timestamp=now();const parsed=OnboardingConfigurationSchema.safeParse(configuration);
    this.connection.transaction(()=>{
      this.connection.prepare(`UPDATE instance_configuration_revisions SET configuration_json=?,checksum=?,created_by_user_id=coalesce(?,created_by_user_id),updated_at=? WHERE id=? AND state='draft'`).run(serialized,sha256(serialized),actorUserId,timestamp,draft.id);
      if(parsed.success)this.connection.prepare(`UPDATE crm_instances SET slug=?,deployment_mode=?,updated_at=? WHERE id=?`).run(parsed.data.deployment.instanceSlug,parsed.data.deployment.mode,timestamp,draft.instance_id);
    })();
    return this.getWorkspace();
  }

  validateDraft(actorUserId:string|null):ReadinessResult{
    const draft=this.getDraftRow();const result=this.evaluate(this.configuration(draft));
    this.connection.prepare(`INSERT INTO instance_readiness_runs(id,instance_id,revision_id,result_json,score,publishable,created_by_user_id,validated_at) VALUES(?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),draft.instance_id,draft.id,canonicalJson(result),result.score,result.publishable?1:0,actorUserId,result.validatedAt);
    return result;
  }

  evaluate(value:unknown):ReadinessResult{
    const checks:ReadinessCheck[]=[];const add=(check:ReadinessCheck)=>checks.push(check);
    const parsed=OnboardingConfigurationSchema.safeParse(value);const configuration=(value??{}) as Partial<OnboardingConfiguration>;
    add({id:'configuration.schema',category:'identity',status:parsed.success?'passed':'failed',severity:'required',title:'Configuration schema',explanation:parsed.success?'The complete draft matches the WI12 configuration contract.':'One or more fields are incomplete or invalid.',remediation:parsed.success?'':'Review the highlighted fields in the onboarding workspace.',section:'review',evidence:parsed.success?{}:{issues:parsed.error.issues.slice(0,30).map((issue)=>({path:issue.path.join('.'),message:issue.message}))}});
    const identity=configuration.identity;
    const identityComplete=Boolean(identity?.displayName?.trim()&&identity?.email?.includes('@')&&identity?.phone?.trim()&&identity?.address?.trim());
    add({id:'identity.complete',category:'identity',status:identityComplete?'passed':'failed',severity:'required',title:'Business identity',explanation:identityComplete?'The business identity and primary contact details are complete.':'Business name, email, phone and address are required.',remediation:'Complete the Business identity section.',section:'identity',evidence:{displayName:Boolean(identity?.displayName),email:Boolean(identity?.email),phone:Boolean(identity?.phone),address:Boolean(identity?.address)}});
    const deployment=configuration.deployment;const managed=deployment?.mode==='managed';let deploymentStatus:ReadinessCheck['status']='passed';let deploymentExplanation='Standalone deployment is explicitly selected.';
    if(managed){try{const url=new URL(deployment?.instanceUrl||'');deploymentStatus=(configuration.security?.requireHttps!==false&&url.protocol!=='https:')?'failed':'passed';deploymentExplanation=deploymentStatus==='passed'?'The managed instance URL is valid.':'Managed deployments require HTTPS.';}catch{deploymentStatus='failed';deploymentExplanation='Managed deployments require a valid absolute instance URL.';}}
    add({id:'deployment.topology',category:'deployment',status:deploymentStatus,severity:'required',title:'Deployment topology',explanation:deploymentExplanation,remediation:'Choose the intended topology and provide the managed instance URL.',section:'deployment',evidence:{mode:deployment?.mode??null,instanceUrl:deployment?.instanceUrl??null}});
    const primary=configuration.branding?.primaryColor;const contrastRatio=primary&&/^#[0-9a-f]{6}$/i.test(primary)?Math.max(contrast(primary,'#ffffff'),contrast(primary,'#0f172a')):0;
    add({id:'branding.contrast',category:'branding',status:contrastRatio>=4.5?'passed':'failed',severity:'required',title:'Accessible primary colour',explanation:contrastRatio>=4.5?'The primary colour supports an accessible foreground colour.':'The primary colour does not reach the required text contrast.',remediation:'Select a darker or lighter primary colour.',section:'branding',evidence:{contrastRatio:Number(contrastRatio.toFixed(2))}});
    const ownerCount=(this.connection.prepare(`SELECT count(DISTINCT u.id) AS count FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.key='owner' AND u.status='active' AND u.archived_at IS NULL`).get() as {count:number}).count;
    add({id:'permissions.owner',category:'permissions',status:ownerCount>0?'passed':'failed',severity:'required',title:'Active instance owner',explanation:ownerCount>0?'At least one active Owner remains assigned.':'No active Owner is assigned.',remediation:'Assign the Owner role to an active user.',section:'people',evidence:{ownerCount}});
    const administratorCount=(this.connection.prepare(`SELECT count(DISTINCT u.id) AS count FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.key IN ('owner','administrator') AND u.status='active' AND u.archived_at IS NULL`).get() as {count:number}).count;
    add({id:'permissions.secondary-admin',category:'permissions',status:administratorCount>=2?'passed':'warning',severity:'recommended',title:'Secondary administrator',explanation:administratorCount>=2?'A second privileged administrator is available.':'Only one active owner or administrator is available.',remediation:'Assign a second administrator to reduce lockout risk.',section:'people',evidence:{administratorCount}});
    const defaultRole=configuration.employees?.defaultRoleKey;const roleExists=Boolean(defaultRole&&this.connection.prepare(`SELECT 1 FROM roles WHERE key=?`).get(defaultRole));
    add({id:'employees.default-role',category:'employee-enrolment',status:roleExists?'passed':'failed',severity:'required',title:'Default employee role',explanation:roleExists?'The default employee role exists.':'The selected default employee role does not exist.',remediation:'Select an existing bounded role.',section:'employees',evidence:{defaultRole:defaultRole??null}});
    const recovery=configuration.security;const recoveryReady=Boolean(recovery?.backupConfigured&&recovery?.backupEncryptionConfirmed&&recovery?.recoveryPlanConfirmed);
    add({id:'recovery.viable',category:'backup',status:recoveryReady?'passed':managed?'failed':'warning',severity:managed?'required':'recommended',title:'Backup and recovery',explanation:recoveryReady?'Backup encryption and the recovery plan are confirmed.':managed?'Managed deployment cannot publish without a viable recovery plan.':'Standalone recovery has not been fully confirmed.',remediation:'Configure encrypted backups and confirm the recovery plan.',section:'security',evidence:{backupConfigured:Boolean(recovery?.backupConfigured),backupEncryptionConfirmed:Boolean(recovery?.backupEncryptionConfirmed),recoveryPlanConfirmed:Boolean(recovery?.recoveryPlanConfirmed)}});
    add({id:'recovery.rehearsal',category:'backup',status:recovery?.restoreRehearsed?'passed':'warning',severity:'recommended',title:'Restore rehearsal',explanation:recovery?.restoreRehearsed?'A restore rehearsal has been recorded.':'A restore rehearsal has not yet been recorded.',remediation:'Create a backup and complete a controlled restore rehearsal.',section:'security',evidence:{restoreRehearsed:Boolean(recovery?.restoreRehearsed)}});
    const communicationsEnabled=Boolean(configuration.communications?.emailEnabled||configuration.communications?.calendarEnabled);
    add({id:'communications.tested',category:'communications',status:communicationsEnabled?(configuration.communications?.connectionTested?'passed':'warning'):'not_applicable',severity:'recommended',title:'Communication connection test',explanation:communicationsEnabled?(configuration.communications?.connectionTested?'Enabled communication connections have been tested.':'Communication capabilities are enabled but not marked as tested.'):'No communication connection is enabled.',remediation:'Run email and calendar test operations before employee rollout.',section:'communications',evidence:{enabled:communicationsEnabled,tested:Boolean(configuration.communications?.connectionTested)}});
    const enabledExtensions=configuration.extensions?.filter((item)=>item.enabled).map((item)=>item.packageKey)??[];const unavailable=enabledExtensions.filter((key)=>!this.connection.prepare(`SELECT 1 FROM extensions WHERE package_key=? AND enabled=1 AND archived_at IS NULL`).get(key));
    add({id:'extensions.compatible',category:'extensions',status:unavailable.length?'failed':'passed',severity:'required',title:'Extension compatibility',explanation:unavailable.length?'One or more selected extensions are not installed and enabled.':'Every selected extension is available.',remediation:'Install, approve and enable the selected extension releases.',section:'extensions',evidence:{unavailable}});
    add({id:'configuration.secret-free',category:'security',status:containsSecretKey(value)?'failed':'passed',severity:'required',title:'Secret-free deployment configuration',explanation:containsSecretKey(value)?'Credential-like fields were found in the deployment configuration.':'No credential-bearing fields are present in the configuration.',remediation:'Store secrets in the credential vault and retain only references in configuration.',section:'security',evidence:{}});
    const relevant=checks.filter((check)=>check.status!=='not_applicable');const passed=checks.filter((check)=>check.status==='passed').length;const warnings=checks.filter((check)=>check.status==='warning').length;const failures=checks.filter((check)=>check.status==='failed').length;const score=relevant.length?Math.round((passed+warnings*0.5)/relevant.length*100):0;const publishable=!checks.some((check)=>check.severity==='required'&&check.status==='failed');
    return ReadinessResultSchema.parse({score,publishable,passed,warnings,failures,checks,validatedAt:now()});
  }

  async publish(actorUserId:string|null):Promise<{workspace:OnboardingWorkspace;deploymentProfile:SignedDeploymentProfile;backupPath:string}> {
    const draft=this.getDraftRow();const parsed=OnboardingConfigurationSchema.safeParse(this.configuration(draft));if(!parsed.success)throw new ValidationError('The onboarding draft is incomplete or invalid',parsed.error.format());
    const readiness=this.validateDraft(actorUserId);if(!readiness.publishable)throw new ValidationError('The onboarding draft has release-blocking readiness failures',readiness);
    const backupPath=await this.createPrePublicationBackup();const instance=this.getInstance();const timestamp=now();const signed=this.signProfile(this.buildProfile(instance,draft,parsed.data,timestamp));
    const nextRevision=draft.revision+1;const nextDraftId=crypto.randomUUID();const nextDraftSerialized=canonicalJson(parsed.data);
    this.connection.transaction(()=>{
      if(instance.current_published_revision_id)this.connection.prepare(`UPDATE instance_configuration_revisions SET state='superseded',updated_at=? WHERE id=? AND state='published'`).run(timestamp,instance.current_published_revision_id);
      const changed=this.connection.prepare(`UPDATE instance_configuration_revisions SET state='published',published_at=?,updated_at=? WHERE id=? AND state='draft'`).run(timestamp,timestamp,draft.id).changes;if(changed!==1)throw new ConflictError('The onboarding draft changed before publication');
      this.connection.prepare(`INSERT INTO instance_publications(id,instance_id,revision_id,profile_json,checksum,signature,public_key,created_by_user_id,published_at) VALUES(?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),instance.id,draft.id,canonicalJson(signed.profile),signed.checksum,signed.signature,signed.publicKey,actorUserId,timestamp);
      this.connection.prepare(`UPDATE crm_instances SET slug=?,status='active',deployment_mode=?,current_published_revision_id=?,updated_at=? WHERE id=?`).run(parsed.data.deployment.instanceSlug,parsed.data.deployment.mode,draft.id,timestamp,instance.id);
      this.mirrorSettings(parsed.data,timestamp);
      this.connection.prepare(`INSERT INTO instance_configuration_revisions(id,instance_id,revision,state,configuration_json,checksum,created_by_user_id,created_at,updated_at,published_at) VALUES(?,?,?,'draft',?,?,?,?,?,NULL)`).run(nextDraftId,instance.id,nextRevision,nextDraftSerialized,sha256(nextDraftSerialized),actorUserId,timestamp,timestamp);
    })();
    return {workspace:this.getWorkspace(),deploymentProfile:signed,backupPath};
  }

  async rollback(targetRevisionId:string,actorUserId:string|null):Promise<{workspace:OnboardingWorkspace;deploymentProfile:SignedDeploymentProfile;backupPath:string}> {
    const target=this.getRevisionRow(targetRevisionId);if(target.state==='draft')throw new ValidationError('A draft revision cannot be used as a rollback target');
    this.saveDraft(JSON.parse(target.configuration_json),actorUserId);return this.publish(actorUserId);
  }

  getPublishedProfile():SignedDeploymentProfile{
    const instance=this.getInstance();if(!instance.current_published_revision_id)throw new NotFoundError('No deployment profile has been published');
    const row=this.connection.prepare(`SELECT profile_json,checksum,signature,public_key FROM instance_publications WHERE revision_id=?`).get(instance.current_published_revision_id) as PublicationRow|undefined;
    if(!row)throw new NotFoundError('The published deployment profile is unavailable');
    return SignedDeploymentProfileSchema.parse({profile:JSON.parse(row.profile_json),checksum:row.checksum,signature:row.signature,publicKey:row.public_key,algorithm:'Ed25519'});
  }

  createEnrolment(input:CreateEnrolment,actorUserId:string|null):{id:string;code:string;codePrefix:string;userId:string;expiresAt:string;deviceLimit:number;createdAt:string}{
    this.getPublishedProfile();const user=this.security.getUser(input.userId);if(!user||user.status!=='active')throw new ValidationError('Employee enrolment requires an active user');
    const configuration=this.publishedConfiguration();const hours=input.expiresInHours??configuration.employees.enrolmentTtlHours;const id=crypto.randomUUID();const prefix=crypto.randomBytes(5).toString('base64url');const secret=crypto.randomBytes(32).toString('base64url');const code=`wlc_enrol_${prefix}_${secret}`;const createdAt=now();const expiresAt=new Date(Date.now()+hours*3_600_000).toISOString();
    this.connection.prepare(`INSERT INTO instance_enrolments(id,instance_id,user_id,code_prefix,code_hash,device_limit,redeemed_count,expires_at,created_by_user_id,created_at) VALUES(?,?,?,?,?,?,0,?,?,?)`).run(id,this.getInstance().id,input.userId,`wlc_enrol_${prefix}`,sha256(code),input.deviceLimit,expiresAt,actorUserId,createdAt);
    return {id,code,codePrefix:`wlc_enrol_${prefix}`,userId:input.userId,expiresAt,deviceLimit:input.deviceLimit,createdAt};
  }

  listEnrolments():unknown[]{return (this.connection.prepare(`SELECT e.id,e.user_id,e.code_prefix,e.device_limit,e.redeemed_count,e.expires_at,e.created_at,e.last_redeemed_at,e.revoked_at,u.display_name,u.email FROM instance_enrolments e JOIN users u ON u.id=e.user_id ORDER BY e.created_at DESC`).all() as Array<Record<string,unknown>>).map((row)=>({id:row.id,userId:row.user_id,userName:row.display_name,userEmail:row.email,codePrefix:row.code_prefix,deviceLimit:row.device_limit,redeemedCount:row.redeemed_count,expiresAt:row.expires_at,createdAt:row.created_at,lastRedeemedAt:row.last_redeemed_at,revokedAt:row.revoked_at}));}
  revokeEnrolment(id:string):void{const changed=this.connection.prepare(`UPDATE instance_enrolments SET revoked_at=coalesce(revoked_at,?) WHERE id=?`).run(now(),id).changes;if(!changed)throw new NotFoundError('Employee enrolment was not found');}

  redeemEnrolment(input:RedeemEnrolment,meta:{ipAddress?:string|null;userAgent?:string|null}={}):{sessionToken:string;expiresAt:string;user:ReturnType<SecurityRepository['getUser']>;deviceId:string;deploymentProfile:SignedDeploymentProfile}{
    const hash=sha256(input.code);const row=this.connection.prepare(`SELECT * FROM instance_enrolments WHERE code_hash=?`).get(hash) as Record<string,unknown>|undefined;if(!row)throw new ValidationError('The enrolment code is invalid');
    if(row.revoked_at)throw new ValidationError('The enrolment code has been revoked');if(String(row.expires_at)<=now())throw new ValidationError('The enrolment code has expired');if(Number(row.redeemed_count)>=Number(row.device_limit))throw new ValidationError('The enrolment code has reached its device limit');
    const user=this.security.getUser(String(row.user_id));if(!user||user.status!=='active')throw new ValidationError('The invited employee is not active');const fingerprintHash=sha256(input.deviceFingerprint);const existing=this.connection.prepare(`SELECT id,revoked_at FROM instance_devices WHERE instance_id=? AND fingerprint_hash=?`).get(row.instance_id,fingerprintHash) as {id:string;revoked_at:string|null}|undefined;if(existing&&!existing.revoked_at)throw new ConflictError('This device is already registered');
    const deviceId=crypto.randomUUID();const timestamp=now();this.connection.transaction(()=>{
      if(existing)this.connection.prepare(`DELETE FROM instance_devices WHERE id=?`).run(existing.id);
      this.connection.prepare(`INSERT INTO instance_devices(id,instance_id,user_id,enrolment_id,device_name,fingerprint_hash,registered_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?)`).run(deviceId,row.instance_id,row.user_id,row.id,input.deviceName,fingerprintHash,timestamp,timestamp);
      this.connection.prepare(`UPDATE instance_enrolments SET redeemed_count=redeemed_count+1,last_redeemed_at=? WHERE id=?`).run(timestamp,row.id);
    })();
    const configuration=this.publishedConfiguration();const session=this.security.createSession(user.id,{ipAddress:meta.ipAddress,userAgent:meta.userAgent,ttlHours:configuration.security.sessionHours});
    return {sessionToken:session.token,expiresAt:session.expiresAt,user:this.security.getUser(user.id),deviceId,deploymentProfile:this.getPublishedProfile()};
  }

  listDevices():unknown[]{return (this.connection.prepare(`SELECT d.id,d.user_id,d.device_name,d.registered_at,d.last_seen_at,d.revoked_at,u.display_name,u.email FROM instance_devices d JOIN users u ON u.id=d.user_id ORDER BY d.registered_at DESC`).all() as Array<Record<string,unknown>>).map((row)=>({id:row.id,userId:row.user_id,userName:row.display_name,userEmail:row.email,deviceName:row.device_name,registeredAt:row.registered_at,lastSeenAt:row.last_seen_at,revokedAt:row.revoked_at}));}
  revokeDevice(id:string):void{const row=this.connection.prepare(`SELECT user_id FROM instance_devices WHERE id=?`).get(id) as {user_id:string}|undefined;if(!row)throw new NotFoundError('Registered device was not found');const timestamp=now();this.connection.transaction(()=>{this.connection.prepare(`UPDATE instance_devices SET revoked_at=coalesce(revoked_at,?) WHERE id=?`).run(timestamp,id);this.security.revokeUserSessions(row.user_id);})();}

  private publishedConfiguration():OnboardingConfiguration{const instance=this.getInstance();if(!instance.current_published_revision_id)throw new NotFoundError('No configuration has been published');return this.configuration(this.getRevisionRow(instance.current_published_revision_id));}
  private buildProfile(instance:InstanceRow,draft:RevisionRow,configuration:OnboardingConfiguration,publishedAt:string):DeploymentProfile{
    return DeploymentProfileSchema.parse({schemaVersion:1,instanceId:instance.id,configurationRevision:draft.revision,deploymentMode:configuration.deployment.mode,instanceUrl:configuration.deployment.mode==='managed'?configuration.deployment.instanceUrl:null,businessIdentity:{displayName:configuration.identity.displayName,legalName:configuration.identity.legalName,supportEmail:configuration.identity.supportEmail||configuration.identity.email},branding:configuration.branding,locale:configuration.locale,terminology:configuration.terminology,capabilities:['onboarding-v1','signed-deployment-profile',...configuration.extensions.filter((item)=>item.enabled).map((item)=>`extension:${item.packageKey}`)],minimumClientVersion:configuration.deployment.minimumClientVersion,publishedAt});
  }
  private signingMaterial(instance:InstanceRow):{privateKey:string;publicKey:string}{
    const vault=this.vault();if(!vault.exists(instance.signing_credential_key)){const pair=crypto.generateKeyPairSync('ed25519');vault.store(instance.signing_credential_key,{privateKey:pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),publicKey:pair.publicKey.export({format:'der',type:'spki'}).toString('base64')});}
    const material=vault.read(instance.signing_credential_key);if(!material.privateKey||!material.publicKey)throw new Error('Instance deployment signing material is incomplete');return {privateKey:material.privateKey,publicKey:material.publicKey};
  }
  private signProfile(profile:DeploymentProfile):SignedDeploymentProfile{
    const profileJson=canonicalJson(profile);const checksum=sha256(profileJson);const material=this.signingMaterial(this.getInstance());const privateKey=crypto.createPrivateKey({key:Buffer.from(material.privateKey,'base64'),format:'der',type:'pkcs8'});const signature=crypto.sign(null,Buffer.from(profileJson,'utf8'),privateKey).toString('base64');return SignedDeploymentProfileSchema.parse({profile,checksum,signature,publicKey:material.publicKey,algorithm:'Ed25519'});
  }
  static verifySignedProfile(value:unknown):SignedDeploymentProfile{
    const envelope=SignedDeploymentProfileSchema.parse(value);const profileJson=canonicalJson(envelope.profile);if(sha256(profileJson)!==envelope.checksum)throw new ValidationError('Deployment profile checksum verification failed');const publicKey=crypto.createPublicKey({key:Buffer.from(envelope.publicKey,'base64'),format:'der',type:'spki'});if(!crypto.verify(null,Buffer.from(profileJson,'utf8'),publicKey,Buffer.from(envelope.signature,'base64')))throw new ValidationError('Deployment profile signature verification failed');if(containsSecretKey(envelope.profile))throw new ValidationError('Deployment profile contains prohibited secret-bearing fields');return envelope;
  }
  private mirrorSettings(configuration:OnboardingConfiguration,timestamp:string):void{
    const values=[configuration.identity.displayName,configuration.branding.logoUrl||null,configuration.branding.primaryColor,configuration.branding.secondaryColor,configuration.branding.accentColor,configuration.identity.address,configuration.identity.phone,configuration.identity.email,configuration.identity.website,configuration.financial.invoiceFooter,configuration.financial.defaultTaxRate,configuration.locale.currency,configuration.locale.timezone,configuration.locale.dateFormat,timestamp,timestamp];
    this.connection.prepare(`INSERT INTO settings(id,business_name,logo_url,primary_color,secondary_color,accent_color,address,phone,email,website,invoice_footer,default_tax_rate,currency,timezone,date_format,created_at,updated_at) VALUES('default',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET business_name=excluded.business_name,logo_url=excluded.logo_url,primary_color=excluded.primary_color,secondary_color=excluded.secondary_color,accent_color=excluded.accent_color,address=excluded.address,phone=excluded.phone,email=excluded.email,website=excluded.website,invoice_footer=excluded.invoice_footer,default_tax_rate=excluded.default_tax_rate,currency=excluded.currency,timezone=excluded.timezone,date_format=excluded.date_format,updated_at=excluded.updated_at`).run(...values);
  }
}
