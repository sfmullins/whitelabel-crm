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
import { AppError } from '../application/errors';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { getRuntimePaths } from '../config/runtimePaths';
import { apiRateLimit,auditSuccessfulRequests,authenticateRequest,enforcePermissions,requestHardening,type CrmRequest } from './middleware/security';

const app=express();
const allowedOrigins=new Set((process.env.CRM_ALLOWED_ORIGINS||'').split(',').map((value)=>value.trim()).filter(Boolean));
app.use(requestHardening);
app.use(apiRateLimit);
app.use(cors({origin(origin,callback){if(!origin)return callback(null,true);let allowed=allowedOrigins.has(origin);try{const host=new URL(origin).hostname;allowed=allowed||host==='localhost'||host==='127.0.0.1'||host==='::1';}catch{/* invalid origins remain denied */}callback(null,allowed);}}));
app.use(express.json({limit:'12mb'}));
app.use(express.urlencoded({limit:'12mb',extended:true}));
app.use((req,res,next)=>{console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} requestId=${res.getHeader('x-request-id')}`);next();});
app.use(authenticateRequest());
app.use(enforcePermissions());
app.use(auditSuccessfulRequests());

app.use('/api',authRouter);
app.use('/api',administrationRouter);
app.use('/api',reportingRouter);
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

if(process.env.NODE_ENV==='test')app.get('/api/__test/unknown-error',()=>{throw new Error('internal test database path /tmp/secret.sqlite constraint stack sqlite');});
app.get('/health',(_req,res)=>res.json({status:'OK',time:new Date().toISOString()}));
app.get('/ready',(_req,res)=>{
  try{
    const connection=getSqliteConnection();const integrity=(connection.pragma('integrity_check',{simple:true}) as string)==='ok';
    const required=['users','roles','audit_events','saved_reports','report_dashboards'];const existing=new Set((connection.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{name:string}>).map((row)=>row.name));const missing=required.filter((table)=>!existing.has(table));
    const paths=getRuntimePaths();for(const directory of [paths.dataDirectory,paths.temporaryDirectory,paths.logDirectory,paths.documentDirectory])fs.accessSync(directory,fs.constants.W_OK);
    const ready=integrity&&missing.length===0;res.status(ready?200:503).json({status:ready?'READY':'NOT_READY',integrity,missingTables:missing,time:new Date().toISOString()});
  }catch(error){res.status(503).json({status:'NOT_READY',message:error instanceof Error?error.message:'Readiness check failed',time:new Date().toISOString()});}
});

app.use((err:unknown,req:CrmRequest,res:express.Response,_next:express.NextFunction)=>{
  if(err instanceof AppError)return res.status(err.statusCode).json({error:err.code,message:err.message,...(err.details===undefined?{}:{details:err.details}),requestId:req.crm?.requestId});
  console.error('Unhandled Server Error:',err);return res.status(500).json({error:'INTERNAL_SERVER_ERROR',message:'An unexpected error occurred',requestId:req.crm?.requestId});
});

export default app;
