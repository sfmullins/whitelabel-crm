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
function uniqueAddresses(values:EmailAddress[]):EmailAddress[]{const seen=new Set<string>();return values.filter((value)=>{const key=value.address.toLowerCase();if(!key||seen.has(key))return false;seen.add(key);return true;});}

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
    const from=parseJson<EmailAddress>(row.sender_json,{address:''});const recipients=parseJson<{to:EmailAddress[];cc:EmailAddress[];bcc:EmailAddress[]}>(row.recipients_json,{to:[],cc:[],bcc:[]});const direction=String(row.direction);
    const originalSubject=String(row.subject??'');const prefix=mode==='forward'?'Fwd:':'Re:';const subject=/^(re|fwd):/i.test(originalSubject)?originalSubject:`${prefix} ${originalSubject}`.trim();const accountUsername=String(row.account_username??'').toLowerCase();
    let to:EmailAddress[]=[];let cc:EmailAddress[]=[];
    if(mode!=='forward'){
      if(direction==='outbound'){to=uniqueAddresses(recipients.to.filter((value)=>value.address.toLowerCase()!==accountUsername));if(mode==='reply_all')cc=uniqueAddresses(recipients.cc.filter((value)=>value.address.toLowerCase()!==accountUsername&&!to.some((target)=>target.address.toLowerCase()===value.address.toLowerCase())));}
      else{to=[from];if(mode==='reply_all')cc=uniqueAddresses([...recipients.to,...recipients.cc].filter((value)=>value.address.toLowerCase()!==accountUsername&&value.address.toLowerCase()!==from.address.toLowerCase()));}
    }
    const quoted=`\n\nOn the previous message, ${from.address} wrote:\n${String(row.body_text??'').split('\n').map((line)=>`> ${line}`).join('\n')}`;
    return this.repository.createDraft({accountId:String(row.account_id),threadId:String(row.thread_id),organisationId:row.organisation_id?String(row.organisation_id):null,contactId:row.contact_id?String(row.contact_id):null,mode,inReplyToMessageId:messageId,to,cc,subject,bodyText:mode==='forward'?`\n\n---------- Forwarded message ----------${quoted}`:quoted});
  }

  async sendDraft(id:string,explicitConfirmation:boolean){
    if(explicitConfirmation!==true)throw new Error('Explicit send confirmation is required');const draft=this.getDraft(id);if(!['draft','failed'].includes(draft.status))throw new Error('Draft is not available to send');
    this.validateRecipients(draft.to,draft.cc,draft.bcc);if(!draft.subject.trim())throw new Error('Email subject is required');if(!draft.bodyText.trim()&&!draft.bodyHtml?.trim())throw new Error('Email body is required');
    const account=this.repository.getAccount(draft.accountId) as any;if(!account||!account.enabled)throw new Error('Email account is unavailable');const secret=this.vault.read(String(account.credentialKey));const original=draft.inReplyToMessageId?this.repository.getOriginalMessage(draft.inReplyToMessageId):null;
    const fromAddress=String(account.settings.fromAddress??account.username);const fromName=String(account.settings.fromName??'');const messageId=`${crypto.randomUUID()}@whitelabelcrm.local`;const attachments=draft.documents.map((document:{documentId:string})=>{const content=this.documents.content(document.documentId);return {filename:content.filename,mimeType:content.mimeType,content:content.content};});
    const attempt=this.repository.startSendAttempt(id,draft.accountId);this.repository.markDraftSending(id);let transmitted=false;
    try{
      const result=await this.sender.send(this.config(account),secret,{messageId,from:{address:fromAddress,name:fromName||undefined},to:draft.to,cc:draft.cc,bcc:draft.bcc,subject:draft.subject,bodyText:draft.bodyText,bodyHtml:draft.bodyHtml,inReplyTo:original?.rfcMessageId?String(original.rfcMessageId):null,references:original?.rfcMessageId?[String(original.rfcMessageId)]:[],attachments});
      transmitted=true;const sentAt=new Date().toISOString();const reconciliationId=this.createReconciliation('email',id,'send',{draftId:id,providerMessageKey:result.providerMessageKey,rfcMessageId:messageId,from:{address:fromAddress,name:fromName||undefined},sentAt});
      this.applyReconciliation(reconciliationId);this.repository.finishSendAttempt(attempt.id,{status:'succeeded',providerMessageKey:result.providerMessageKey,rfcMessageId:messageId});return {...this.getDraft(id),accepted:result.accepted,rejected:result.rejected};
    }catch(error){const message=error instanceof Error?error.message:String(error);this.repository.finishSendAttempt(attempt.id,{status:'failed',rfcMessageId:messageId,errorSummary:transmitted?`Remote transmission succeeded; local reconciliation required: ${message}`:message});if(!transmitted)this.repository.markDraftFailed(id,message);throw new Error(transmitted?'Email was transmitted but local reconciliation is required. Do not resend.':message);}
  }

  async createCalendarEvent(input:{calendarId:string;event:CalendarWriteInput;organisationId?:string|null;contactId?:string|null;engagementId?:string|null}){
    const calendar=this.requireCalendar(input.calendarId);const operation=this.repository.startCalendarOperation(input.calendarId,'create',null,null,input.event);let transmitted=false;
    try{const result=await this.calendarWriter.create(this.config(calendar),this.vault.read(String(calendar.credentialKey)),String(calendar.providerCalendarKey),input.event);transmitted=true;const reconciliationId=this.createReconciliation('calendar',operation.id,'create',{calendarId:input.calendarId,event:input.event,context:{organisationId:input.organisationId,contactId:input.contactId,engagementId:input.engagementId},result});const stored=this.applyReconciliation(reconciliationId) as any;this.repository.finishCalendarOperation(operation.id,{status:'succeeded',etag:result.etag,providerEventKey:result.providerEventKey});return stored;}catch(error){this.finishCalendarFailure(operation.id,error,transmitted);throw new Error(transmitted?'Calendar event changed remotely but local reconciliation is required. Do not repeat the operation.':error instanceof Error?error.message:String(error));}
  }
  async updateCalendarEvent(id:string,event:CalendarWriteInput){const current=this.requireEvent(id);const resourceHref=this.resourceHrefForEvent(id);const calendar=this.requireCalendar(current.calendarId);const operation=this.repository.startCalendarOperation(current.calendarId,'update',id,current.etag,event);let transmitted=false;try{const request={...event,providerEventKey:current.providerEventKey,resourceHref,etag:current.etag};const result=await this.calendarWriter.update(this.config(calendar),this.vault.read(String(calendar.credentialKey)),String(calendar.providerCalendarKey),request);transmitted=true;const reconciliationId=this.createReconciliation('calendar',operation.id,'update',{eventId:id,event:request,result});const stored=this.applyReconciliation(reconciliationId);this.repository.finishCalendarOperation(operation.id,{status:'succeeded',etag:result.etag,providerEventKey:result.providerEventKey});return stored;}catch(error){this.finishCalendarFailure(operation.id,error,transmitted);throw new Error(transmitted?'Calendar event changed remotely but local reconciliation is required. Do not repeat the operation.':error instanceof Error?error.message:String(error));}}
  async cancelCalendarEvent(id:string){const current=this.requireEvent(id);const resourceHref=this.resourceHrefForEvent(id);const calendar=this.requireCalendar(current.calendarId);const event:CalendarWriteInput={providerEventKey:current.providerEventKey,resourceHref,etag:current.etag,title:current.title,description:current.description,location:current.location,startsAt:current.startsAt,endsAt:current.endsAt,timezone:current.timezone,recurrence:current.recurrence,attendees:current.attendees,cancelled:true};const operation=this.repository.startCalendarOperation(current.calendarId,'cancel',id,current.etag,event);let transmitted=false;try{const result=await this.calendarWriter.cancel(this.config(calendar),this.vault.read(String(calendar.credentialKey)),String(calendar.providerCalendarKey),event);transmitted=true;const reconciliationId=this.createReconciliation('calendar',operation.id,'cancel',{eventId:id,event,result});const stored=this.applyReconciliation(reconciliationId);this.repository.finishCalendarOperation(operation.id,{status:'succeeded',etag:result.etag,providerEventKey:result.providerEventKey});return stored;}catch(error){this.finishCalendarFailure(operation.id,error,transmitted);throw new Error(transmitted?'Calendar event changed remotely but local reconciliation is required. Do not repeat the operation.':error instanceof Error?error.message:String(error));}}
  completeMeeting(id:string,notes:string){const event=this.requireEvent(id);const operation=this.repository.startCalendarOperation(event.calendarId,'complete',id,event.etag,{notes});try{const result=this.repository.completeMeeting(id,notes);this.repository.finishCalendarOperation(operation.id,{status:'succeeded',etag:event.etag,providerEventKey:event.providerEventKey});this.triggers.trigger({triggerType:'meeting_completed',sourceType:'calendar_event',sourceId:id,eventId:`meeting-completed:${id}`,context:{organisationId:event.organisationId,contactId:event.contactId,engagementId:event.engagementId,title:event.title,scheduledAt:new Date().toISOString()}});return result;}catch(error){this.finishCalendarFailure(operation.id,error,false);throw error;}}

  reconcilePendingOutbound(){const rows=getSqliteConnection().prepare("SELECT id FROM outbound_reconciliation_records WHERE status IN ('pending','failed') ORDER BY created_at").all() as Array<{id:string}>;let reconciled=0,failed=0;for(const row of rows){try{this.applyReconciliation(row.id);reconciled+=1;}catch{failed+=1;}}return {reconciled,failed};}

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

  health(){const base=this.repository.health();const pending=Number((getSqliteConnection().prepare("SELECT count(*) AS count FROM outbound_reconciliation_records WHERE status IN ('pending','failed')").get() as {count:number}).count);return {...base,outboundReconciliation:{pending},futureChannels:FUTURE_CHANNELS.map((channel)=>({channel,liveConnectivity:false,manualLogging:true}))};}
  runMaintenance(operation:'document_integrity'|'search_reindex'|'communication_relink'|'storage_report'){const run=this.repository.startMaintenance(operation);try{let result:unknown;if(operation==='document_integrity')result=this.documents.integrityReport();else if(operation==='search_reindex'){rebuildSearchIndex(getSqliteConnection());result={rebuiltAt:new Date().toISOString()};}else if(operation==='communication_relink'){const connection=getSqliteConnection();const updated=connection.prepare(`UPDATE communications SET status='matched',updated_at=? WHERE status='unmatched' AND organisation_id IS NOT NULL`).run(new Date().toISOString()).changes;result={updated};}else result=this.repository.health().documents;this.repository.finishMaintenance(run.id,'succeeded',result);return {id:run.id,operation,status:'succeeded',result};}catch(error){const message=error instanceof Error?error.message:String(error);this.repository.finishMaintenance(run.id,'failed',undefined,message);throw error;}}

  private createReconciliation(kind:'email'|'calendar',sourceId:string,operation:string,payload:unknown){const id=crypto.randomUUID();const timestamp=new Date().toISOString();getSqliteConnection().prepare(`INSERT INTO outbound_reconciliation_records(id,kind,source_id,operation,payload_json,status,created_at,updated_at) VALUES(?,?,?,?,?,'pending',?,?)`).run(id,kind,sourceId,operation,JSON.stringify(payload),timestamp,timestamp);return id;}
  private applyReconciliation(id:string):unknown{
    const connection=getSqliteConnection();const row=connection.prepare('SELECT * FROM outbound_reconciliation_records WHERE id=?').get(id) as Record<string,unknown>|undefined;if(!row)throw new Error('Outbound reconciliation record not found');if(row.status==='reconciled')return null;const payload=parseJson<Record<string,any>>(row.payload_json,{});
    try{
      let result:unknown;const completedAt=new Date().toISOString();
      if(row.kind==='email'){
        const before=this.getDraft(String(payload.draftId));if(before.status!=='sent')this.repository.recordSentMessage(String(payload.draftId),{providerMessageKey:String(payload.providerMessageKey),rfcMessageId:String(payload.rfcMessageId),from:payload.from,sentAt:String(payload.sentAt)});
        const draft=this.getDraft(String(payload.draftId));result=draft;
        connection.prepare(`UPDATE outbound_email_attempts SET status='succeeded',provider_message_key=?,rfc_message_id=?,error_summary=NULL,completed_at=? WHERE id=(SELECT id FROM outbound_email_attempts WHERE draft_id=? ORDER BY started_at DESC LIMIT 1)`).run(payload.providerMessageKey,payload.rfcMessageId,completedAt,payload.draftId);
        if(draft.sentMessageId)this.triggers.trigger({triggerType:'email_sent',sourceType:'email_message',sourceId:String(draft.sentMessageId),eventId:String(draft.sentMessageId),context:{accountId:draft.accountId,organisationId:draft.organisationId,contactId:draft.contactId,engagementId:draft.engagementId,threadId:draft.threadId,subject:draft.subject}});
      }else if(row.operation==='create'){
        const existing=connection.prepare('SELECT id FROM calendar_events WHERE calendar_id=? AND provider_event_key=?').get(payload.calendarId,payload.result.providerEventKey) as {id:string}|undefined;result=existing?this.requireEvent(existing.id):this.repository.createLocalCalendarEvent(payload.calendarId,payload.event,{...payload.context,etag:payload.result.etag});const event=result as any;this.upsertCalendarResource(String(event.id),payload.calendarId,payload.result.resourceHref);
        connection.prepare(`UPDATE calendar_write_operations SET status='succeeded',resulting_etag=?,provider_event_key=?,error_summary=NULL,completed_at=? WHERE id=?`).run(payload.result.etag,payload.result.providerEventKey,completedAt,row.source_id);
        this.triggers.trigger({triggerType:'calendar_event_created',sourceType:'calendar_event',sourceId:String(event.id),eventId:String(event.id),context:{organisationId:event.organisationId,contactId:event.contactId,engagementId:event.engagementId,title:event.title,startsAt:event.startsAt,endsAt:event.endsAt}});
      }else{
        result=this.repository.updateLocalCalendarEvent(String(payload.eventId),payload.event,payload.result.etag);const current=this.requireEvent(String(payload.eventId));this.upsertCalendarResource(String(payload.eventId),String(current.calendarId),payload.result.resourceHref);connection.prepare(`UPDATE calendar_write_operations SET status='succeeded',resulting_etag=?,provider_event_key=?,error_summary=NULL,completed_at=? WHERE id=?`).run(payload.result.etag,payload.result.providerEventKey,completedAt,row.source_id);
      }
      connection.prepare("UPDATE outbound_reconciliation_records SET status='reconciled',error_summary=NULL,reconciled_at=?,updated_at=? WHERE id=?").run(completedAt,completedAt,id);return result;
    }catch(error){const message=error instanceof Error?error.message:String(error);connection.prepare("UPDATE outbound_reconciliation_records SET status='failed',error_summary=?,updated_at=? WHERE id=?").run(message,new Date().toISOString(),id);throw error;}
  }
  private upsertCalendarResource(eventId:string,calendarId:string,resourceHref:string){const timestamp=new Date().toISOString();getSqliteConnection().prepare(`INSERT INTO calendar_event_resources(calendar_event_id,calendar_id,resource_href,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(calendar_event_id) DO UPDATE SET resource_href=excluded.resource_href,updated_at=excluded.updated_at`).run(eventId,calendarId,resourceHref,timestamp,timestamp);}
  private resourceHrefForEvent(id:string):string|null{return (getSqliteConnection().prepare('SELECT resource_href FROM calendar_event_resources WHERE calendar_event_id=?').get(id) as {resource_href:string}|undefined)?.resource_href??null;}
  private validateRecipients(...groups:EmailAddress[][]){const addresses=groups.flat().map((item)=>item.address.trim().toLowerCase()).filter(Boolean);if(!addresses.length)throw new Error('At least one email recipient is required');for(const value of addresses)if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new Error(`Invalid email address: ${value}`);}
  private requireCalendar(id:string):any{const value=this.repository.getCalendar(id);if(!value||!value.enabled)throw new Error('Calendar is unavailable');return value;}
  private requireEvent(id:string):any{const value=this.repository.getCalendarEvent(id);if(!value)throw new Error('Calendar event not found');return value;}
  private config(account:{id:unknown;serverUrl:unknown;username:unknown;settings:Record<string,unknown>}):ConnectedAccountConfig{return {id:String(account.id),serverUrl:String(account.serverUrl),username:String(account.username),settings:account.settings};}
  private finishCalendarFailure(operationId:string,error:unknown,transmitted:boolean){const message=error instanceof Error?error.message:String(error);this.repository.finishCalendarOperation(operationId,{status:!transmitted&&message==='CALDAV_CONFLICT'?'conflict':'failed',error:transmitted?`Remote write succeeded; local reconciliation required: ${message}`:message});}
}
