import crypto from 'node:crypto';
import type { NextFunction,Request,Response } from 'express';
import { SecurityRepository,type RequestIdentity } from '../../infrastructure/database/SecurityRepository';

export interface CrmRequest extends Request {crm?:{requestId:string;identity:RequestIdentity|null};}

const buckets=new Map<string,{windowStarted:number;count:number}>();
const SENSITIVE=/password|token|secret|credential|authorization|contentbase64|bodyhtml|bodytext/i;

export function isLoopback(req:Request):boolean{const address=req.socket.remoteAddress||'';return address==='127.0.0.1'||address==='::1'||address==='::ffff:127.0.0.1';}
function trustLocalUsers():boolean{return process.env.CRM_TRUST_LOCAL_USERS!=='false';}
function redact(value:unknown,depth=0):unknown{if(depth>5)return '[truncated]';if(Array.isArray(value))return value.slice(0,50).map((item)=>redact(item,depth+1));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,item])=>[key,SENSITIVE.test(key)?'[redacted]':redact(item,depth+1)]));if(typeof value==='string'&&value.length>2000)return `${value.slice(0,2000)}…`;return value;}
function entityFromPath(path:string):string|null{const parts=path.split('?')[0].split('/').filter(Boolean);const value=parts[0]==='api'?parts[1]:parts[0];return value&&value!=='auth'?value.replace(/-/g,'_'):null;}
function permissionFor(method:string,path:string):string|null{
  if(path.startsWith('/auth/'))return null;
  if(path.startsWith('/reporting')){if(path.includes('/export')||path.endsWith('/download'))return 'reports.export';return method==='GET'?'reports.read':'reports.manage';}
  if(path.startsWith('/admin/users')||path.startsWith('/admin/teams'))return 'users.manage';
  if(path.startsWith('/admin/roles'))return 'roles.manage';
  if(path.startsWith('/admin/audit'))return 'audit.read';
  if(path.startsWith('/settings')&&method!=='GET')return 'settings.manage';
  if(path.startsWith('/backups')||path.startsWith('/operations-health')||path.startsWith('/operations-maintenance')||path.startsWith('/operations-reconcile'))return 'operations.manage';
  if(method==='GET'||method==='HEAD')return 'crm.read';
  if(method==='DELETE'||/archive|discard|cancel/.test(path))return 'crm.delete';
  return 'crm.write';
}

export function requestHardening(req:CrmRequest,res:Response,next:NextFunction):void{
  const requestId=String(req.header('x-request-id')||crypto.randomUUID()).slice(0,120);req.crm={requestId,identity:null};res.setHeader('x-request-id',requestId);
  res.setHeader('x-content-type-options','nosniff');res.setHeader('x-frame-options','DENY');res.setHeader('referrer-policy','no-referrer');res.setHeader('permissions-policy','camera=(), microphone=(), geolocation=()');res.setHeader('cross-origin-opener-policy','same-origin');res.setHeader('content-security-policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");next();
}

export function apiRateLimit(req:Request,res:Response,next:NextFunction):void{
  if(!req.path.startsWith('/api'))return next();const windowMs=60_000;const maximum=Math.max(30,Number(process.env.CRM_RATE_LIMIT_PER_MINUTE||(isLoopback(req)?1200:240)));const key=`${req.ip||req.socket.remoteAddress||'unknown'}:${Math.floor(Date.now()/windowMs)}`;const current=buckets.get(key)??{windowStarted:Date.now(),count:0};current.count+=1;buckets.set(key,current);if(buckets.size>5000)for(const [bucket,value] of buckets)if(Date.now()-value.windowStarted>windowMs*2)buckets.delete(bucket);res.setHeader('x-ratelimit-limit',String(maximum));res.setHeader('x-ratelimit-remaining',String(Math.max(0,maximum-current.count)));if(current.count>maximum){res.setHeader('retry-after','60');res.status(429).json({error:'RATE_LIMITED',message:'Too many API requests'});return;}next();
}

export function authenticateRequest(repository=new SecurityRepository()){
  return (req:CrmRequest,res:Response,next:NextFunction):void=>{if(!req.path.startsWith('/api'))return next();const apiPath=req.path.slice(4)||'/';if(apiPath==='/auth/login'||apiPath==='/auth/local-session')return next();const authorization=req.header('authorization');let identity:RequestIdentity|null=null;if(authorization?.startsWith('Bearer '))identity=repository.resolveSession(authorization.slice(7).trim());if(!identity&&isLoopback(req)&&trustLocalUsers())identity=repository.resolveLocalUser(req.header('x-crm-user-id'));if(!identity){res.status(401).json({error:'UNAUTHENTICATED',message:'An authenticated CRM session is required'});return;}req.crm={requestId:req.crm?.requestId||crypto.randomUUID(),identity};next();};
}

export function enforcePermissions(repository=new SecurityRepository()){
  return (req:CrmRequest,res:Response,next:NextFunction):void=>{if(!req.path.startsWith('/api'))return next();const permission=permissionFor(req.method.toUpperCase(),req.path.slice(4)||'/');if(!permission)return next();if(!repository.hasPermission(req.crm?.identity,permission)){res.status(403).json({error:'FORBIDDEN',message:`Permission required: ${permission}`});return;}next();};
}

export function auditSuccessfulRequests(repository=new SecurityRepository()){
  return (req:CrmRequest,res:Response,next:NextFunction):void=>{if(!req.path.startsWith('/api')||req.path==='/api/auth/login'||req.path==='/api/auth/local-session')return next();const method=req.method.toUpperCase();const isExport=req.path.includes('/export')||req.path.endsWith('/download');if(!['POST','PUT','PATCH','DELETE'].includes(method)&&!isExport)return next();let responsePayload:unknown;const originalJson=res.json.bind(res);res.json=((body:unknown)=>{responsePayload=body;return originalJson(body);}) as Response['json'];res.on('finish',()=>{if(res.statusCode>=400)return;try{const identity=req.crm?.identity;const route=req.originalUrl.split('?')[0];const params=req.params as Record<string,string>;const body=(req.body??{}) as Record<string,unknown>;const query=req.query as Record<string,unknown>;const entityId=params.id||params.organisationId||String((responsePayload as Record<string,unknown>|undefined)?.id||body.id||'')||null;const organisationId=params.organisationId||String((responsePayload as Record<string,unknown>|undefined)?.organisationId||body.organisationId||query.organisationId||'')||null;repository.recordAudit({actorUserId:identity?.id??null,action:isExport?'report.export':`${method.toLowerCase()}.${entityFromPath(route)||'api'}`,entityType:entityFromPath(route),entityId,organisationId,requestId:req.crm?.requestId||'unknown',route,method,after:redact(responsePayload),metadata:{query:redact(query),body:redact(body),statusCode:res.statusCode,localTrusted:identity?.localTrusted??false}});}catch(error){console.error('Audit write failed:',error);}});next();};
}

export function requirePermission(permission:string,repository=new SecurityRepository()){return (req:CrmRequest,res:Response,next:NextFunction):void=>{if(!repository.hasPermission(req.crm?.identity,permission)){res.status(403).json({error:'FORBIDDEN',message:`Permission required: ${permission}`});return;}next();};}
