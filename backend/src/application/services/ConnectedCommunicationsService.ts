import crypto from 'node:crypto';
import { ConnectedCommunicationsRepository,type AccountCreateInput } from '../../infrastructure/database/ConnectedCommunicationsRepository';
import { CredentialVault } from '../../infrastructure/security/CredentialVault';
import { ImapSyncAdapter } from '../../infrastructure/integrations/ImapSyncAdapter';
import { CalDavSyncAdapter } from '../../infrastructure/integrations/CalDavSyncAdapter';
import { parseEmailSyncCursor,serializeEmailSyncCursor } from '../../infrastructure/integrations/ConnectedAdapters';
import type { CalendarSyncAdapter,ConnectedAccountConfig,EmailSyncAdapter,RemoteCalendarEvent,RemoteEmailMessage } from '../../infrastructure/integrations/ConnectedAdapters';
import { DocumentService } from './DocumentService';
import { CrmMatcher } from './CrmMatcher';
import { WorkflowTriggerService } from './WorkflowTriggerService';
import { getSqliteConnection } from '../../infrastructure/database/connection';

export class ConnectedCommunicationsService {
  constructor(
    private readonly repository=new ConnectedCommunicationsRepository(),
    private readonly vault=new CredentialVault(),
    private readonly emailAdapter:EmailSyncAdapter=new ImapSyncAdapter(),
    private readonly calendarAdapter:CalendarSyncAdapter=new CalDavSyncAdapter(),
    private readonly documents=new DocumentService(),
    private readonly matcher=new CrmMatcher(repository),
    private readonly triggers=new WorkflowTriggerService(),
  ){}

  createAccount(input:Omit<AccountCreateInput,'credentialKey'> & {password:string}){const credentialKey=crypto.randomUUID().replace(/-/g,'');this.vault.store(credentialKey,{password:input.password});try{return this.repository.createAccount({...input,credentialKey});}catch(error){this.vault.remove(credentialKey);throw error;}}
  listAccounts(includeArchived=false){return this.repository.listAccounts(includeArchived);}
  listSyncRuns(limit=100){return this.repository.listSyncRuns(limit);}
  listEmailThreads(input:{status?:string;organisationId?:string;limit?:number}={}){return this.repository.listEmailThreads(input);}
  getEmailThread(id:string){const value=this.repository.getEmailThread(id);if(!value)throw new Error('Email thread not found');return value;}
  listCalendars(accountId?:string){return this.repository.listCalendars(accountId);}
  listCalendarEvents(input:{from?:string;to?:string;status?:string;organisationId?:string;limit?:number}={}){return this.repository.listCalendarEvents(input);}
  listSuggestions(status='pending'){return this.repository.listSuggestions(status);}
  rejectSuggestion(id:string){this.repository.rejectSuggestion(id);return {id,status:'rejected'};}
  matchEmailThread(id:string,organisationId:string,contactId:string|null){return this.repository.matchEmailThread(id,organisationId,contactId);}
  matchCalendarEvent(id:string,organisationId:string,contactId:string|null,engagementId:string|null){return this.repository.matchCalendarEvent(id,organisationId,contactId,engagementId);}

  async testAccount(id:string){const account=this.requireAccount(id);const started=this.repository.startSync(id,'account_test',account.syncCursor as string|null);const config=this.config(account);const secret=this.vault.read(String(account.credentialKey));try{if(account.kind==='email')await this.emailAdapter.test(config,secret);else await this.calendarAdapter.test(config,secret);this.repository.updateAccountHealth(id,'healthy',null);return this.repository.finishSync(started.id,{status:'succeeded'});}catch(error){const message=error instanceof Error?error.message:String(error);this.repository.updateAccountHealth(id,'failed',message);this.repository.finishSync(started.id,{status:'failed',failureCount:1,errorSummary:message});throw error;}}
  async syncAccount(id:string){const account=this.requireAccount(id);if(!account.enabled||account.archivedAt)throw new Error('Account is paused or archived');return account.kind==='email'?this.syncEmail(account):this.syncCalendar(account);}
  archiveAccount(id:string){const account=this.requireAccount(id);const archived=this.repository.archiveAccount(id);this.vault.remove(String(account.credentialKey));return archived;}

  private async syncEmail(account:any){
    const started=this.repository.startSync(String(account.id),'email',account.syncCursor as string|null);let fetched=0,created=0,updated=0,matched=0,failures=0;const errors:string[]=[];const failedUids:number[]=[];
    try{
      const batch=await this.emailAdapter.fetchSince(this.config(account),this.vault.read(String(account.credentialKey)),account.syncCursor as string|null);fetched=batch.messages.length;
      for(const message of batch.messages){try{const result=this.ingestEmail(String(account.id),message);if(result.created)created+=1;else updated+=1;if(result.matchStatus==='matched')matched+=1;}catch(error){failures+=1;failedUids.push(message.uid);errors.push(`UID ${message.uid}: ${error instanceof Error?error.message:String(error)}`);}}
      const mailbox=String(account.settings.mailbox??'INBOX');const state=parseEmailSyncCursor(batch.nextCursor,mailbox);state.failedUids=[...new Set([...state.failedUids,...failedUids])];const finalCursor=serializeEmailSyncCursor(state);
      const status=failures===0?'succeeded':failures<fetched?'partially_failed':'failed';const completedAt=new Date().toISOString();
      this.repository.updateAccountCursor(String(account.id),finalCursor,completedAt,status==='failed'?'failed':failures?'degraded':'healthy',errors.join('; ')||null);
      return this.repository.finishSync(started.id,{status,cursorAfter:finalCursor,fetchedCount:fetched,createdCount:created,updatedCount:updated,matchedCount:matched,failureCount:failures,errorSummary:errors.join('; ')||null});
    }catch(error){const message=error instanceof Error?error.message:String(error);this.repository.updateAccountCursor(String(account.id),account.syncCursor as string|null,new Date().toISOString(),'failed',message);this.repository.finishSync(started.id,{status:'failed',fetchedCount:fetched,createdCount:created,updatedCount:updated,matchedCount:matched,failureCount:failures+1,errorSummary:message});throw error;}
  }

  private ingestEmail(accountId:string,message:RemoteEmailMessage){
    const connection=getSqliteConnection();
    const existingByRfc=message.rfcMessageId?connection.prepare('SELECT id,thread_id,communication_id FROM email_messages WHERE account_id=? AND rfc_message_id=?').get(accountId,message.rfcMessageId) as {id:string;thread_id:string;communication_id:string}|undefined:undefined;
    const addresses=message.direction==='inbound'?[message.from,...message.to,...(message.cc??[])]:[...message.to,...(message.cc??[]),...(message.bcc??[])];
    const match=this.matcher.matchAddresses(addresses);
    const stored=existingByRfc?{messageId:existingByRfc.id,threadId:existingByRfc.thread_id,communicationId:existingByRfc.communication_id,created:false}:this.repository.upsertEmailMessage(accountId,message,match);
    const timestamp=new Date().toISOString();
    connection.prepare(`INSERT INTO email_ingestion_state(email_message_id,status,updated_at) VALUES(?,'pending',?) ON CONFLICT(email_message_id) DO NOTHING`).run(stored.messageId,timestamp);
    const locallySent=Boolean(connection.prepare('SELECT 1 AS present FROM email_drafts WHERE sent_message_id=?').get(stored.messageId));
    if(locallySent){connection.prepare(`UPDATE email_ingestion_state SET status='complete',error_summary=NULL,completed_at=coalesce(completed_at,?),updated_at=? WHERE email_message_id=?`).run(timestamp,timestamp,stored.messageId);return {...stored,matchStatus:match.status};}
    const state=connection.prepare('SELECT status FROM email_ingestion_state WHERE email_message_id=?').get(stored.messageId) as {status:string};
    if(state.status==='complete')return {...stored,matchStatus:match.status};
    try{
      if(match.status==='suggested'&&match.organisationId)this.repository.createSuggestion({sourceType:'email_thread',sourceId:stored.threadId,organisationId:match.organisationId,contactId:match.contactId,reason:match.reason,confidence:match.confidence});
      for(const attachment of message.attachments??[]){
        const fingerprint=crypto.createHash('sha256').update(attachment.filename).update('\0').update(attachment.mimeType).update('\0').update(attachment.contentBase64).digest('hex');
        const imported=connection.prepare('SELECT document_id FROM email_attachment_imports WHERE email_message_id=? AND source_fingerprint=?').get(stored.messageId,fingerprint);
        if(imported)continue;
        const links:Array<{entityType:'communication'|'organisation';entityId:string}>=[{entityType:'communication',entityId:stored.communicationId}];if(match.organisationId)links.push({entityType:'organisation',entityId:match.organisationId});
        const document=this.documents.upload({title:attachment.filename,filename:attachment.filename,mimeType:attachment.mimeType,contentBase64:attachment.contentBase64,description:`Attachment from ${message.subject??'email'}`,category:'email_attachment',links});
        try{connection.transaction(()=>{this.repository.linkEmailAttachment(stored.messageId,String(document.id),attachment.contentId??null,Boolean(attachment.inline));connection.prepare('INSERT INTO email_attachment_imports(email_message_id,source_fingerprint,document_id,created_at) VALUES(?,?,?,?)').run(stored.messageId,fingerprint,String(document.id),new Date().toISOString());})();}catch(error){this.documents.archive(String(document.id));throw error;}
      }
      if(message.direction==='inbound')this.triggers.trigger({triggerType:'email_received',sourceType:'email_message',sourceId:stored.messageId,eventId:stored.messageId,context:{organisationId:match.organisationId,contactId:match.contactId,sender:message.from.address,subject:message.subject??'',direction:message.direction}});
      const completedAt=new Date().toISOString();connection.prepare(`UPDATE email_ingestion_state SET status='complete',error_summary=NULL,completed_at=?,updated_at=? WHERE email_message_id=?`).run(completedAt,completedAt,stored.messageId);
      return {...stored,matchStatus:match.status};
    }catch(error){const failure=error instanceof Error?error.message:String(error);connection.prepare(`UPDATE email_ingestion_state SET status='failed',error_summary=?,updated_at=? WHERE email_message_id=?`).run(failure,new Date().toISOString(),stored.messageId);throw error;}
  }

  private async syncCalendar(account:any){
    const accountId=String(account.id);const previousCalendars=new Map(this.repository.listCalendars(accountId).map((calendar)=>[String(calendar.providerCalendarKey),calendar]));
    const started=this.repository.startSync(accountId,'calendar',null);let fetched=0,created=0,updated=0,matched=0,failures=0;const errors:string[]=[];
    try{
      const config=this.config(account);const secret=this.vault.read(String(account.credentialKey));const remoteCalendars=await this.calendarAdapter.discover(config,secret);
      for(const remoteCalendar of remoteCalendars){const previous=previousCalendars.get(remoteCalendar.providerCalendarKey);const localCalendar=this.repository.upsertCalendar(accountId,remoteCalendar);if(!localCalendar.selected)continue;try{const cursor=previous?.lastSyncAt?previous.syncCursor as string|null:null;const batch=await this.calendarAdapter.fetchSince(config,secret,remoteCalendar,cursor);fetched+=batch.events.length;for(const event of batch.events){const result=this.ingestCalendarEvent(String(localCalendar.id),event);if(result.created)created+=1;else updated+=1;if(result.matchStatus==='matched')matched+=1;}for(const href of batch.deletedResourceHrefs)this.repository.markDeletedCalendarResource(String(localCalendar.id),href);this.repository.updateCalendarSyncState(String(localCalendar.id),batch.nextCursor,new Date().toISOString());}catch(error){failures+=1;errors.push(`${remoteCalendar.displayName}: ${error instanceof Error?error.message:String(error)}`);}}
      const status=failures===0?'succeeded':failures<Math.max(1,remoteCalendars.length)?'partially_failed':'failed';const completedAt=new Date().toISOString();this.repository.updateAccountCursor(accountId,null,completedAt,status==='failed'?'failed':failures?'degraded':'healthy',errors.join('; ')||null);return this.repository.finishSync(started.id,{status,cursorAfter:null,fetchedCount:fetched,createdCount:created,updatedCount:updated,matchedCount:matched,failureCount:failures,errorSummary:errors.join('; ')||null});
    }catch(error){const message=error instanceof Error?error.message:String(error);this.repository.updateAccountCursor(accountId,null,new Date().toISOString(),'failed',message);this.repository.finishSync(started.id,{status:'failed',fetchedCount:fetched,createdCount:created,updatedCount:updated,matchedCount:matched,failureCount:failures+1,errorSummary:message});throw error;}
  }

  private ingestCalendarEvent(calendarId:string,event:RemoteCalendarEvent){const match=this.matcher.matchAddresses(event.attendees);const stored=this.repository.upsertCalendarEvent(calendarId,event,match);if(match.status==='suggested'&&match.organisationId)this.repository.createSuggestion({sourceType:'calendar_event',sourceId:stored.id,organisationId:match.organisationId,contactId:match.contactId,reason:match.reason,confidence:match.confidence});if(stored.created)this.triggers.trigger({triggerType:'calendar_event_created',sourceType:'calendar_event',sourceId:stored.id,eventId:stored.id,context:{organisationId:match.organisationId,contactId:match.contactId,title:event.title,startsAt:event.startsAt,endsAt:event.endsAt}});return {...stored,matchStatus:match.status};}
  private requireAccount(id:string):any{const value=this.repository.getAccount(id);if(!value||value.archivedAt)throw new Error('Communication account not found');if(!this.vault.exists(String(value.credentialKey)))throw new Error('Communication account credentials are unavailable');return value;}
  private config(account:any):ConnectedAccountConfig{return {id:String(account.id),serverUrl:String(account.serverUrl),username:String(account.username),settings:account.settings as Record<string,unknown>};}
}
