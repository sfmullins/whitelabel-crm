import { Router } from 'express';
import { z } from 'zod';
import { ReportingRepository,type ReportFilters,type ReportKey } from '../../infrastructure/database/ReportingRepository';

const router=Router();
const reporting=new ReportingRepository();
const reportKey=z.enum(['executive','revenue','pipeline','activity','workload','concentration','operations']);
const uuid=z.string().uuid();
const filters=z.object({from:z.string().datetime({offset:true}).optional(),to:z.string().datetime({offset:true}).optional(),ownerUserId:uuid.optional(),teamId:uuid.optional()}).strict();
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new Error(result.error.issues.map((issue)=>issue.message).join('; '));return result.data;}
function fail(res:any,error:unknown):void{const message=error instanceof Error?error.message:String(error);res.status(/not found|unavailable/i.test(message)?404:400).json({error:'REPORTING_ERROR',message});}

router.get('/reporting/catalog',(_req,res)=>res.json({reports:[
  {key:'executive',name:'Executive overview',description:'Client, engagement, work, activity and financial KPIs'},
  {key:'revenue',name:'Revenue and receivables',description:'Invoiced, collected, outstanding and aging'},
  {key:'pipeline',name:'Client and engagement pipeline',description:'Lifecycle, engagement status and new organisations'},
  {key:'activity',name:'Activity and communications',description:'Activity cadence, type mix and channels'},
  {key:'workload',name:'Workload',description:'Open, overdue and completed tasks by owner'},
  {key:'concentration',name:'Revenue concentration',description:'Collected revenue by organisation'},
  {key:'operations',name:'Operational health',description:'Sync, workflow, reminder, reconciliation and session health'},
]}));
router.get('/reporting/:key/export.csv',(req,res)=>{try{const key=parse(reportKey,req.params.key) as ReportKey;const query=parse(filters,req.query) as ReportFilters;const exported=reporting.exportCsv(key,query);res.setHeader('content-type','text/csv; charset=utf-8');res.setHeader('content-disposition',`attachment; filename="${exported.filename}"`);res.send(exported.content);}catch(error){fail(res,error);}});
router.get('/reporting/:key',(req,res)=>{try{const key=parse(reportKey,req.params.key) as ReportKey;res.json(reporting.run(key,parse(filters,req.query)));}catch(error){fail(res,error);}});

export default router;
