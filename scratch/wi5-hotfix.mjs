import fs from 'node:fs';
function replace(path,search,replacement){const value=fs.readFileSync(path,'utf8');if(value.includes(replacement))return;if(!value.includes(search))throw new Error(`Missing hotfix target in ${path}: ${search.slice(0,120)}`);fs.writeFileSync(path,value.replace(search,replacement));}

replace('backend/src/presentation/routes/operational.ts',
`const booleanQuery = z.preprocess((value) => value === true || value === 'true',z.boolean().default(false));`,
`const booleanQuery: z.ZodType<boolean,z.ZodTypeDef,unknown> = z.preprocess((value) => value === true || value === 'true',z.boolean().default(false));`);

replace('backend/src/presentation/routes/operational.ts',
`const TaskCreate = z.object({
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
const TaskPatch = TaskCreate.omit({ organisationId: true,contactId: true,engagementId: true,activityId: true,sourceType: true,sourceId: true }).partial().refine((value) => Object.keys(value).length > 0,{ message:'At least one task field is required' });`,
`const TaskCreateBase = z.object({
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
}).strict();
const TaskCreate = TaskCreateBase.superRefine((value,ctx) => {
  if (value.reminderAt && value.dueAt && value.reminderAt > value.dueAt) ctx.addIssue({ code: z.ZodIssueCode.custom,path:['reminderAt'],message:'Reminder cannot follow the task due time' });
});
const TaskPatch = TaskCreateBase.omit({ organisationId: true,contactId: true,engagementId: true,activityId: true,sourceType: true,sourceId: true }).partial().refine((value) => Object.keys(value).length > 0,{ message:'At least one task field is required' });`);

replace('backend/src/presentation/routes/operational.ts',
`    res.json(workflows.run({ workflowId:id,...input }));`,
`    res.json(workflows.run({ workflowId:id,...input,context:input.context ?? {} }));`);

replace('frontend/src/pages/Automation.tsx',`import { useState } from 'react';`,`import { type ReactNode,useState } from 'react';`);
replace('frontend/src/pages/Automation.tsx',`children:React.ReactNode`,`children:ReactNode`);
console.log('Applied WI5 compile hotfixes.');
