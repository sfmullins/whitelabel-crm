import fs from 'node:fs';
import path from 'node:path';
import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { getRuntimePaths } from '../config/runtimePaths';
import { runSeed } from '../infrastructure/database/seed';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { ConnectedCommunicationsRepository } from '../infrastructure/database/ConnectedCommunicationsRepository';
import { CredentialVault } from '../infrastructure/security/CredentialVault';
import { ConnectedCommunicationsService } from '../application/services/ConnectedCommunicationsService';
import type { CalendarSyncAdapter,EmailSyncAdapter } from '../infrastructure/integrations/ConnectedAdapters';
import { parseEmailSyncCursor,serializeEmailSyncCursor } from '../infrastructure/integrations/ConnectedAdapters';
import { WorkflowRepository } from '../infrastructure/database/WorkflowRepository';
import { WorkRepository } from '../infrastructure/database/WorkRepository';
import { ReminderScheduler } from '../application/services/ReminderScheduler';
import { NotificationRepository } from '../infrastructure/database/NotificationRepository';
import { DocumentService,type UploadDocumentInput } from '../application/services/DocumentService';

const ACME='20000000-0000-4000-8000-000000000001';
const AISLING='20000000-0000-4000-8000-000000000002';
let observedCalendarCursor:string|null|undefined;

const emailAdapter:EmailSyncAdapter={
  async test(){},
  async fetchSince(){return {nextCursor:serializeEmailSyncCursor({mailbox:'INBOX',uidValidity:'123',lastUid:42,failedUids:[]}),messages:[{uid:42,providerMessageKey:'INBOX:42',providerThreadKey:'thread-acme',rfcMessageId:'acme-42@example',direction:'inbound',from:{name:'Aisling Byrne',address:'aisling.byrne@acme.example'},to:[{address:'consultant@goodorder.example'}],subject:'Evidence pack',bodyText:'The evidence pack is attached.',sentAt:'2026-07-21T09:00:00.000Z',receivedAt:'2026-07-21T09:00:01.000Z',isRead:false,attachments:[{filename:'evidence.txt',mimeType:'text/plain',contentBase64:Buffer.from('Acme evidence').toString('base64')}]}]};},
};
const calendarAdapter:CalendarSyncAdapter={
  async test(){},
  async discover(){return [{providerCalendarKey:'https://dav.example/calendars/primary/',displayName:'Primary',syncToken:'current-server-token'}];},
  async fetchSince(_config,_secret,_calendar,cursor){observedCalendarCursor=cursor;return {nextCursor:'token-1',deletedResourceHrefs:[],events:[{providerEventKey:'meeting-acme',resourceHref:'https://dav.example/calendars/primary/resource-17.ics',title:'Acme leadership review',description:'Review findings.',startsAt:'2026-07-22T09:00:00.000Z',endsAt:'2026-07-22T10:00:00.000Z',timezone:'Europe/Dublin',attendees:[{name:'Aisling Byrne',address:'aisling.byrne@acme.example'}],cancelled:false}]};},
};
class FailOnceDocumentService extends DocumentService {attempts=0;override upload(input:UploadDocumentInput){this.attempts+=1;if(this.attempts===1)throw new Error('simulated attachment storage failure');return super.upload(input);}}

describe('WI6 connected communications',()=>{
  beforeEach(async()=>{observedCalendarCursor=undefined;setupTempDatabase();await runSeed();});
  afterEach(cleanupTempDatabase);

  it('encrypts credentials and synchronises matched email with attachments and workflow triggers',async()=>{
    const root=path.join(getRuntimePaths().dataDirectory,'vault');const repository=new ConnectedCommunicationsRepository();const vault=new CredentialVault(root);const workflow=new WorkflowRepository();
    workflow.createDefinition({name:'Email follow-up',triggerType:'email_received',conditions:{subject:{contains:'Evidence'}},actions:[{type:'create_task',title:'Review received evidence',priority:'high'}]});
    const service=new ConnectedCommunicationsService(repository,vault,emailAdapter,calendarAdapter);const account=service.createAccount({kind:'email',name:'Acme inbox',serverUrl:'imaps://mail.example',username:'consultant@goodorder.example',password:'not-stored-in-sqlite',settings:{mailbox:'INBOX'}});
    expect(fs.readFileSync(path.join(root,`${account.credentialKey}.json`),'utf8')).not.toContain('not-stored-in-sqlite');
    const result=await service.syncAccount(String(account.id));expect(result.status).toBe('succeeded');
    const threads=repository.listEmailThreads({status:'matched'}).filter((thread)=>thread.accountId===account.id);expect(threads).toHaveLength(1);expect(threads[0].organisationId).toBe(ACME);expect(threads[0].contactId).toBe(AISLING);
    expect(new WorkRepository().listTasks({organisationId:ACME}).some((task)=>task.title==='Review received evidence')).toBe(true);
  });

  it('retains a failed UID and resumes attachment ingestion without duplicating documents',async()=>{
    const repository=new ConnectedCommunicationsRepository();const vault=new CredentialVault(path.join(getRuntimePaths().dataDirectory,'vault-retry'));const documents=new FailOnceDocumentService();
    const service=new ConnectedCommunicationsService(repository,vault,emailAdapter,calendarAdapter,documents);const account=service.createAccount({kind:'email',name:'Retry inbox',serverUrl:'imaps://mail.example',username:'consultant@goodorder.example',password:'secret',settings:{mailbox:'INBOX'}});
    const first=await service.syncAccount(String(account.id));expect(first.status).toBe('failed');expect(parseEmailSyncCursor(String(repository.getAccount(String(account.id))?.syncCursor),'INBOX').failedUids).toEqual([42]);
    const second=await service.syncAccount(String(account.id));expect(second.status).toBe('succeeded');expect(parseEmailSyncCursor(String(repository.getAccount(String(account.id))?.syncCursor),'INBOX').failedUids).toEqual([]);
    const connection=getSqliteConnection();expect((connection.prepare('SELECT count(*) AS count FROM email_attachment_imports').get() as {count:number}).count).toBe(1);expect((connection.prepare("SELECT count(*) AS count FROM email_ingestion_state WHERE status='complete'").get() as {count:number}).count).toBeGreaterThan(0);
    expect(documents.attempts).toBe(2);
  });

  it('discovers CalDAV calendars, performs an initial full scan and stores exact hrefs',async()=>{
    const repository=new ConnectedCommunicationsRepository();const vault=new CredentialVault(path.join(getRuntimePaths().dataDirectory,'vault-calendar'));const service=new ConnectedCommunicationsService(repository,vault,emailAdapter,calendarAdapter);
    const account=service.createAccount({kind:'calendar',name:'Good Order calendar',serverUrl:'https://dav.example/calendars/',username:'consultant@goodorder.example',password:'secret',settings:{}});const result=await service.syncAccount(String(account.id));expect(result.status).toBe('succeeded');expect(observedCalendarCursor).toBeNull();
    const calendars=repository.listCalendars(String(account.id));expect(calendars).toHaveLength(1);expect(calendars[0].syncCursor).toBe('token-1');
    const events=repository.listCalendarEvents({status:'matched'}).filter((event)=>event.calendarId===calendars[0].id);expect(events).toHaveLength(1);expect(events[0].organisationId).toBe(ACME);expect(events[0].resourceHref).toContain('resource-17.ics');
    const work=new WorkRepository();for(const existing of work.listReminders({status:'pending',dueOnly:true}))work.updateReminderStatus(String(existing.id),'cancelled');
    const reminder=work.createReminder({sourceType:'calendar_event',sourceId:String(events[0].id),organisationId:ACME,scheduledAt:'2020-01-01T00:00:00.000Z'});const delivered:string[]=[];const scheduler=new ReminderScheduler(work,async(value)=>{delivered.push(String(value.id));});
    expect(await scheduler.processDue()).toEqual({delivered:1,failed:0});expect(await scheduler.processDue()).toEqual({delivered:0,failed:0});expect(delivered).toEqual([reminder.id]);
  });

  it('queues a durable notification before marking a reminder delivered',async()=>{
    const work=new WorkRepository();for(const existing of work.listReminders({status:'pending',dueOnly:true}))work.updateReminderStatus(String(existing.id),'cancelled');
    const reminder=work.createReminder({sourceType:'task',sourceId:'20000000-0000-4000-8000-000000000018',organisationId:ACME,scheduledAt:'2020-01-01T00:00:00.000Z'});
    const scheduler=new ReminderScheduler(work);expect(await scheduler.processDue()).toEqual({delivered:1,failed:0});
    expect(new NotificationRepository().getByReminder(String(reminder.id))?.status).toBe('unread');expect(work.getReminder(String(reminder.id))?.status).toBe('delivered');
  });
});
