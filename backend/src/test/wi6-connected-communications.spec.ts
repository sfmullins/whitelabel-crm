import fs from 'node:fs';
import path from 'node:path';
import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { getRuntimePaths } from '../config/runtimePaths';
import { runSeed } from '../infrastructure/database/seed';
import { ConnectedCommunicationsRepository } from '../infrastructure/database/ConnectedCommunicationsRepository';
import { CredentialVault } from '../infrastructure/security/CredentialVault';
import { ConnectedCommunicationsService } from '../application/services/ConnectedCommunicationsService';
import type { CalendarSyncAdapter,EmailSyncAdapter } from '../infrastructure/integrations/ConnectedAdapters';
import { WorkflowRepository } from '../infrastructure/database/WorkflowRepository';
import { WorkRepository } from '../infrastructure/database/WorkRepository';
import { ReminderScheduler } from '../application/services/ReminderScheduler';

const ACME='20000000-0000-4000-8000-000000000001';
const AISLING='20000000-0000-4000-8000-000000000002';

const emailAdapter:EmailSyncAdapter={
  async test(){},
  async fetchSince(){return {nextCursor:'42',messages:[{providerMessageKey:'INBOX:42',providerThreadKey:'thread-acme',rfcMessageId:'acme-42@example',direction:'inbound',from:{name:'Aisling Byrne',address:'aisling.byrne@acme.example'},to:[{address:'consultant@goodorder.example'}],subject:'Evidence pack',bodyText:'The evidence pack is attached.',sentAt:'2026-07-21T09:00:00.000Z',receivedAt:'2026-07-21T09:00:01.000Z',isRead:false,attachments:[{filename:'evidence.txt',mimeType:'text/plain',contentBase64:Buffer.from('Acme evidence').toString('base64')}]}]};},
};
const calendarAdapter:CalendarSyncAdapter={
  async test(){},
  async discover(){return [{providerCalendarKey:'https://dav.example/calendars/primary',displayName:'Primary'}];},
  async fetchSince(){return {nextCursor:'2026-07-22T10:00:00.000Z',events:[{providerEventKey:'meeting-acme',title:'Acme leadership review',description:'Review findings.',startsAt:'2026-07-22T09:00:00.000Z',endsAt:'2026-07-22T10:00:00.000Z',timezone:'Europe/Dublin',attendees:[{name:'Aisling Byrne',address:'aisling.byrne@acme.example'}],cancelled:false}]};},
};

describe('WI6 connected communications',()=>{
  beforeEach(async()=>{setupTempDatabase();await runSeed();});
  afterEach(cleanupTempDatabase);

  it('encrypts credentials and synchronises matched email with attachments and workflow triggers',async()=>{
    const root=path.join(getRuntimePaths().dataDirectory,'vault');
    const repository=new ConnectedCommunicationsRepository();
    const vault=new CredentialVault(root);
    const workflow=new WorkflowRepository();
    workflow.createDefinition({name:'Email follow-up',triggerType:'email_received',conditions:{subject:{contains:'Evidence'}},actions:[{type:'create_task',title:'Review received evidence',priority:'high'}]});
    const service=new ConnectedCommunicationsService(repository,vault,emailAdapter,calendarAdapter);
    const account=service.createAccount({kind:'email',name:'Acme inbox',serverUrl:'imaps://mail.example',username:'consultant@goodorder.example',password:'not-stored-in-sqlite',settings:{mailbox:'INBOX'}});
    const vaultText=fs.readFileSync(path.join(root,`${account.credentialKey}.json`),'utf8');
    expect(vaultText).not.toContain('not-stored-in-sqlite');
    const result=await service.syncAccount(String(account.id));
    expect(result.status).toBe('succeeded');
    const threads=repository.listEmailThreads({status:'matched'}).filter((thread)=>thread.accountId===account.id);
    expect(threads).toHaveLength(1);
    expect(threads[0].organisationId).toBe(ACME);
    expect(threads[0].contactId).toBe(AISLING);
    expect(new WorkRepository().listTasks({organisationId:ACME}).some((task)=>task.title==='Review received evidence')).toBe(true);
  });

  it('discovers CalDAV calendars, matches events and processes due reminders once',async()=>{
    const repository=new ConnectedCommunicationsRepository();
    const vault=new CredentialVault(path.join(getRuntimePaths().dataDirectory,'vault-calendar'));
    const service=new ConnectedCommunicationsService(repository,vault,emailAdapter,calendarAdapter);
    const account=service.createAccount({kind:'calendar',name:'Good Order calendar',serverUrl:'https://dav.example/calendars/',username:'consultant@goodorder.example',password:'secret',settings:{}});
    const result=await service.syncAccount(String(account.id));
    expect(result.status).toBe('succeeded');
    const calendars=repository.listCalendars(String(account.id));
    expect(calendars).toHaveLength(1);
    const events=repository.listCalendarEvents({status:'matched'}).filter((event)=>event.calendarId===calendars[0].id);
    expect(events).toHaveLength(1);
    expect(events[0].organisationId).toBe(ACME);
    const work=new WorkRepository();
    for(const existing of work.listReminders({status:'pending',dueOnly:true})){
      work.updateReminderStatus(String(existing.id),'cancelled');
    }
    const reminder=work.createReminder({sourceType:'calendar_event',sourceId:String(events[0].id),organisationId:ACME,scheduledAt:'2020-01-01T00:00:00.000Z'});
    const delivered:string[]=[];
    const scheduler=new ReminderScheduler(work,async(value)=>{delivered.push(String(value.id));});
    expect(await scheduler.processDue()).toEqual({delivered:1,failed:0});
    expect(await scheduler.processDue()).toEqual({delivered:0,failed:0});
    expect(delivered).toEqual([reminder.id]);
  });
});
