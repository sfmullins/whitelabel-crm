import path from 'node:path';
import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { runSeed } from '../infrastructure/database/seed';
import { getRuntimePaths } from '../config/runtimePaths';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { CredentialVault } from '../infrastructure/security/CredentialVault';
import { CommunicationsHubRepository } from '../infrastructure/database/CommunicationsHubRepository';
import { CommunicationsHubService } from '../application/services/CommunicationsHubService';
import { DocumentService } from '../application/services/DocumentService';
import { WorkflowRepository } from '../infrastructure/database/WorkflowRepository';
import { WorkflowTriggerService } from '../application/services/WorkflowTriggerService';
import { buildMimeMessage } from '../infrastructure/integrations/SmtpSendAdapter';
import type { CalendarWriteAdapter,CalendarWriteInput,EmailSendAdapter,OutboundEmail } from '../infrastructure/integrations/OutboundAdapters';
import type { ConnectedAccountConfig } from '../infrastructure/integrations/ConnectedAdapters';
import { WorkRepository } from '../infrastructure/database/WorkRepository';

const ACME='20000000-0000-4000-8000-000000000001';
const AISLING='20000000-0000-4000-8000-000000000002';
const ENGAGEMENT='20000000-0000-4000-8000-000000000004';
const DOCUMENT='20000000-0000-4000-8000-000000000021';
const EMAIL_ACCOUNT='20000000-0000-4000-8000-000000000029';
const CALENDAR_ACCOUNT='20000000-0000-4000-8000-000000000030';
const CALENDAR='20000000-0000-4000-8000-000000000033';

class RecordingSender implements EmailSendAdapter {messages:OutboundEmail[]=[];async send(_config:ConnectedAccountConfig,_secret:Record<string,string>,message:OutboundEmail){this.messages.push(message);return {providerMessageKey:`sent:${message.messageId}`,accepted:message.to.map((item)=>item.address),rejected:[]};}}
class RecordingCalendarWriter implements CalendarWriteAdapter {
  created:CalendarWriteInput[]=[];updated:CalendarWriteInput[]=[];conflictOnUpdate=false;
  async create(_config:ConnectedAccountConfig,_secret:Record<string,string>,calendarUrl:string,event:CalendarWriteInput){this.created.push(event);return {providerEventKey:event.providerEventKey,resourceHref:`${calendarUrl.replace(/\/$/,'')}/remote-resource-44.ics`,etag:'"created-v1"'};}
  async update(_config:ConnectedAccountConfig,_secret:Record<string,string>,calendarUrl:string,event:CalendarWriteInput){this.updated.push(event);if(this.conflictOnUpdate)throw new Error('CALDAV_CONFLICT');return {providerEventKey:event.providerEventKey,resourceHref:event.resourceHref??`${calendarUrl.replace(/\/$/,'')}/fallback.ics`,etag:'"updated-v2"'};}
  async cancel(_config:ConnectedAccountConfig,_secret:Record<string,string>,calendarUrl:string,event:CalendarWriteInput){return {providerEventKey:event.providerEventKey,resourceHref:event.resourceHref??`${calendarUrl.replace(/\/$/,'')}/fallback.ics`,etag:'"cancelled-v3"'};}
}
class FlakyHubRepository extends CommunicationsHubRepository {failReconciliation=true;override recordSentMessage(draftId:string,input:{providerMessageKey:string;rfcMessageId:string;from:{name?:string;address:string};sentAt:string}){if(this.failReconciliation)throw new Error('simulated local commit failure');return super.recordSentMessage(draftId,input);}}

describe('WI7 communications hub',()=>{
  beforeEach(async()=>{setupTempDatabase();await runSeed();});
  afterEach(cleanupTempDatabase);

  function fixture(repository:CommunicationsHubRepository=new CommunicationsHubRepository()){
    const sqlite=getSqliteConnection();sqlite.prepare(`UPDATE communication_accounts SET enabled=1,settings_json=? WHERE id=?`).run(JSON.stringify({mailbox:'INBOX',smtpUrl:'smtps://mail.example',fromAddress:'consultant@goodorder.example',fromName:'Good Order'}),EMAIL_ACCOUNT);sqlite.prepare(`UPDATE communication_accounts SET enabled=1 WHERE id=?`).run(CALENDAR_ACCOUNT);
    const vault=new CredentialVault(path.join(getRuntimePaths().dataDirectory,'wi7-vault'));vault.store('fixture-email-key',{password:'email-secret'});vault.store('fixture-calendar-key',{password:'calendar-secret'});
    const sender=new RecordingSender();const calendar=new RecordingCalendarWriter();const workflows=new WorkflowRepository();const service=new CommunicationsHubService(repository,vault,sender,calendar,new DocumentService(),workflows,new WorkflowTriggerService());return {sqlite,vault,sender,calendar,repository,workflows,service};
  }

  it('requires explicit confirmation, reconciles sent email and replies to the external recipient',async()=>{
    const {sender,service,repository}=fixture();const draft=service.createDraft({accountId:EMAIL_ACCOUNT,organisationId:ACME,contactId:AISLING,engagementId:ENGAGEMENT,to:[{name:'Aisling Byrne',address:'aisling.byrne@acme.example'}],subject:'Acme readout',bodyText:'Please find the diagnostic readout attached.',documentIds:[DOCUMENT]});
    await expect(service.sendDraft(String(draft.id),false)).rejects.toThrow('Explicit send confirmation');expect(sender.messages).toHaveLength(0);
    const sent=await service.sendDraft(String(draft.id),true);expect(sent.status).toBe('sent');expect(sender.messages).toHaveLength(1);expect(sender.messages[0].attachments?.map((item)=>item.filename)).toContain('acme-diagnostic-proposal.txt');expect(repository.getDraft(String(draft.id))?.sentMessageId).toBeTruthy();
    const reply=service.createReplyDraft(String(sent.sentMessageId),'reply');expect(reply.to.map((item:{address:string})=>item.address)).toEqual(['aisling.byrne@acme.example']);expect(reply.to.some((item:{address:string})=>item.address==='consultant@goodorder.example')).toBe(false);
    const communication=getSqliteConnection().prepare(`SELECT direction,status FROM communications WHERE external_id LIKE 'sent:%'`).get() as {direction:string;status:string};expect(communication).toEqual({direction:'outbound',status:'sent'});
  });

  it('keeps transmitted email non-retryable until reconciliation succeeds',async()=>{
    const repository=new FlakyHubRepository();const {sender,service}=fixture(repository);const draft=service.createDraft({accountId:EMAIL_ACCOUNT,organisationId:ACME,to:[{address:'aisling.byrne@acme.example'}],subject:'Reconciliation test',bodyText:'One transmission only.'});
    await expect(service.sendDraft(String(draft.id),true)).rejects.toThrow('Do not resend');expect(sender.messages).toHaveLength(1);expect(repository.getDraft(String(draft.id))?.status).toBe('sending');
    repository.failReconciliation=false;expect(service.reconcilePendingOutbound()).toEqual({reconciled:1,failed:0});expect(repository.getDraft(String(draft.id))?.status).toBe('sent');expect(sender.messages).toHaveLength(1);
  });

  it('builds standards-compliant multipart MIME with reply headers',()=>{const mime=buildMimeMessage({messageId:'wi7@example.test',from:{name:'Good Order',address:'consultant@goodorder.example'},to:[{address:'aisling.byrne@acme.example'}],subject:'Re: Evidence',bodyText:'Reviewed.',bodyHtml:'<p>Reviewed.</p>',inReplyTo:'original@example.test',references:['original@example.test'],attachments:[{filename:'evidence.txt',mimeType:'text/plain',content:Buffer.from('evidence')}]});expect(mime).toContain('multipart/mixed');expect(mime).toContain('multipart/alternative');expect(mime).toContain('In-Reply-To: <original@example.test>');expect(mime).toContain('filename="evidence.txt"');expect(mime).toContain(Buffer.from('evidence').toString('base64'));});

  it('allows workflows to create drafts and dry-runs without external side effects',()=>{const {sender,service,workflows,repository}=fixture();const definition=workflows.createDefinition({name:'Draft Acme response',triggerType:'email_received',actions:[{type:'create_email_draft',accountId:EMAIL_ACCOUNT,organisationId:ACME,to:[{address:'aisling.byrne@acme.example'}],subject:'Draft response',body:'Review before sending.'}]});const dry=service.dryRunWorkflow(String(definition.id),{organisationId:ACME,accountId:EMAIL_ACCOUNT}) as {dryRun?:boolean};expect(dry.dryRun).toBe(true);expect(repository.listDrafts({organisationId:ACME}).filter((item)=>item.subject==='Draft response')).toHaveLength(0);const run=workflows.run({workflowId:String(definition.id),sourceType:'email_message',sourceId:'20000000-0000-4000-8000-000000000032',triggerEvent:'email_received',idempotencyKey:'wi7-draft-test',context:{organisationId:ACME,accountId:EMAIL_ACCOUNT}});expect(run.status).toBe('succeeded');expect(repository.listDrafts({organisationId:ACME}).some((item)=>item.subject==='Draft response')).toBe(true);expect(sender.messages).toHaveLength(0);});

  it('retries only failed workflow actions and does not duplicate successful tasks',()=>{const {workflows}=fixture();const definition=workflows.createDefinition({name:'Partial workflow',triggerType:'manual',actions:[{type:'create_task',organisationId:ACME,title:'Created once'},{type:'create_email_draft',organisationId:ACME,subject:'Will fail',body:'No account'}]});const first=workflows.run({workflowId:String(definition.id),sourceType:'organisation',sourceId:ACME,triggerEvent:'manual',idempotencyKey:'partial-workflow',context:{organisationId:ACME}});expect(first.status).toBe('partially_failed');expect(new WorkRepository().listTasks({organisationId:ACME}).filter((task)=>task.title==='Created once')).toHaveLength(1);const retry=workflows.retryRun(String(first.id));expect(retry.status).toBe('failed');expect(new WorkRepository().listTasks({organisationId:ACME}).filter((task)=>task.title==='Created once')).toHaveLength(1);});

  it('uses the exact CalDAV resource href, records conflicts and generates post-meeting work',async()=>{const {calendar,service,workflows}=fixture();workflows.createDefinition({name:'Meeting action',triggerType:'meeting_completed',actions:[{type:'create_task',organisationId:ACME,title:'Send completed-meeting summary',priority:'high'}]});const event=await service.createCalendarEvent({calendarId:CALENDAR,organisationId:ACME,contactId:AISLING,engagementId:ENGAGEMENT,event:{providerEventKey:'wi7-acme-meeting',title:'Acme WI7 review',description:'Review the communications hub.',startsAt:'2026-08-01T09:00:00.000Z',endsAt:'2026-08-01T10:00:00.000Z',timezone:'Europe/Dublin',attendees:[{name:'Aisling Byrne',address:'aisling.byrne@acme.example'}]}});expect(event.etag).toBe('"created-v1"');const updated=await service.updateCalendarEvent(String(event.id),{providerEventKey:'ignored-by-service',title:'Changed title',startsAt:'2026-08-01T09:00:00.000Z',endsAt:'2026-08-01T10:00:00.000Z',timezone:'Europe/Dublin',attendees:[]}) as any;expect(updated.etag).toBe('"updated-v2"');expect(calendar.updated.at(-1)?.resourceHref).toContain('remote-resource-44.ics');calendar.conflictOnUpdate=true;await expect(service.updateCalendarEvent(String(event.id),{providerEventKey:'wi7-acme-meeting',title:'Conflict',startsAt:'2026-08-01T09:00:00.000Z',endsAt:'2026-08-01T10:00:00.000Z',timezone:'Europe/Dublin',attendees:[]})).rejects.toThrow('CALDAV_CONFLICT');const conflict=getSqliteConnection().prepare(`SELECT status FROM calendar_write_operations WHERE operation='update' ORDER BY started_at DESC LIMIT 1`).get() as {status:string};expect(conflict.status).toBe('conflict');const completed=service.completeMeeting(String(event.id),'Agreed the post-meeting actions.');expect(completed.activityId).toBeTruthy();expect(new WorkRepository().listTasks({organisationId:ACME}).some((task)=>task.title==='Send completed-meeting summary')).toBe(true);});
});
