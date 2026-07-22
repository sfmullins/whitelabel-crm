import { Router } from 'express';
import { z } from 'zod';
import { ReportingRepository,type ReportFilters,type ReportKey } from '../../infrastructure/database/ReportingRepository';
import { ScheduledReportService } from '../../application/services/ScheduledReportService';
import type { CrmRequest } from '../middleware/security';

const router=Router();
const reporting=new ReportingRepository();
const scheduledReports=new ScheduledReportService();
const reportKey=z.enum(['executive','revenue','pipeline','activity','workload','concentration','operations']);
const uuid=z.string().uuid();
const filters=z.object({from:z.string().datetime({offset:true}).optional(),to:z.string().datetime({offset:true}).optional(),ownerUserId:uuid.optional(),teamId:uuid.optional()}).strict();
const visibility=z.enum(['private','team','all']);
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new Error(result.error.issues.map((issue)=>issue.message).join('; '));return result.data;}
function identity(req:CrmRequest){if(!req.crm?.identity)throw new Error('Authenticated identity unavailable');return req.crm.identity;}
function fail(res:any,error:unknown){const message=error instanceof Error?error.message:String(error);const status=/not found|unavailable/i.test(message)?404:/only the owner|permission/i.test(message)?403:400;res.status(status).json({error:'REPORTING_ERROR',message});}

router.get('/reporting/catalog',(_req,res)=>res.json({reports:[
  {key:'executive',name:'Executive overview',description:'Client, engagement, work, activity and financial KPIs'},
  {key:'revenue',name:'Revenue and receivables',description:'Invoiced, collected, outstanding and aging'},
  {key:'pipeline',name:'Client and engagement pipeline',description:'Lifecycle, engagement status and new organisations'},
  {key:'activity',name:'Activity and communications',description:'Activity cadence, type mix and channels'},
  {key:'workload',name:'Workload',description:'Open, overdue and completed tasks by owner'},
  {key:'concentration',name:'Revenue concentration',description:'Collected revenue by organisation'},
  {key:'operations',name:'Operational health',description:'Sync, workflow, reminder, reconciliation and session health'},
],widgets:['executive_kpis','revenue_trend','pipeline_status','activity_mix','workload','concentration','operations']}));

router.get('/reporting/saved',(req:CrmRequest,res)=>res.json(reporting.listSavedReports(identity(req))));
router.post('/reporting/saved',(req:CrmRequest,res)=>{try{const input=parse(z.object({name:z.string().trim().min(1).max(160),description:z.string().trim().max(1000).nullable().optional(),reportKey,filters:filters.optional(),visibility:visibility.optional(),teamId:uuid.nullable().optional()}).strict(),req.body);res.status(201).json(reporting.createSavedReport(identity(req),input));}catch(error){fail(res,error);}});
router.patch('/reporting/saved/:id',(req:CrmRequest,res)=>{try{const {id}=parse(z.object({id:uuid}).strict(),req.params);const input=parse(z.object({name:z.string().trim().min(1).max(160).optional(),description:z.string().trim().max(1000).nullable().optional(),filters:filters.optional(),visibility:visibility.optional(),teamId:uuid.nullable().optional(),archived:z.boolean().optional()}).strict().refine((value)=>Object.keys(value).length>0),req.body);res.json(reporting.updateSavedReport(identity(req),id,input));}catch(error){fail(res,error);}});

router.get('/reporting/dashboards',(req:CrmRequest,res)=>res.json(reporting.listDashboards(identity(req))));
router.post('/reporting/dashboards',(req:CrmRequest,res)=>{try{const input=parse(z.object({name:z.string().trim().min(1).max(160),description:z.string().trim().max(1000).nullable().optional(),visibility:visibility.optional(),teamId:uuid.nullable().optional(),widgets:z.array(z.object({widgetKey:z.string(),title:z.string().trim().max(160).optional(),config:z.record(z.unknown()).optional()}).strict()).max(20).optional()}).strict(),req.body);res.status(201).json(reporting.createDashboard(identity(req),input));}catch(error){fail(res,error);}});
router.patch('/reporting/dashboards/:id',(req:CrmRequest,res)=>{try{const {id}=parse(z.object({id:uuid}).strict(),req.params);const input=parse(z.object({name:z.string().trim().min(1).max(160).optional(),description:z.string().trim().max(1000).nullable().optional(),visibility:visibility.optional(),teamId:uuid.nullable().optional(),isDefault:z.boolean().optional(),archived:z.boolean().optional()}).strict().refine((value)=>Object.keys(value).length>0),req.body);res.json(reporting.updateDashboard(identity(req),id,input));}catch(error){fail(res,error);}});
router.post('/reporting/dashboards/:id/widgets',(req:CrmRequest,res)=>{try{const {id}=parse(z.object({id:uuid}).strict(),req.params);const input=parse(z.object({widgetKey:z.string(),title:z.string().trim().max(160).optional(),position:z.number().int().min(0).max(100).optional(),config:z.record(z.unknown()).optional()}).strict(),req.body);res.status(201).json(reporting.addDashboardWidget(identity(req),id,input));}catch(error){fail(res,error);}});
router.delete('/reporting/widgets/:id',(req:CrmRequest,res)=>{try{const {id}=parse(z.object({id:uuid}).strict(),req.params);res.json(reporting.removeDashboardWidget(identity(req),id));}catch(error){fail(res,error);}});

router.get('/reporting/schedules',(req:CrmRequest,res)=>res.json(reporting.listSchedules(identity(req))));
router.post('/reporting/schedules',(req:CrmRequest,res)=>{try{const input=parse(z.object({savedReportId:uuid,cadence:z.enum(['daily','weekly','monthly']),nextRunAt:z.string().datetime({offset:true})}).strict(),req.body);res.status(201).json(reporting.createSchedule(identity(req),input));}catch(error){fail(res,error);}});
router.post('/reporting/schedules/process',async (_req,res)=>{try{res.json(await scheduledReports.processDue());}catch(error){fail(res,error);}});
router.get('/reporting/schedule-runs',(req:CrmRequest,res)=>{try{const {limit}=parse(z.object({limit:z.coerce.number().int().min(1).max(500).default(100)}).strict(),req.query);res.json(scheduledReports.listRuns(identity(req),limit));}catch(error){fail(res,error);}});
router.get('/reporting/schedule-runs/:id/download',(req:CrmRequest,res)=>{try{const {id}=parse(z.object({id:uuid}).strict(),req.params);const file=scheduledReports.getDownload(identity(req),id);res.download(file.path,file.filename);}catch(error){fail(res,error);}});

router.get('/reporting/:key/export.csv',(req:CrmRequest,res)=>{try{const key=parse(reportKey,req.params.key) as ReportKey;const query=parse(filters,req.query) as ReportFilters;const exported=reporting.exportCsv(key,query);res.setHeader('content-type','text/csv; charset=utf-8');res.setHeader('content-disposition',`attachment; filename="${exported.filename}"`);res.send(exported.content);}catch(error){fail(res,error);}});
router.get('/reporting/:key',(req,res)=>{try{const key=parse(reportKey,req.params.key) as ReportKey;res.json(reporting.run(key,parse(filters,req.query)));}catch(error){fail(res,error);}});

export default router;
