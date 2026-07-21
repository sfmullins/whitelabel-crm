import { Router } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../application/errors';
import { ConnectedCommunicationsService } from '../../application/services/ConnectedCommunicationsService';
import { ReminderScheduler } from '../../application/services/ReminderScheduler';

const router=Router();const service=new ConnectedCommunicationsService();const reminders=new ReminderScheduler();
const uuid=z.string().uuid();const idParams=z.object({id:uuid}).strict();
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new ValidationError('Invalid connected-communications request',result.error.flatten());return result.data;}
function forward(next:(error:unknown)=>void,error:unknown){if(error instanceof ValidationError)return next(error);return next(new ValidationError(error instanceof Error?error.message:String(error)));}
const bool=z.preprocess((value)=>value===true||value==='true',z.boolean().default(false));

const AccountCreate=z.object({kind:z.enum(['email','calendar']),name:z.string().trim().min(1).max(120),serverUrl:z.string().url(),username:z.string().trim().min(1).max(320),password:z.string().min(1).max(1000),settings:z.record(z.unknown()).default({}),enabled:z.boolean().default(true)}).strict().superRefine((value,ctx)=>{if(value.kind==='email'&&!value.serverUrl.startsWith('imaps://'))ctx.addIssue({code:z.ZodIssueCode.custom,path:['serverUrl'],message:'Email accounts require an imaps:// endpoint'});if(value.kind==='calendar'&&!value.serverUrl.startsWith('https://'))ctx.addIssue({code:z.ZodIssueCode.custom,path:['serverUrl'],message:'Calendar accounts require an https:// CalDAV endpoint'});});
router.get('/communication-accounts',(req,res,next)=>{try{const query=parse(z.object({includeArchived:bool}).strict(),req.query);res.json(service.listAccounts(query.includeArchived===true));}catch(error){forward(next,error);}});
router.post('/communication-accounts',(req,res,next)=>{try{res.status(201).json(service.createAccount(parse(AccountCreate,req.body)));}catch(error){forward(next,error);}});
router.post('/communication-accounts/:id/test',async(req,res,next)=>{try{const {id}=parse(idParams,req.params);res.json(await service.testAccount(id));}catch(error){forward(next,error);}});
router.post('/communication-accounts/:id/sync',async(req,res,next)=>{try{const {id}=parse(idParams,req.params);res.json(await service.syncAccount(id));}catch(error){forward(next,error);}});
router.post('/communication-accounts/:id/archive',(req,res,next)=>{try{const {id}=parse(idParams,req.params);res.json(service.archiveAccount(id));}catch(error){forward(next,error);}});
router.get('/synchronization-runs',(req,res,next)=>{try{const {limit}=parse(z.object({limit:z.coerce.number().int().min(1).max(500).default(100)}).strict(),req.query);res.json(service.listSyncRuns(limit));}catch(error){forward(next,error);}});

router.get('/email-threads',(req,res,next)=>{try{const query=parse(z.object({status:z.enum(['matched','suggested','unmatched','ignored']).optional(),organisationId:uuid.optional(),limit:z.coerce.number().int().min(1).max(500).default(200)}).strict(),req.query);res.json(service.listEmailThreads(query));}catch(error){forward(next,error);}});
router.get('/email-threads/:id',(req,res,next)=>{try{const {id}=parse(idParams,req.params);res.json(service.getEmailThread(id));}catch(error){forward(next,error);}});
router.post('/email-threads/:id/match',(req,res,next)=>{try{const {id}=parse(idParams,req.params);const body=parse(z.object({organisationId:uuid,contactId:uuid.nullable().optional()}).strict(),req.body);res.json(service.matchEmailThread(id,body.organisationId,body.contactId??null));}catch(error){forward(next,error);}});

router.get('/calendars',(req,res,next)=>{try{const {accountId}=parse(z.object({accountId:uuid.optional()}).strict(),req.query);res.json(service.listCalendars(accountId));}catch(error){forward(next,error);}});
router.get('/calendar-events',(req,res,next)=>{try{const query=parse(z.object({from:z.string().datetime({offset:true}).optional(),to:z.string().datetime({offset:true}).optional(),status:z.enum(['matched','suggested','unmatched','ignored']).optional(),organisationId:uuid.optional(),limit:z.coerce.number().int().min(1).max(1000).default(500)}).strict(),req.query);res.json(service.listCalendarEvents(query));}catch(error){forward(next,error);}});
router.post('/calendar-events/:id/match',(req,res,next)=>{try{const {id}=parse(idParams,req.params);const body=parse(z.object({organisationId:uuid,contactId:uuid.nullable().optional(),engagementId:uuid.nullable().optional()}).strict(),req.body);res.json(service.matchCalendarEvent(id,body.organisationId,body.contactId??null,body.engagementId??null));}catch(error){forward(next,error);}});

router.get('/match-suggestions',(req,res,next)=>{try{const {status}=parse(z.object({status:z.enum(['pending','accepted','rejected','expired']).default('pending')}).strict(),req.query);res.json(service.listSuggestions(status));}catch(error){forward(next,error);}});
router.post('/match-suggestions/:id/reject',(req,res,next)=>{try{const {id}=parse(idParams,req.params);res.json(service.rejectSuggestion(id));}catch(error){forward(next,error);}});
router.post('/reminders/process-due',async(_req,res,next)=>{try{res.json(await reminders.processDue());}catch(error){forward(next,error);}});

export default router;
