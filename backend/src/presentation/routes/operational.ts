import { Router } from 'express';
import { z } from 'zod';
import { DocumentService } from '../../application/services/DocumentService';
import { ValidationError } from '../../application/errors';
import { WorkRepository } from '../../infrastructure/database/WorkRepository';
import { CommunicationRepository } from '../../infrastructure/database/CommunicationRepository';
import { WorkflowRepository } from '../../infrastructure/database/WorkflowRepository';
import { OperationalTimelineRepository } from '../../infrastructure/database/OperationalTimelineRepository';

const router = Router();
const work = new WorkRepository();
const documents = new DocumentService();
const communications = new CommunicationRepository();
const workflows = new WorkflowRepository();
const timeline = new OperationalTimelineRepository();

const uuid = z.string().uuid();
const optionalUuid = uuid.nullable().optional();
const iso = z.string().datetime({ offset: true });
const booleanQuery = z.preprocess((value) => value === true || value === 'true',z.boolean().default(false));
const idParams = z.object({ id: uuid }).strict();
const organisationParams = z.object({ organisationId: uuid }).strict();

function parse<T>(schema: z.ZodType<T>,value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError('Invalid operational request',result.error.flatten());
  return result.data;
}

function forward(next: (error: unknown) => void,error: unknown) {
  if (error instanceof ValidationError) return next(error);
  const message = error instanceof Error ? error.message : String(error);
  return next(new ValidationError(message));
}

const WorkQuery = z.object({
  bucket: z.enum(['overdue','today','upcoming','completed','open','all']).default('open'),
  organisationId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();
const TaskCreate = z.object({
  organisationId: uuid,
  contactId: optionalUuid,
  engagementId: optionalUuid,
  activityId: optionalUuid,
  sourceType: z.string().trim().min(1).max(40).nullable().optional(),
  sourceId: z.string().trim().min(1).max(120).nullable().optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(['open','in_progress','blocked','completed','cancelled']).default('open'),
  priority: z.enum(['low','normal','high','urgent']).default('normal'),
  dueAt: iso.nullable().optional(),
  reminderAt: iso.nullable().optional(),
  recurrenceRule: z.string().trim().max(500).nullable().optional(),
  assignedTo: z.string().trim().max(120).nullable().optional(),
}).strict().superRefine((value,ctx) => {
  if (value.reminderAt && value.dueAt && value.reminderAt > value.dueAt) ctx.addIssue({ code: z.ZodIssueCode.custom,path:['reminderAt'],message:'Reminder cannot follow the task due time' });
});
const TaskPatch = TaskCreate.omit({ organisationId: true,contactId: true,engagementId: true,activityId: true,sourceType: true,sourceId: true }).partial().refine((value) => Object.keys(value).length > 0,{ message:'At least one task field is required' });

router.get('/work',(req,res,next) => {
  try { res.json(work.listWork(parse(WorkQuery,req.query))); } catch (error) { forward(next,error); }
});
router.get('/tasks',(req,res,next) => {
  try {
    const query = parse(z.object({ organisationId: uuid.optional(),includeArchived: booleanQuery }).strict(),req.query);
    res.json(work.listTasks(query));
  } catch (error) { forward(next,error); }
});
router.post('/tasks',(req,res,next) => {
  try { res.status(201).json(work.createTask(parse(TaskCreate,req.body))); } catch (error) { forward(next,error); }
});
router.patch('/tasks/:id',(req,res,next) => {
  try { const { id }=parse(idParams,req.params); res.json(work.updateTask(id,parse(TaskPatch,req.body))); } catch (error) { forward(next,error); }
});
for (const [path,action] of [
  ['complete',(id: string) => work.completeTask(id)],
  ['reopen',(id: string) => work.reopenTask(id)],
  ['archive',(id: string) => work.archiveTask(id)],
] as const) {
  router.post(`/tasks/:id/${path}`,(req,res,next) => {
    try { const { id }=parse(idParams,req.params); res.json(action(id)); } catch (error) { forward(next,error); }
  });
}

const ReminderCreate = z.object({
  sourceType: z.enum(['task','activity','communication','calendar_event','engagement','invoice']),
  sourceId: z.string().trim().min(1).max(120),
  organisationId: optionalUuid,
  scheduledAt: iso,
  deliveryMethod: z.enum(['in_app','desktop']).default('in_app'),
}).strict();
router.get('/reminders',(req,res,next) => {
  try {
    const query=parse(z.object({ status: z.enum(['pending','delivered','dismissed','failed','cancelled']).optional(),dueOnly: booleanQuery }).strict(),req.query);
    res.json(work.listReminders(query));
  } catch (error) { forward(next,error); }
});
router.post('/reminders',(req,res,next) => {
  try { res.status(201).json(work.createReminder(parse(ReminderCreate,req.body))); } catch (error) { forward(next,error); }
});
router.post('/reminders/:id/:action',(req,res,next) => {
  try {
    const value=parse(z.object({ id: uuid,action: z.enum(['delivered','dismissed','failed','cancelled']) }).strict(),req.params);
    const body=parse(z.object({ failureReason: z.string().max(1000).nullable().optional() }).strict(),req.body ?? {});
    res.json(work.updateReminderStatus(value.id,value.action,body.failureReason));
  } catch (error) { forward(next,error); }
});

const DocumentLink = z.object({ entityType: z.enum(['organisation','contact','engagement','activity','task','communication','calendar_event']),entityId: uuid }).strict();
const DocumentUpload = z.object({
  title: z.string().trim().min(1).max(180),
  filename: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(160),
  contentBase64: z.string().min(1).max(12_000_000),
  description: z.string().trim().max(5000).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  versionNote: z.string().trim().max(500).nullable().optional(),
  links: z.array(DocumentLink).min(1).max(20),
}).strict();
router.get('/documents',(req,res,next) => {
  try {
    const query=parse(z.object({ organisationId: uuid.optional(),includeArchived: booleanQuery }).strict(),req.query);
    res.json(documents.list(query));
  } catch (error) { forward(next,error); }
});
router.get('/documents/integrity',(req,res,next) => {
  try { res.json(documents.integrityReport()); } catch (error) { forward(next,error); }
});
router.post('/documents',(req,res,next) => {
  try { res.status(201).json(documents.upload(parse(DocumentUpload,req.body))); } catch (error) { forward(next,error); }
});
router.get('/documents/:id/content',(req,res,next) => {
  try {
    const { id }=parse(idParams,req.params);
    const file=documents.content(id);
    res.setHeader('content-type',file.mimeType);
    res.setHeader('content-disposition',`inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    res.send(file.content);
  } catch (error) { forward(next,error); }
});
router.post('/documents/:id/versions',(req,res,next) => {
  try {
    const { id }=parse(idParams,req.params);
    const input=parse(DocumentUpload.omit({ title: true,links: true,description: true,category: true }),req.body);
    res.status(201).json(documents.addVersion(id,input));
  } catch (error) { forward(next,error); }
});
router.patch('/documents/:id',(req,res,next) => {
  try {
    const { id }=parse(idParams,req.params);
    const input=parse(z.object({ title: z.string().trim().min(1).max(180).optional(),description: z.string().trim().max(5000).nullable().optional(),category: z.string().trim().max(80).nullable().optional() }).strict().refine((value) => Object.keys(value).length>0),req.body);
    res.json(documents.updateMetadata(id,input));
  } catch (error) { forward(next,error); }
});
router.post('/documents/:id/links',(req,res,next) => {
  try { const { id }=parse(idParams,req.params); const link=parse(DocumentLink,req.body); res.json(documents.addLink(id,link.entityType,link.entityId)); } catch (error) { forward(next,error); }
});
router.post('/documents/:id/archive',(req,res,next) => {
  try { const { id }=parse(idParams,req.params); res.json(documents.archive(id)); } catch (error) { forward(next,error); }
});
router.post('/documents/:id/restore',(req,res,next) => {
  try { const { id }=parse(idParams,req.params); res.json(documents.restore(id)); } catch (error) { forward(next,error); }
});

const CommunicationCreate = z.object({
  organisationId: uuid,
  contactId: optionalUuid,
  engagementId: optionalUuid,
  channel: z.enum(['email','meeting','phone','sms','whatsapp','teams','slack','voip','other']),
  direction: z.enum(['inbound','outbound','internal']).default('internal'),
  subject: z.string().trim().max(300).nullable().optional(),
  body: z.string().trim().min(1).max(100_000),
  occurredAt: iso,
  externalId: z.string().trim().max(500).nullable().optional(),
  threadKey: z.string().trim().max(500).nullable().optional(),
  status: z.enum(['logged','matched','unmatched','ignored','draft','sent','failed']).default('logged'),
}).strict();
router.get('/communications',(req,res,next) => {
  try {
    const query=parse(z.object({ organisationId: uuid.optional(),channel: CommunicationCreate.shape.channel.optional(),status: CommunicationCreate.shape.status.optional(),includeArchived: booleanQuery,limit: z.coerce.number().int().min(1).max(500).default(200) }).strict(),req.query);
    res.json(communications.list(query));
  } catch (error) { forward(next,error); }
});
router.post('/communications',(req,res,next) => {
  try { res.status(201).json(communications.create(parse(CommunicationCreate,req.body))); } catch (error) { forward(next,error); }
});
router.post('/communications/:id/archive',(req,res,next) => {
  try { const { id }=parse(idParams,req.params); res.json(communications.archive(id)); } catch (error) { forward(next,error); }
});

const WorkflowAction = z.discriminatedUnion('type',[
  z.object({ type: z.literal('create_task'),organisationId: uuid.optional(),title: z.string().min(1).max(160),description: z.string().max(5000).optional(),priority: z.enum(['low','normal','high','urgent']).optional(),dueAt: iso.optional() }).strict(),
  z.object({ type: z.literal('create_reminder'),organisationId: uuid.optional(),sourceType: z.string().max(40).optional(),sourceId: z.string().max(120).optional(),scheduledAt: iso.optional(),deliveryMethod: z.enum(['in_app','desktop']).optional() }).strict(),
  z.object({ type: z.literal('create_activity'),organisationId: uuid.optional(),contactId: uuid.optional(),engagementId: uuid.optional(),activityType: z.enum(['note','call','email','meeting','message','other']).optional(),body: z.string().min(1).max(5000) }).strict(),
]);
const WorkflowCreate = z.object({ name: z.string().trim().min(1).max(160),description: z.string().trim().max(1000).nullable().optional(),enabled: z.boolean().default(true),triggerType: z.string().trim().min(1).max(80),conditions: z.record(z.unknown()).default({}),actions: z.array(WorkflowAction).min(1).max(20) }).strict();
router.get('/workflows',(_req,res,next) => { try { res.json(workflows.listDefinitions()); } catch (error) { forward(next,error); } });
router.post('/workflows',(req,res,next) => { try { res.status(201).json(workflows.createDefinition(parse(WorkflowCreate,req.body))); } catch (error) { forward(next,error); } });
router.patch('/workflows/:id/enabled',(req,res,next) => {
  try { const { id }=parse(idParams,req.params); const { enabled }=parse(z.object({ enabled:z.boolean() }).strict(),req.body); res.json(workflows.setEnabled(id,enabled)); } catch (error) { forward(next,error); }
});
router.post('/workflows/:id/run',(req,res,next) => {
  try {
    const { id }=parse(idParams,req.params);
    const input=parse(z.object({ sourceType: z.string().min(1).max(80),sourceId: z.string().min(1).max(160),triggerEvent: z.string().min(1).max(100),idempotencyKey: z.string().min(8).max(300),context: z.record(z.unknown()).default({}) }).strict(),req.body);
    res.json(workflows.run({ workflowId:id,...input }));
  } catch (error) { forward(next,error); }
});
router.get('/workflow-runs',(_req,res,next) => { try { res.json(workflows.listRuns()); } catch (error) { forward(next,error); } });

router.get('/organisations/:organisationId/operational-timeline',(req,res,next) => {
  try { const { organisationId }=parse(organisationParams,req.params); res.json(timeline.list(organisationId)); } catch (error) { forward(next,error); }
});
router.get('/workspace/operational-summary',(_req,res,next) => { try { res.json(timeline.summary()); } catch (error) { forward(next,error); } });

export default router;
