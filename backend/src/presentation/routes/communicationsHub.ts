import { Router } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../application/errors';
import { CommunicationsHubService } from '../../application/services/CommunicationsHubService';

const router=Router();
const service=new CommunicationsHubService();
const uuid=z.string().uuid();
const emailAddress=z.object({name:z.string().trim().max(200).optional(),address:z.string().trim().email()}).strict();
const idParams=z.object({id:uuid}).strict();
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new ValidationError('Invalid WI7 communications-hub request',result.error.flatten());return result.data;}
function forward(next:(error:unknown)=>void,error:unknown){if(error instanceof ValidationError)return next(error);return next(new ValidationError(error instanceof Error?error.message:String(error)));}

const draftFields={
  accountId:uuid,threadId:uuid.nullable().optional(),organisationId:uuid.nullable().optional(),contactId:uuid.nullable().optional(),engagementId:uuid.nullable().optional(),
  mode:z.enum(['new','reply','reply_all','forward']).default('new'),inReplyToMessageId:uuid.nullable().optional(),to:z.array(emailAddress).max(100),cc:z.array(emailAddress).max(100).default([]),bcc:z.array(emailAddress).max(100).default([]),subject:z.string().max(998).default(''),bodyText:z.string().max(2_000_000).default(''),bodyHtml:z.string().max(4_000_000).nullable().optional(),documentIds:z.array(uuid).max(50).default([]),
};
const draftCreate=z.object(draftFields).strict();
const draftUpdate=z.object({accountId:uuid.optional(),threadId:uuid.nullable().optional(),organisationId:uuid.nullable().optional(),contactId:uuid.nullable().optional(),engagementId:uuid.nullable().optional(),mode:z.enum(['new','reply','reply_all','forward']).optional(),inReplyToMessageId:uuid.nullable().optional(),to:z.array(emailAddress).max(100).optional(),cc:z.array(emailAddress).max(100).optional(),bcc:z.array(emailAddress).max(100).optional(),subject:z.string().max(998).optional(),bodyText:z.string().max(2_000_000).optional(),bodyHtml:z.string().max(4_000_000).nullable().optional(),documentIds:z.array(uuid).max(50).optional()}).strict().refine((value)=>Object.keys(value).length>0,'At least one field is required');

router.get('/email-drafts',(req,res,next)=>{try{const query=parse(z.object({status:z.enum(['draft','sending','sent','failed','discarded']).optional(),organisationId:uuid.optional(),limit:z.coerce.number().int().min(1).max(500).default(200)}).strict(),req.query);res.json(service.listDrafts(query));}catch(error){forward(next,error);}});
router.post('/email-drafts',(req,res,next)=>{try{res.status(201).json(service.createDraft(parse(draftCreate,req.body)));}catch(error){forward(next,error);}});
router.get('/email-drafts/:id',(req,res,next)=>{try{res.json(service.getDraft(parse(idParams,req.params).id));}catch(error){forward(next,error);}});
router.patch('/email-drafts/:id',(req,res,next)=>{try{res.json(service.updateDraft(parse(idParams,req.params).id,parse(draftUpdate,req.body)));}catch(error){forward(next,error);}});
router.post('/email-drafts/:id/discard',(req,res,next)=>{try{res.json(service.discardDraft(parse(idParams,req.params).id));}catch(error){forward(next,error);}});
router.post('/email-drafts/:id/send',async(req,res,next)=>{try{const id=parse(idParams,req.params).id;const body=parse(z.object({explicitConfirmation:z.literal(true)}).strict(),req.body);res.json(await service.sendDraft(id,body.explicitConfirmation));}catch(error){forward(next,error);}});
router.post('/email-messages/:id/create-draft',(req,res,next)=>{try{const id=parse(idParams,req.params).id;const body=parse(z.object({mode:z.enum(['reply','reply_all','forward'])}).strict(),req.body);res.status(201).json(service.createReplyDraft(id,body.mode));}catch(error){forward(next,error);}});

const calendarEvent=z.object({providerEventKey:z.string().trim().min(1).max(500),etag:z.string().nullable().optional(),title:z.string().trim().min(1).max(500),description:z.string().max(100000).nullable().optional(),location:z.string().max(1000).nullable().optional(),startsAt:z.string().datetime({offset:true}),endsAt:z.string().datetime({offset:true}),timezone:z.string().trim().min(1).max(100),attendees:z.array(emailAddress).max(500),recurrence:z.record(z.unknown()).nullable().optional(),cancelled:z.boolean().optional()}).strict().refine((value)=>new Date(value.endsAt)>new Date(value.startsAt),{message:'Event end must be after start',path:['endsAt']});
router.post('/calendar-events/outbound',async(req,res,next)=>{try{const body=parse(z.object({calendarId:uuid,event:calendarEvent,organisationId:uuid.nullable().optional(),contactId:uuid.nullable().optional(),engagementId:uuid.nullable().optional()}).strict(),req.body);res.status(201).json(await service.createCalendarEvent(body));}catch(error){forward(next,error);}});
router.put('/calendar-events/:id/outbound',async(req,res,next)=>{try{const id=parse(idParams,req.params).id;res.json(await service.updateCalendarEvent(id,parse(calendarEvent,req.body)));}catch(error){forward(next,error);}});
router.post('/calendar-events/:id/cancel',async(req,res,next)=>{try{res.json(await service.cancelCalendarEvent(parse(idParams,req.params).id));}catch(error){forward(next,error);}});
router.post('/calendar-events/:id/complete',(req,res,next)=>{try{const id=parse(idParams,req.params).id;const body=parse(z.object({notes:z.string().trim().min(1).max(100000)}).strict(),req.body);res.json(service.completeMeeting(id,body.notes));}catch(error){forward(next,error);}});

const workflowAction=z.discriminatedUnion('type',[
  z.object({type:z.literal('create_task'),organisationId:uuid.optional(),title:z.string().min(1),description:z.string().optional(),priority:z.enum(['low','normal','high','urgent']).optional(),dueAt:z.string().datetime({offset:true}).optional()}).passthrough(),
  z.object({type:z.literal('create_reminder'),organisationId:uuid.optional(),sourceType:z.string().optional(),sourceId:z.string().optional(),scheduledAt:z.string().datetime({offset:true}).optional(),deliveryMethod:z.enum(['in_app','desktop']).optional()}).passthrough(),
  z.object({type:z.literal('create_activity'),organisationId:uuid.optional(),activityType:z.enum(['note','call','email','meeting','message','other']).optional(),body:z.string().min(1),contactId:uuid.optional(),engagementId:uuid.optional()}).passthrough(),
  z.object({type:z.literal('create_email_draft'),accountId:uuid.optional(),organisationId:uuid.optional(),to:z.array(emailAddress).optional(),cc:z.array(emailAddress).optional(),subject:z.string().min(1),body:z.string().min(1),documentIds:z.array(uuid).optional()}).passthrough(),
]);
const policy=z.object({maxRunsPerHour:z.number().int().min(1).max(10000),timeoutMs:z.number().int().min(100).max(300000),maxDepth:z.number().int().min(1).max(20),dryRun:z.boolean()}).strict();
router.get('/workflow-templates',(_req,res,next)=>{try{res.json(service.listWorkflowTemplates());}catch(error){forward(next,error);}});
router.get('/workflow-studio',(req,res,next)=>{try{const query=parse(z.object({includeArchived:z.preprocess((value)=>value==='true'||value===true,z.boolean().default(false))}).strict(),req.query);res.json(service.listWorkflows(query.includeArchived));}catch(error){forward(next,error);}});
router.get('/workflow-studio/runs',(req,res,next)=>{try{const query=parse(z.object({limit:z.coerce.number().int().min(1).max(500).default(100)}).strict(),req.query);res.json(service.listWorkflowRuns(query.limit));}catch(error){forward(next,error);}});
router.post('/workflow-studio',(req,res,next)=>{try{const body=parse(z.object({name:z.string().trim().min(1).max(200),description:z.string().max(5000).nullable().optional(),enabled:z.boolean().default(false),triggerType:z.string().trim().min(1).max(100),conditions:z.record(z.unknown()).default({}),actions:z.array(workflowAction).min(1).max(20),policy:policy.optional()}).strict(),req.body);res.status(201).json(service.createWorkflow(body));}catch(error){forward(next,error);}});
router.post('/workflow-studio/from-template',(req,res,next)=>{try{const body=parse(z.object({key:z.string().min(1),name:z.string().trim().min(1).max(200).optional()}).strict(),req.body);res.status(201).json(service.createWorkflowFromTemplate(body.key,body.name));}catch(error){forward(next,error);}});
router.patch('/workflow-studio/:id',(req,res,next)=>{try{const id=parse(idParams,req.params).id;const body=parse(z.object({name:z.string().trim().min(1).max(200).optional(),description:z.string().max(5000).nullable().optional(),triggerType:z.string().trim().min(1).max(100).optional(),conditions:z.record(z.unknown()).optional(),actions:z.array(workflowAction).min(1).max(20).optional()}).strict().refine((value)=>Object.keys(value).length>0),req.body);res.json(service.updateWorkflow(id,body));}catch(error){forward(next,error);}});
router.put('/workflow-studio/:id/policy',(req,res,next)=>{try{res.json(service.setWorkflowPolicy(parse(idParams,req.params).id,parse(policy,req.body)));}catch(error){forward(next,error);}});
router.post('/workflow-studio/:id/enable',(req,res,next)=>{try{const id=parse(idParams,req.params).id;const body=parse(z.object({enabled:z.boolean()}).strict(),req.body);res.json(service.setWorkflowEnabled(id,body.enabled));}catch(error){forward(next,error);}});
router.post('/workflow-studio/:id/duplicate',(req,res,next)=>{try{const id=parse(idParams,req.params).id;const body=parse(z.object({name:z.string().trim().min(1).max(200)}).strict(),req.body);res.status(201).json(service.duplicateWorkflow(id,body.name));}catch(error){forward(next,error);}});
router.post('/workflow-studio/:id/dry-run',(req,res,next)=>{try{const id=parse(idParams,req.params).id;const body=parse(z.object({context:z.record(z.unknown()).default({})}).strict(),req.body);res.json(service.dryRunWorkflow(id,body.context));}catch(error){forward(next,error);}});
router.post('/workflow-studio/:id/archive',(req,res,next)=>{try{res.json(service.archiveWorkflow(parse(idParams,req.params).id));}catch(error){forward(next,error);}});
router.post('/workflow-runs/:id/retry',(req,res,next)=>{try{res.json(service.retryWorkflowRun(parse(idParams,req.params).id));}catch(error){forward(next,error);}});

router.get('/operations-health',(_req,res,next)=>{try{res.json(service.health());}catch(error){forward(next,error);}});
router.post('/operations-maintenance',(req,res,next)=>{try{const body=parse(z.object({operation:z.enum(['document_integrity','search_reindex','communication_relink','storage_report'])}).strict(),req.body);res.json(service.runMaintenance(body.operation));}catch(error){forward(next,error);}});

export default router;
