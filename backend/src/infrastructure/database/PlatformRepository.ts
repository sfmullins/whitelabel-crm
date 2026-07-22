import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { sqlite } from './connection';
import { SecurityRepository,type RequestIdentity } from './SecurityRepository';
import { CredentialVault } from '../security/CredentialVault';
import { WI10_EVENT_TYPES,WI10_TOKEN_SCOPES } from './wi10PlatformSchema';

export interface PlatformRequestIdentity extends RequestIdentity {
  apiTokenId?:string;
  apiTokenName?:string;
  apiTokenPrefix?:string;
}

export interface PlatformEventInput {
  eventType:typeof WI10_EVENT_TYPES[number];
  aggregateType:string;
  aggregateId?:string|null;
  actorUserId?:string|null;
  apiTokenId?:string|null;
  requestId:string;
  payload?:Record<string,unknown>;
}

const now=()=>new Date().toISOString();
const hash=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
function parseArray(value:unknown):string[]{try{const parsed=JSON.parse(String(value));return Array.isArray(parsed)?parsed.filter((item):item is string=>typeof item==='string'):[];}catch{return [];}}
function boundedLimit(value:number|undefined,maximum=500):number{return Math.max(1,Math.min(maximum,value??100));}

function validateWebhookUrl(value:string):string {
  const url=new URL(value.trim());
  if(url.username||url.password||url.hash)throw new Error('Webhook URL must not contain credentials or a fragment');
  const loopback=['localhost','127.0.0.1','::1'].includes(url.hostname);
  if(url.protocol!=='https:'&&!(loopback&&url.protocol==='http:'&&process.env.CRM_ALLOW_LOOPBACK_WEBHOOKS==='true'))throw new Error('Webhook URL must use HTTPS');
  return url.toString();
}

export class PlatformRepository {
  private readonly security:SecurityRepository;
  private readonly vault:CredentialVault;

  constructor(
    private readonly connection:Database.Database=sqlite as Database.Database,
    security?:SecurityRepository,
    vault?:CredentialVault,
  ){
    this.security=security??new SecurityRepository(connection);
    this.vault=vault??new CredentialVault();
  }

  createApiToken(identity:PlatformRequestIdentity,input:{name:string;scopes:string[];expiresAt?:string|null}):{token:string;record:unknown}{
    if(identity.apiTokenId)throw new Error('API tokens cannot create other API tokens');
    const name=input.name.trim();if(!name)throw new Error('Token name is required');
    const requested=[...new Set(input.scopes)];if(!requested.length)throw new Error('At least one token scope is required');
    const allowed=new Set<string>(WI10_TOKEN_SCOPES);
    for(const scope of requested){if(!allowed.has(scope))throw new Error(`Unsupported API token scope: ${scope}`);if(!identity.permissions.includes(scope))throw new Error(`Token scope exceeds issuer permission: ${scope}`);}
    const expiresAt=input.expiresAt??null;if(expiresAt&&(!Number.isFinite(Date.parse(expiresAt))||expiresAt<=now()))throw new Error('Token expiry must be a future ISO timestamp');
    const id=crypto.randomUUID();const prefix=crypto.randomBytes(6).toString('base64url');const secret=crypto.randomBytes(32).toString('base64url');const token=`wlc_${prefix}_${secret}`;const createdAt=now();
    this.connection.prepare(`INSERT INTO api_tokens(id,owner_user_id,name,token_prefix,token_hash,scopes_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)`).run(id,identity.id,name,`wlc_${prefix}`,hash(token),JSON.stringify(requested),createdAt,expiresAt);
    return {token,record:this.getApiToken(id)};
  }

  resolveApiToken(token:string):PlatformRequestIdentity|null {
    if(!/^wlc_[A-Za-z0-9_-]{8,}_[A-Za-z0-9_-]{30,}$/.test(token))return null;
    const row=this.connection.prepare(`SELECT id,owner_user_id,name,token_prefix,scopes_json,expires_at,revoked_at FROM api_tokens WHERE token_hash=?`).get(hash(token)) as {id:string;owner_user_id:string;name:string;token_prefix:string;scopes_json:string;expires_at:string|null;revoked_at:string|null}|undefined;
    if(!row||row.revoked_at||(row.expires_at&&row.expires_at<=now()))return null;
    const user=this.security.getUser(row.owner_user_id);if(!user||user.status!=='active')return null;
    const effective=parseArray(row.scopes_json).filter((scope)=>user.permissions.includes(scope));if(!effective.length)return null;
    this.connection.prepare(`UPDATE api_tokens SET last_used_at=? WHERE id=?`).run(now(),row.id);
    return {...user,permissions:effective,sessionId:null,localTrusted:false,apiTokenId:row.id,apiTokenName:row.name,apiTokenPrefix:row.token_prefix};
  }

  listApiTokens():unknown[]{
    const rows=this.connection.prepare(`SELECT t.id,t.owner_user_id,t.name,t.token_prefix,t.scopes_json,t.created_at,t.expires_at,t.last_used_at,t.revoked_at,u.display_name AS owner_name,u.email AS owner_email FROM api_tokens t JOIN users u ON u.id=t.owner_user_id ORDER BY t.created_at DESC`).all() as Array<Record<string,unknown>>;
    return rows.map((row)=>({id:row.id,ownerUserId:row.owner_user_id,ownerName:row.owner_name,ownerEmail:row.owner_email,name:row.name,tokenPrefix:row.token_prefix,scopes:parseArray(row.scopes_json),createdAt:row.created_at,expiresAt:row.expires_at,lastUsedAt:row.last_used_at,revokedAt:row.revoked_at}));
  }

  getApiToken(id:string):unknown {
    const token=this.listApiTokens().find((item:any)=>item.id===id);if(!token)throw new Error('API token not found');return token;
  }

  revokeApiToken(id:string):unknown {
    const changed=this.connection.prepare(`UPDATE api_tokens SET revoked_at=coalesce(revoked_at,?) WHERE id=?`).run(now(),id).changes;if(!changed)throw new Error('API token not found');return this.getApiToken(id);
  }

  createWebhook(identity:PlatformRequestIdentity,input:{name:string;endpointUrl:string;eventTypes:string[]}):{secret:string;subscription:unknown}{
    if(identity.apiTokenId)throw new Error('API tokens cannot create webhook subscriptions');
    const name=input.name.trim();if(!name)throw new Error('Webhook name is required');const endpointUrl=validateWebhookUrl(input.endpointUrl);const eventTypes=[...new Set(input.eventTypes)];if(!eventTypes.length)throw new Error('At least one webhook event type is required');
    const supported=new Set<string>(WI10_EVENT_TYPES);for(const eventType of eventTypes)if(!supported.has(eventType))throw new Error(`Unsupported webhook event type: ${eventType}`);
    const id=crypto.randomUUID();const credentialKey=`webhook_${id}`;const secret=crypto.randomBytes(32).toString('base64url');const timestamp=now();
    this.vault.store(credentialKey,{secret});
    try{this.connection.prepare(`INSERT INTO webhook_subscriptions(id,owner_user_id,name,endpoint_url,event_types_json,credential_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).run(id,identity.id,name,endpointUrl,JSON.stringify(eventTypes),credentialKey,timestamp,timestamp);}catch(error){this.vault.remove(credentialKey);throw error;}
    return {secret,subscription:this.getWebhook(id)};
  }

  listWebhooks():unknown[]{
    const rows=this.connection.prepare(`SELECT s.*,u.display_name AS owner_name,u.email AS owner_email FROM webhook_subscriptions s JOIN users u ON u.id=s.owner_user_id WHERE s.archived_at IS NULL ORDER BY s.created_at DESC`).all() as Array<Record<string,unknown>>;
    return rows.map((row)=>({id:row.id,ownerUserId:row.owner_user_id,ownerName:row.owner_name,ownerEmail:row.owner_email,name:row.name,endpointUrl:row.endpoint_url,eventTypes:parseArray(row.event_types_json),enabled:Boolean(row.enabled),consecutiveFailures:Number(row.consecutive_failures),lastSuccessAt:row.last_success_at,lastFailureAt:row.last_failure_at,createdAt:row.created_at,updatedAt:row.updated_at}));
  }

  getWebhook(id:string):unknown {const item=this.listWebhooks().find((entry:any)=>entry.id===id);if(!item)throw new Error('Webhook subscription not found');return item;}

  archiveWebhook(id:string):unknown {
    const row=this.connection.prepare(`SELECT credential_key FROM webhook_subscriptions WHERE id=? AND archived_at IS NULL`).get(id) as {credential_key:string}|undefined;if(!row)throw new Error('Webhook subscription not found');const timestamp=now();
    this.connection.prepare(`UPDATE webhook_subscriptions SET enabled=0,archived_at=?,updated_at=? WHERE id=?`).run(timestamp,timestamp,id);this.vault.remove(row.credential_key);return {id,archivedAt:timestamp};
  }

  recordEvent(input:PlatformEventInput):string {
    const supported=new Set<string>(WI10_EVENT_TYPES);if(!supported.has(input.eventType))throw new Error(`Unsupported platform event type: ${input.eventType}`);
    const id=crypto.randomUUID();const timestamp=now();const payload=JSON.stringify(input.payload??{});
    this.connection.transaction(()=>{
      this.connection.prepare(`INSERT INTO platform_events(id,event_type,event_version,aggregate_type,aggregate_id,actor_user_id,api_token_id,request_id,payload_json,created_at) VALUES(?,?,1,?,?,?,?,?,?,?)`).run(id,input.eventType,input.aggregateType,input.aggregateId??null,input.actorUserId??null,input.apiTokenId??null,input.requestId,payload,timestamp);
      const subscriptions=this.connection.prepare(`SELECT id,event_types_json FROM webhook_subscriptions WHERE enabled=1 AND archived_at IS NULL`).all() as Array<{id:string;event_types_json:string}>;const insert=this.connection.prepare(`INSERT OR IGNORE INTO webhook_deliveries(id,subscription_id,event_id,status,attempt_count,next_attempt_at,created_at,updated_at) VALUES(?,?,?,'pending',0,?,?,?)`);
      for(const subscription of subscriptions)if(parseArray(subscription.event_types_json).includes(input.eventType))insert.run(crypto.randomUUID(),subscription.id,id,timestamp,timestamp,timestamp);
    })();
    return id;
  }

  listEvents(limit?:number):unknown[]{
    const rows=this.connection.prepare(`SELECT e.*,u.display_name AS actor_name,t.token_prefix FROM platform_events e LEFT JOIN users u ON u.id=e.actor_user_id LEFT JOIN api_tokens t ON t.id=e.api_token_id ORDER BY e.created_at DESC,e.id DESC LIMIT ?`).all(boundedLimit(limit)) as Array<Record<string,unknown>>;
    return rows.map((row)=>({id:row.id,eventType:row.event_type,eventVersion:row.event_version,aggregateType:row.aggregate_type,aggregateId:row.aggregate_id,actorUserId:row.actor_user_id,actorName:row.actor_name,apiTokenId:row.api_token_id,apiTokenPrefix:row.token_prefix,requestId:row.request_id,payload:JSON.parse(String(row.payload_json)),createdAt:row.created_at}));
  }

  listDeliveries(input:{status?:string;subscriptionId?:string;limit?:number}={}):unknown[]{
    const where:string[]=['1=1'];const params:Record<string,unknown>={limit:boundedLimit(input.limit)};if(input.status){where.push('d.status=@status');params.status=input.status;}if(input.subscriptionId){where.push('d.subscription_id=@subscriptionId');params.subscriptionId=input.subscriptionId;}
    const rows=this.connection.prepare(`SELECT d.*,s.name AS subscription_name,s.endpoint_url,e.event_type FROM webhook_deliveries d JOIN webhook_subscriptions s ON s.id=d.subscription_id JOIN platform_events e ON e.id=d.event_id WHERE ${where.join(' AND ')} ORDER BY d.created_at DESC LIMIT @limit`).all(params) as Array<Record<string,unknown>>;
    return rows.map((row)=>({id:row.id,subscriptionId:row.subscription_id,subscriptionName:row.subscription_name,endpointUrl:row.endpoint_url,eventId:row.event_id,eventType:row.event_type,status:row.status,attemptCount:row.attempt_count,nextAttemptAt:row.next_attempt_at,responseStatus:row.response_status,errorSummary:row.error_summary,createdAt:row.created_at,updatedAt:row.updated_at,deliveredAt:row.delivered_at}));
  }

  dueDeliveries(limit=25):Array<{id:string;subscriptionId:string;eventId:string;eventType:string;endpointUrl:string;credentialKey:string;attemptCount:number;payload:string;createdAt:string}> {
    return (this.connection.prepare(`SELECT d.id,d.subscription_id,d.event_id,d.attempt_count,s.endpoint_url,s.credential_key,e.event_type,e.payload_json,e.created_at FROM webhook_deliveries d JOIN webhook_subscriptions s ON s.id=d.subscription_id JOIN platform_events e ON e.id=d.event_id WHERE d.status IN ('pending','failed') AND d.next_attempt_at<=? AND s.enabled=1 AND s.archived_at IS NULL ORDER BY d.next_attempt_at,d.id LIMIT ?`).all(now(),boundedLimit(limit,100)) as Array<Record<string,unknown>>).map((row)=>({id:String(row.id),subscriptionId:String(row.subscription_id),eventId:String(row.event_id),eventType:String(row.event_type),endpointUrl:String(row.endpoint_url),credentialKey:String(row.credential_key),attemptCount:Number(row.attempt_count),payload:String(row.payload_json),createdAt:String(row.created_at)}));
  }

  getWebhookSecret(credentialKey:string):string {const secret=this.vault.read(credentialKey).secret;if(!secret)throw new Error('Webhook signing secret is unavailable');return secret;}

  markDeliverySucceeded(deliveryId:string,responseStatus:number):void {
    const timestamp=now();this.connection.transaction(()=>{const delivery=this.connection.prepare(`SELECT subscription_id FROM webhook_deliveries WHERE id=?`).get(deliveryId) as {subscription_id:string}|undefined;if(!delivery)throw new Error('Webhook delivery not found');this.connection.prepare(`UPDATE webhook_deliveries SET status='succeeded',attempt_count=attempt_count+1,response_status=?,error_summary=NULL,updated_at=?,delivered_at=? WHERE id=?`).run(responseStatus,timestamp,timestamp,deliveryId);this.connection.prepare(`UPDATE webhook_subscriptions SET consecutive_failures=0,last_success_at=?,updated_at=? WHERE id=?`).run(timestamp,timestamp,delivery.subscription_id);})();
  }

  markDeliveryFailed(deliveryId:string,responseStatus:number|null,errorSummary:string):void {
    const timestamp=now();this.connection.transaction(()=>{const delivery=this.connection.prepare(`SELECT subscription_id,attempt_count FROM webhook_deliveries WHERE id=?`).get(deliveryId) as {subscription_id:string;attempt_count:number}|undefined;if(!delivery)throw new Error('Webhook delivery not found');const attempt=delivery.attempt_count+1;const dead=attempt>=6;const delays=[60,300,1800,7200,43200];const nextAttempt=new Date(Date.now()+(delays[Math.min(attempt-1,delays.length-1)]??43200)*1000).toISOString();this.connection.prepare(`UPDATE webhook_deliveries SET status=?,attempt_count=?,next_attempt_at=?,response_status=?,error_summary=?,updated_at=? WHERE id=?`).run(dead?'dead':'failed',attempt,nextAttempt,responseStatus,errorSummary.slice(0,2000),timestamp,deliveryId);this.connection.prepare(`UPDATE webhook_subscriptions SET consecutive_failures=consecutive_failures+1,last_failure_at=?,updated_at=?,enabled=CASE WHEN consecutive_failures+1>=10 THEN 0 ELSE enabled END WHERE id=?`).run(timestamp,timestamp,delivery.subscription_id);})();
  }

  retryDelivery(id:string):unknown {
    const changed=this.connection.prepare(`UPDATE webhook_deliveries SET status='pending',next_attempt_at=?,error_summary=NULL,updated_at=? WHERE id=? AND status IN ('failed','dead')`).run(now(),now(),id).changes;if(!changed)throw new Error('Failed or dead webhook delivery not found');return this.listDeliveries({limit:500}).find((entry:any)=>entry.id===id);
  }
}
