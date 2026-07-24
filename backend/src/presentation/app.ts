import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import settingsRouter from './routes/settings';
import customersRouter from './routes/customers';
import servicesRouter from './routes/services';
import bookingsRouter from './routes/bookings';
import invoicesRouter from './routes/invoices';
import dashboardRouter from './routes/dashboard';
import searchRouter from './routes/search';
import customFieldsRouter from './routes/customFields';
import customObjectsRouter from './routes/customObjects';
import backupsRouter from './routes/backups';
import organisationsRouter from './routes/organisations';
import contactsRouter from './routes/contacts';
import engagementsRouter from './routes/engagements';
import activitiesRouter from './routes/activities';
import workspaceRouter from './routes/workspace';
import operationalRouter from './routes/operational';
import connectedCommunicationsRouter from './routes/connectedCommunications';
import communicationsHubRouter from './routes/communicationsHub';
import releaseHardeningRouter from './routes/releaseHardening';
import authRouter from './routes/auth';
import administrationRouter from './routes/administration';
import reportingRouter from './routes/reporting';
import publicReportingRouter from './routes/publicReporting';
import ownershipRouter from './routes/ownership';
import platformRouter from './routes/platform';
import extensionsRouter from './routes/extensions';
import onboardingRouter from './routes/onboarding';
import { AppError } from '../application/errors';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { getRuntimePaths } from '../config/runtimePaths';
import { apiRateLimit,auditSuccessfulRequests,authenticateRequest,enforcePermissions,logCompletedRequest,requestHardening,type CrmRequest } from './middleware/security';
import { assignCreatedOwnership } from './middleware/ownership';
import { enforcePublicApiContract } from './middleware/publicApi';
import {assessApiOrigin} from './originPolicy';
import { BrandAssetStore } from '../infrastructure/storage/BrandAssetStore';
import { enforceInstanceLifecycle } from './middleware/instanceLifecycle';

const app=express();
function configuredOrigins():Set<string>{
  const values=(process.env.CRM_ALLOWED_ORIGINS||'').split(',').map((value)=>value.trim()).filter(Boolean);const normalized=new Set<string>();
  for(const value of values){let parsed:URL;try{parsed=new URL(value);}catch{throw new Error(`CRM_ALLOWED_ORIGINS contains an invalid origin: ${value}`);}if(parsed.origin!==value||!['http:','https:'].includes(parsed.protocol))throw new Error(`CRM_ALLOWED_ORIGINS entries must be exact HTTP(S) origins: ${value}`);normalized.add(parsed.origin);}
  return normalized;
}
const allowedOrigins=configuredOrigins();
app.use(requestHardening);
app.use(logCompletedRequest);
app.get('/branding-assets/:assetId',(req,res,next)=>{try{const asset=new BrandAssetStore().read(req.params.assetId);res.setHeader('cache-control','public, max-age=31536000, immutable');res.setHeader('cross-origin-resource-policy','same-origin');res.type(asset.mimeType);return res.sendFile(asset.absolutePath);}catch(error){next(error);}});
app.use((request,res,next)=>{const req=request as CrmRequest;if(!req.path.startsWith('/api'))return next();const assessment=assessApiOrigin(req,allowedOrigins);if(req.crm)req.crm.originClassification=assessment.classification;if(!assessment.allowed){if(req.crm)req.crm.rejectionReason='origin-forbidden';res.status(403).json({error:'ORIGIN_FORBIDDEN',message:'The request origin is not permitted',requestId:req.crm?.requestId});return;}next();});
app.use(apiRateLimit);
app.use(cors((req,callback)=>{const assessment=assessApiOrigin(req,allowedOrigins);callback(null,{origin:Boolean(req.header('origin'))&&assessment.allowed});}));
app.use(express.json({limit:'12mb'}));
app.use(express.urlencoded({limit:'12mb',extended:true}));
app.use(authenticateRequest());
app.use(enforceInstanceLifecycle());
app.use('/api/v1',enforcePublicApiContract);
app.use(enforcePermissions());
app.use(assignCreatedOwnership());
app.use(auditSuccessfulRequests());

app.use('/api',authRouter);
app.use('/api',administrationRouter);
app.use('/api',reportingRouter);
app.use('/api',ownershipRouter);
app.use('/api',platformRouter);
app.use('/api',extensionsRouter);
app.use('/api',onboardingRouter);
app.use('/api/settings',settingsRouter);
app.use('/api/customers',customersRouter);
app.use('/api/services',servicesRouter);
app.use('/api/bookings',bookingsRouter);
app.use('/api/invoices',invoicesRouter);
app.use('/api/dashboard',dashboardRouter);
app.use('/api/search',searchRouter);
app.use('/api/custom-fields',customFieldsRouter);
app.use('/api/custom-objects',customObjectsRouter);
app.use('/api/backups',backupsRouter);
app.use('/api/organisations',organisationsRouter);
app.use('/api',contactsRouter);
app.use('/api',engagementsRouter);
app.use('/api',activitiesRouter);
app.use('/api',workspaceRouter);
app.use('/api',operationalRouter);
app.use('/api',connectedCommunicationsRouter);
app.use('/api',communicationsHubRouter);
app.use('/api',releaseHardeningRouter);

// Stable public aliases. Internal unversioned routes remain for frontend compatibility.
app.use('/api/v1/organisations',organisationsRouter);
app.use('/api/v1',contactsRouter);
app.use('/api/v1',engagementsRouter);
app.use('/api/v1',activitiesRouter);
app.use('/api/v1',publicReportingRouter);

if(process.env.NODE_ENV==='test')app.get('/api/__test/unknown-error',()=>{throw new Error('internal test database path /tmp/secret.sqlite constraint stack sqlite');});
app.get('/health',(_req,res)=>res.json({status:'OK',time:new Date().toISOString()}));
app.get('/ready',(_req,res)=>{
  try{
    const connection=getSqliteConnection();const integrity=(connection.pragma('integrity_check',{simple:true}) as string)==='ok';
    const required=['users','teams','roles','audit_events','saved_reports','report_dashboards','api_tokens','webhook_subscriptions','platform_events','webhook_deliveries','extensions','extension_releases','extension_contributions','extension_bindings','extension_migrations','extension_install_attempts','crm_instances','instance_configuration_revisions','instance_publications','instance_readiness_runs','instance_enrolments','instance_devices'];const existing=new Set((connection.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{name:string}>).map((row)=>row.name));const missing=required.filter((table)=>!existing.has(table));
    const paths=getRuntimePaths();for(const directory of [paths.dataDirectory,paths.temporaryDirectory,paths.logDirectory,paths.documentDirectory]){fs.mkdirSync(directory,{recursive:true});fs.accessSync(directory,fs.constants.W_OK);}
    const ready=integrity&&missing.length===0;res.status(ready?200:503).json({status:ready?'READY':'NOT_READY',integrity,missingTables:missing,time:new Date().toISOString()});
  }catch(error){res.status(503).json({status:'NOT_READY',message:error instanceof Error?error.message:'Readiness check failed',time:new Date().toISOString()});}
});

app.use((err:unknown,request:express.Request,res:express.Response,_next:express.NextFunction)=>{
  const req=request as CrmRequest;const requestId=req.crm?.requestId??String(res.getHeader('x-request-id')??'unknown');
  if(err instanceof AppError)return res.status(err.statusCode).json({error:err.code,message:err.message,requestId,...(err.details===undefined?{}:{details:err.details})});
  if(err&&typeof err==='object'&&'name' in err&&String((err as {name:unknown}).name)==='ZodError')return res.status(400).json({error:'VALIDATION_ERROR',message:'Request validation failed',requestId,details:(err as {issues?:unknown}).issues??null});
  console.error('Unhandled Server Error:',{requestId,error:err});return res.status(500).json({error:'INTERNAL_SERVER_ERROR',message:'An unexpected error occurred',requestId});
});

export default app;
