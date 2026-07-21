import crypto from 'node:crypto';
import { CommunicationsHubRepository, type DraftInput } from '../../infrastructure/database/CommunicationsHubRepository';
import { CredentialVault } from '../../infrastructure/security/CredentialVault';
import { SmtpSendAdapter } from '../../infrastructure/integrations/SmtpSendAdapter';
import { CalDavWriteAdapter } from '../../infrastructure/integrations/CalDavWriteAdapter';
import type { CalendarWriteAdapter, CalendarWriteInput, EmailSendAdapter } from '../../infrastructure/integrations/OutboundAdapters';
import { FUTURE_CHANNELS } from '../../infrastructure/integrations/OutboundAdapters';
import type { ConnectedAccountConfig, EmailAddress } from '../../infrastructure/integrations/ConnectedAdapters';
import { DocumentService } from './DocumentService';
import { WorkflowRepository, type WorkflowAction } from '../../infrastructure/database/WorkflowRepository';
import { WorkflowTriggerService } from './WorkflowTriggerService';
import { rebuildSearchIndex } from '../../infrastructure/database/WorkspaceRepository';
import { getSqliteConnection } from '../../infrastructure/database/connection';

function parseJson<T>(value:unknown,fallback:T):T{if(typeof value!=='string')return fallback;try{return JSON.parse(value) as T;}catch{return fallback;}}

export class CommunicationsHubService {
  constructor(
    private readonly repository=new CommunicationsHubRepository(),
    private readonly vault=new CredentialVault(),
    private readonly sender:EmailSendAdapter=new SmtpSendAdapter(),
    private readonly calendarWriter:CalendarWriteAdapter=new CalDavWriteAdapter(),
    private readonly documents=new DocumentService(),
    private readonly workflows=new WorkflowRepository(),
    private readonly triggers=new WorkflowTriggerService(),
  ){}

  listDrafts(input:{status?:string;organisationId?:string;limit?:number}={}){return this.repository.listDrafts(input);}
  getDraft(id:string):any{const value=this.repository.getDraft(id);if(!value)throw new Error('Draft not found');return value;}
  createDraft(input:DraftInput){this.validateRecipients(input.to,input.cc??[],input.bcc??[]);return this.repository.createDraft(input);}
  updateDraft(id:string,input:Partial<DraftInput>){if(input.to||input.cc||input.bcc)this.validateRecipients(input.to??[],input.cc??[],input.bcc??[]);return this.repository.updateDraft(id,input);}
  discardDraft(id:string){return this.repository.discardDraft(id);}

  createReplyDraft(messageId:string,mode:'reply'|'reply_all'|'forward'){
    const row=getSqliteConnection().prepare(`SELECT m.*,a.username AS account_username,t.organisation_id,t.contact_id FROM email_messages m JOIN communication_accounts a ON a.id=m.account_id JOIN email_threads t ON t.id=m.thread_id WHERE m.id=?`).get(messageId) as Record<string,unknown>|undefined;
    if(!row)throw new Error('Email message not found');
    const from=parseJson<EmailAddress>(row.sender_json,{address:''});
    const recipients=parseJson<{to:EmailAddress[];cc:EmailAddress[];bcc:EmailAddress[]}>(row.recipients_json,{to:[],cc:[],bcc:[]});
    const originalSubject=String(row.subject??'');
    const prefix=mode==='forward'?'Fwd:':'Re:';
    const subject=/^(re|fwd):/i.test(originalSubject)?originalSubject:`${prefix} ${originalSubject}`.trim();
    const to=mode==='forward'?[]:[from];
    const accountUsername=String(row.account_username??'').toLowerCase();
    const cc=mode==='reply_all'?[...recipients.to,...recipients.cc].filter((value)=>value.address.toLowerCase()!==accountUsername&&value.address.toLowerCase()!==from.address.toLowerCase()):[];
    const quoted=`\n\nOn the previous message, ${from.address} wrote:\n${String(row.body_text??'').split('\n').map((line)=>`> ${line}`).join('\n')}`;
    return this.repository.createDraft({accountId:String(row.account_id),threadId:String(row.thread_id),organisationId:row.organisation_id?String(row.organisation_id):null,contactId:row.contact_id?String(row.contact_id):null,mode,inReplyToMessageId:messageId,to,cc,subject,bodyText:mode==='forward'?`\n\n---------- Forwarded message ----------${quoted}`:quoted});
  }

  async sendDraft(id:string,explicitConfirmation:boolean){
    if(explicitConfirmation!==true)throw new Error('Explicit send confirmation is required');
    const draft=this.getDraft(id);if(!['draft','failed'].includes(draft.status))throw new Error('Draft is not available to send');
    this.validateRecipients(draft.to,draft.cc,draft.bcc);
    if(!draft.subject.trim())throw new Error('Email subject is required');
    if(!draft.bodyText.trim()&&!draft.bodyHtml?.trim())throw new Error('Email body is required');
    const account=this.repository.getAccount(draft.accountId) as any;if(!account||!account.enabled)throw new Error('Email account is unavailable');
    const secret=this.vault.read(String(account.credentialKey));
    const original=draft.inReplyToMessageId?this.repository.getOriginalMessage(draft.inReplyToMessageId):null;
    const fromAddress=String(account.settings.fromAddress??account.username);const fromName=String(account.settings.fromName??'');
    const messageId=`${crypto.randomUUID()}@whitelabelcrm.local`;
    const attachments=draft.documents.map((document)=>{const content=this.documents.content(document.documentId);return {filename:content.filename,mimeType:content.mimeType,content:content.content};});
    const attempt=this.repository.startSendAttempt(id,draft.accountId);this.repository.markDraftSending(id);
    try{
      const result=await this.sender.send(this.config(account),secret,{messageId,from:{address:fromAddress,name:fromName||undefined},to:draft.to,cc:draft.cc,bcc:draft.bcc,subject:draft.subject,bodyText:draft.bodyText,bodyHtml:draft.bodyHtml,inReplyTo:original?.rfcMessageId??null,references:original?.rfcMessageId?[String(original.rfcMessageId)]:[],attachments});
      const sentAt=new Date().toISOString();const stored=this.repository.recordSentMessage(id,{providerMessageKey:result.providerMessageKey,rfcMessageId:messageId,from:{address:fromAddress,name:fromName||undefined},sentAt});
      this.repository.finishSendAttempt(attempt.id,{status:'succeeded',providerMessageKey:result.providerMessageKey,rfcMessageId:messageId});
      this.triggers.trigger({triggerType:'email_sent',sourceType:'email_message',sourceId:stored.messageId,eventId:stored.messageId,context:{accountId:draft.accountId,organisationId:draft.organisationId,contactId:draft.contactId,engagementId:draft.engagementId,threadId:stored.threadId,subject:draft.subject}});
      return {...this.getDraft(id),accepted:result.accepted,rejected:result.rejected};
    }catch(error){const message=error instanceof Error?error.message:String(error);this.repository.finishSendAttempt(attempt.id,{status:'failed',errorSummary:message});this.repository.markDraftFailed(id,message);throw error;}
  }

  async createCalendarEvent(input:{calendarId:string;event:CalendarWriteInput;organisationId?:string|null;contactId?:string|null;engagementId?:string|null}){
    const calendar=this.requireCalendar(input.calendarId);const operation=this.repository.startCalendarOperation(input.calendarId,'create',null,null,input.event);
    try{const result=await this.calendarWriter.create(this.config(calendar),this.vault.read(String(calendar.credentialKey)),String(calendar.providerCalendarKey),input.event);const stored=this.repository.createLocalCalendarEvent(input.calendarId,input.event,{organisationId:input.organisationId,contactId:input.contactId,engagementId:input.engagementId,etag:result.etag});this.repository.finishCalendarOperation(operation.id,{status:'succeeded',etag:result.etag,providerEventKey:result.providerEventKey});this.triggers.trigger({triggerType:'calendar_event_created',sourceType:'calendar_event',sourceId:stored.id,eventId:stored.id,context:{organisationId:stored.organisationId,contactId:stored.contactId,engagementId:stored.engagementId,title:stored.title,startsAt:stored.startsAt,endsAt:stored.endsAt}});return stored;}catch(error){this.finishCalendarFailure(operation.id,error);throw error;}
  }
  async updateCalendarEvent(id:string,event:CalendarWriteInput){const current=this.requireEvent(id);const calendar=this.requireCalendar(current.calendarId);const operation=this.repository.startCalendarOperation(current.calendarId,'update',id,current.etag,event);try{const result=await this.calendarWriter.update(this.config(calendar),this.vault.read(String(calendar.credentialKey)),String(calendar.providerCalendarKey),{...event,providerEventKey:current.providerEventKey,etag:current.etag});const stored=this.repository.updateLocalCalendarEvent(id,{...event,providerEventKey:current.providerEventKey,etag:current.etag},result.etag);this.repository.finishCalendarOperation(operation.id,{status:'succeeded',etag:result.etag,providerEventKey:result.providerEventKey});return stored;}catch(error){this.finishCalendarFailure(operation.id,error);throw error;}}
  async cancelCalendarEvent(id:string){const current=this.requireEvent(id);const calendar=this.requireCalendar(current.calendarId);const event:CalendarWriteInput={providerEventKey:current.providerEventKey,etag:current.etag,title:current.title,description:current.description,location:current.location,startsAt:current.startsAt,endsAt:current.endsAt,timezone:current.timezone,recurrence:current.recurrence,attendees:current.attendees,cancelled:true};const operation=this.repository.startCalendarOperation(current.calendarId,'cancel',id,current.etag,event);try{const result=await this.calendarWriter.cancel(this.config(calendar),this.vault.read(String(calendar.credentialKey)),String(calendar.providerCalendarKey),event);const stored=this.repository.updateLocalCalendarEvent(id,event,result.etag);this.repository.finishCalendarOperation(operation.id,{status:'succeeded',etag:result.etag,providerEventKey:result.providerEventKey});return stored;}catch(error){this.finishCalendarFailure(operation.id,error);throw error;}}
  completeMeeting(id:string,notes:string){const event=this.requireEvent(id);const operation=this.repository.startCalendarOperation(event.calendarId,'complete',id,event.etag,{notes});try{const result=this.repository.completeMeeting(id,notes);this.repository.finishCalendarOperation(operation.id,{status:'succeeded',etag:event.etag,providerEventKey:event.providerEventKey});this.triggers.trigger({triggerType:'meeting_completed',sourceType:'calendar_event',sourceId:id,eventId:`meeting-completed:${id}`,context:{organisationId:event.organisationId,contactId:event.contactId,engagementId:event.engagementId,title:event.title,scheduledAt:new Date().toISOString()}});return result;}catch(error){this.finishCalendarFailure(operation.id,error);throw error;}}

  listWorkflowTemplates(){return this.repository.listTemplates();}
  listWorkflows(includeArchived=false){return this.workflows.listDefinitions(includeArchived);}
  listWorkflowRuns(limit=100){return this.workflows.listRuns(limit);}
  createWorkflow(input:{name:string;description?:string|null;enabled?:boolean;triggerType:string;conditions?:unknown;actions:WorkflowAction[];policy?:{maxRunsPerHour:number;timeoutMs:number;maxDepth:number;dryRun:boolean}}){const workflow=this.workflows.createDefinition(input);if(input.policy)this.repository.setWorkflowPolicy(String(workflow.id),input.policy);return this.workflows.getDefinition(String(workflow.id));}
  createWorkflowFromTemplate(key:string,name?:string){const template=this.repository.getTemplate(key) as any;if(!template)throw new Error('Workflow template not found');return this.workflows.createDefinition({name:name?.trim()||template.name,description:template.description,enabled:false,triggerType:template.triggerType,conditions:template.conditions,actions:template.actions as WorkflowAction[]});}
  updateWorkflow(id:string,input:{name?:string;description?:string|null;triggerType?:string;conditions?:unknown;actions?:WorkflowAction[]}){return this.workflows.updateDefinition(id,input);}
  setWorkflowEnabled(id:string,enabled:boolean){return this.workflows.setEnabled(id,enabled);}
  archiveWorkflow(id:string){return this.workflows.archiveDefinition(id);}
  duplicateWorkflow(id:string,name:string){const newId=this.repository.duplicateWorkflow(id,name);const source=this.repository.getWorkflowPolicy(id) as any;this.repository.setWorkflowPolicy(newId,{maxRunsPerHour:source.maxRunsPerHour,timeoutMs:source.timeoutMs,maxDepth:source.maxDepth,dryRun:source.dryRun});return this.workflows.getDefinition(newId);}
  setWorkflowPolicy(id:string,input:{maxRunsPerHour:number;timeoutMs:number;maxDepth:number;dryRun:boolean}){if(!this.workflows.getDefinition(id))throw new Error('Workflow not found');return this.repository.setWorkflowPolicy(id,input);}
  dryRunWorkflow(id:string,context:Record<string,unknown>){return this.workflows.run({workflowId:id,sourceType:'manual_test',sourceId:crypto.randomUUID(),triggerEvent:'dry_run',idempotencyKey:`dry-run:${crypto.randomUUID()}`,context,dryRun:true});}
  retryWorkflowRun(id:string){return this.workflows.retryRun(id);}

  health(){return {...this.repository.health(),futureChannels:FUTURE_CHANNELS.map((channel)=>({channel,liveConnectivity:false,manualLogging:true}))};}
  runMaintenance(operation:'document_integrity'|'search_reindex'|'communication_relink'|'storage_report'){
    const run=this.repository.startMaintenance(operation);
    try{let result:unknown;if(operation==='document_integrity')result=this.documents.integrityReport();else if(operation==='search_reindex'){rebuildSearchIndex(getSqliteConnection());result={rebuiltAt:new Date().toISOString()};}else if(operation==='communication_relink'){const connection=getSqliteConnection();const updated=connection.prepare(`UPDATE communications SET status='matched',updated_at=? WHERE status='unmatched' AND organisation_id IS NOT NULL`).run(new Date().toISOString()).changes;result={updated};}else result=this.repository.health().documents;this.repository.finishMaintenance(run.id,'succeeded',result);return {id:run.id,operation,status:'succeeded',result};}catch(error){const message=error instanceof Error?error.message:String(error);this.repository.finishMaintenance(run.id,'failed',undefined,message);throw error;}
  }

  private validateRecipients(...groups:EmailAddress[][]){const addresses=groups.flat().map((item)=>item.address.trim().toLowerCase()).filter(Boolean);if(!addresses.length)throw new Error('At least one email recipient is required');for(const value of addresses)if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new Error(`Invalid email address: ${value}`);}
  private requireCalendar(id:string):any{const value=this.repository.getCalendar(id);if(!value||!value.enabled)throw new Error('Calendar is unavailable');return value;}
  private requireEvent(id:string):any{const value=this.repository.getCalendarEvent(id);if(!value)throw new Error('Calendar event not found');return value;}
  private config(account:{id:unknown;serverUrl:unknown;username:unknown;settings:Record<string,unknown>}):ConnectedAccountConfig{return {id:String(account.id),serverUrl:String(account.serverUrl),username:String(account.username),settings:account.settings};}
  private finishCalendarFailure(operationId:string,error:unknown){const message=error instanceof Error?error.message:String(error);this.repository.finishCalendarOperation(operationId,{status:message==='CALDAV_CONFLICT'?'conflict':'failed',error:message});}
}
