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
  getDraft(id:string){const value=this.repository.getDraft(id);if(!value)throw new Error('Draft not found');return value;}
  createDraft(input:DraftInput){this.validateRecipients(input.to,input.cc??[],input.bcc??[]);return this.repository.createDraft(input);}
  updateDraft(id:string,input:Partial<DraftInput>){if(input.to||input.cc||input.bcc)this.validateRecipients(input.to??[],input.cc??[],input.bcc??[]);return this.repository.updateDraft(id,input);}
  discardDraft(id:string){return this.repository.discardDraft(id);}

  createReplyDraft(messageId:string,mode:'reply'|'reply_all'|'forward'){
    const original=this.repository.getOriginalMessage(messageId);if(!original)throw new Error('Email message not found');
    const prefix=mode==='forward'?'Fwd:':'Re:';const subject=original.subject?.match(/^(re|fwd):/i)?original.subject:`${prefix} ${original.subject??''}`.trim();
    const to=mode==='forward'?[]:[original.from];
    const cc=mode==='reply_all'?[...original.recipients.to,...original.recipients.cc].filter((value)=>value.address.toLowerCase()!==original.accountUsername.toLowerCase()):[];
    const quoted=`\n\nOn the previous message, ${original.from.address} wrote:\n${String(original.bodyText??'').split('\n').map((line)=>`> ${line}`).join('\n')}`;
    return this.repository.createDraft({accountId:original.accountId,threadId:original.threadId,organisationId:original.organisationId,contactId:original.contactId,mode,inReplyToMessageId:messageId,to,cc,subject,bodyText:mode==='forward'?`\n\n---------- Forwarded message ----------\n${quoted}`:quoted});
  }

  async sendDraft(id:string,explicitConfirmation:boolean){
    if(explicitConfirmation!==true)throw new Error('Explicit send confirmation is required');
    const draft=this.getDraft(id);if(!['draft','failed'].includes(draft.status))throw new Error('Draft is not available to send');
    this.validateRecipients(draft.to,draft.cc,draft.bcc);
    if(!draft.subject.trim())throw new Error('Email subject is required');
    if(!draft.bodyText.trim()&&!draft.bodyHtml?.trim())throw new Error('Email body is required');
    const account=this.repository.getAccount(draft.accountId);if(!account||!account.enabled)throw new Error('Email account is unavailable');
    const secret=this.vault.read(String(account.credentialKey));
    const original=draft.inReplyToMessageId?this.repository.getOriginalMessage(draft.inReplyToMessageId):null;
    const fromAddress=String(account.settings.fromAddress??account.username);
    const fromName=String(account.settings.fromName??'');
    const messageId=`${crypto.randomUUID()}@whitelabelcrm.local`;
    const attachments=draft.documents.map((document)=>{const content=this.documents.content(document.documentId);return {filename:content.filename,mimeType:content.mimeType,content:content.content};});
    const attempt=this.repository.startSendAttempt(id,draft.accountId);this.repository.markDraftSending(id);
    try{
      const result=await this.sender.send(this.config(account),secret,{messageId,from:{address:fromAddress,name:fromName||undefined},to:draft.to,cc:draft.cc,bcc:draft.bcc,subject:draft.subject,bodyText:draft.bodyText,bodyHtml:draft.bodyHtml,inReplyTo:original?.rfcMessageId??null,references:original?.rfcMessageId?[original.rfcMessageId]:[],attachments});
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
  async cancelCalendarEvent(id:string){const current=this.requireEvent(id);const calendar=this.requireCalendar(current.calendarId);const event:CalendarWriteInput={...current,cancelled:true};const operation=this.repository.startCalendarOperation(current.calendarId,'cancel',id,current.etag,event);try{const result=await this.calendarWriter.cancel(this.config(calendar),this.vault.read(String(calendar.credentialKey)),String(calendar.providerCalendarKey),event);const stored=this.repository.updateLocalCalendarEvent(id,event,result.etag);this.repository.finishCalendarOperation(operation.id,{status:'succeeded',etag:result.etag,providerEventKey:result.providerEventKey});return stored;}catch(error){this.finishCalendarFailure(operation.id,error);throw error;}}
  completeMeeting(id:string,notes:string){const operationEvent=this.requireEvent(id);const operation=this.repository.startCalendarOperation(operationEvent.calendarId,'complete',id,operationEvent.etag,{notes});try{const result=this.repository.completeMeeting(id,notes);this.repository.finishCalendarOperation(operation.id,{status:'succeeded',etag:operationEvent.etag,providerEventKey:operationEvent.providerEventKey});this.triggers.trigger({triggerType:'meeting_completed',sourceType:'calendar_event',sourceId:id,eventId:`meeting-completed:${id}`,context:{organisationId:operationEvent.organisationId,contactId:operationEvent.contactId,engagementId:operationEvent.engagementId,title:operationEvent.title,scheduledAt:new Date().toISOString()}});return result;}catch(error){this.finishCalendarFailure(operation.id,error);throw error;}}

  listWorkflowTemplates(){return this.repository.listTemplates();}
  listWorkflows(includeArchived=false){return this.workflows.listDefinitions(includeArchived);}
  listWorkflowRuns(limit=100){return this.workflows.listRuns(limit);}
  createWorkflow(input:{name:string;description?:string|null;enabled?:boolean;triggerType:string;conditions?:unknown;actions:WorkflowAction[];policy?:{maxRunsPerHour:number;timeoutMs:number;maxDepth:number;dryRun:boolean}}){const workflow=this.workflows.createDefinition(input);if(input.policy)this.repository.setWorkflowPolicy(String(workflow.id),input.policy);return this.workflows.getDefinition(String(workflow.id));}
  createWorkflowFromTemplate(key:string,name?:string){const template=this.repository.getTemplate(key);if(!template)throw new Error('Workflow template not found');return this.workflows.createDefinition({name:name?.trim()||template.name,description:template.description,enabled:false,triggerType:template.triggerType,conditions:template.conditions,actions:template.actions as WorkflowAction[]});}
  updateWorkflow(id:string,input:{name?:string;description?:string|null;triggerType?:string;conditions?:unknown;actions?:WorkflowAction[]}){return this.workflows.updateDefinition(id,input);}
  setWorkflowEnabled(id:string,enabled:boolean){return this.workflows.setEnabled(id,enabled);}
  archiveWorkflow(id:string){return this.workflows.archiveDefinition(id);}
  duplicateWorkflow(id:string,name:string){const newId=this.repository.duplicateWorkflow(id,name);this.repository.setWorkflowPolicy(newId,this.repository.getWorkflowPolicy(id));return this.workflows.getDefinition(newId);}
  setWorkflowPolicy(id:string,input:{maxRunsPerHour:number;timeoutMs:number;maxDepth:number;dryRun:boolean}){this.workflows.getDefinition(id)||(()=>{throw new Error('Workflow not found');})();return this.repository.setWorkflowPolicy(id,input);}
  dryRunWorkflow(id:string,context:Record<string,unknown>){return this.workflows.run({workflowId:id,sourceType:'manual_test',sourceId:crypto.randomUUID(),triggerEvent:'dry_run',idempotencyKey:`dry-run:${crypto.randomUUID()}`,context,dryRun:true});}
  retryWorkflowRun(id:string){return this.workflows.retryRun(id);}

  health(){return {...this.repository.health(),futureChannels:FUTURE_CHANNELS.map((channel)=>({channel,liveConnectivity:false,manualLogging:true}))};}
  runMaintenance(operation:'document_integrity'|'search_reindex'|'communication_relink'|'storage_report'){
    const run=this.repository.startMaintenance(operation);
    try{let result:unknown;if(operation==='document_integrity')result=this.documents.integrityReport();else if(operation==='search_reindex'){rebuildSearchIndex(getSqliteConnection());result={rebuiltAt:new Date().toISOString()};}else if(operation==='communication_relink'){const connection=getSqliteConnection();const updated=connection.prepare(`UPDATE communications SET status='matched',updated_at=? WHERE status='unmatched' AND organisation_id IS NOT NULL`).run(new Date().toISOString()).changes;result={updated};}else result=this.repository.health().documents;this.repository.finishMaintenance(run.id,'succeeded',result);return {id:run.id,operation,status:'succeeded',result};}catch(error){const message=error instanceof Error?error.message:String(error);this.repository.finishMaintenance(run.id,'failed',undefined,message);throw error;}
  }

  private validateRecipients(...groups:EmailAddress[][]){const addresses=groups.flat().map((item)=>item.address.trim().toLowerCase()).filter(Boolean);if(!addresses.length)throw new Error('At least one email recipient is required');for(const value of addresses)if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new Error(`Invalid email address: ${value}`);}
  private requireCalendar(id:string){const value=this.repository.getCalendar(id);if(!value||!value.enabled)throw new Error('Calendar is unavailable');return value;}
  private requireEvent(id:string){const value=this.repository.getCalendarEvent(id);if(!value)throw new Error('Calendar event not found');return value;}
  private config(account:{id:unknown;serverUrl:unknown;username:unknown;settings:Record<string,unknown>}):ConnectedAccountConfig{return {id:String(account.id),serverUrl:String(account.serverUrl),username:String(account.username),settings:account.settings};}
  private finishCalendarFailure(operationId:string,error:unknown){const message=error instanceof Error?error.message:String(error);this.repository.finishCalendarOperation(operationId,{status:message==='CALDAV_CONFLICT'?'conflict':'failed',error:message});}
}
