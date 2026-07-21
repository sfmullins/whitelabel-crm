import crypto from 'node:crypto';
import { db, getSqliteConnection } from './connection';
import * as schema from './schema';
import { rebuildSearchIndex } from './WorkspaceRepository';
import { LocalDocumentStorage } from '../storage/LocalDocumentStorage';

const IDS = {
  goodOrderOrganisation: '10000000-0000-4000-8000-000000000001',
  stephenContact: '10000000-0000-4000-8000-000000000002',
  acmeOrganisation: '20000000-0000-4000-8000-000000000001',
  acmeAisling: '20000000-0000-4000-8000-000000000002',
  acmeMark: '20000000-0000-4000-8000-000000000003',
  acmeDiagnostic: '20000000-0000-4000-8000-000000000004',
  acmeRedesign: '20000000-0000-4000-8000-000000000005',
  acmeCustomer: '20000000-0000-4000-8000-000000000006',
  acmeBooking: '20000000-0000-4000-8000-000000000007',
  acmeInvoice: '20000000-0000-4000-8000-000000000008',
  acmePayment: '20000000-0000-4000-8000-000000000009',
  acmeService: '20000000-0000-4000-8000-000000000010',
  acmeMeetingActivity: '20000000-0000-4000-8000-000000000011',
  acmeOverdueActivity: '20000000-0000-4000-8000-000000000012',
  acmeTodayActivity: '20000000-0000-4000-8000-000000000013',
  acmeUpcomingActivity: '20000000-0000-4000-8000-000000000014',
  acmeCompletedActivity: '20000000-0000-4000-8000-000000000015',
  acmeNoteActivity: '20000000-0000-4000-8000-000000000016',
  acmeInvoiceItem: '20000000-0000-4000-8000-000000000017',
  acmeTask: '20000000-0000-4000-8000-000000000018',
  acmeCompletedTask: '20000000-0000-4000-8000-000000000019',
  acmeReminder: '20000000-0000-4000-8000-000000000020',
  acmeDocument: '20000000-0000-4000-8000-000000000021',
  acmeDocumentVersion: '20000000-0000-4000-8000-000000000022',
  acmeDocumentLink: '20000000-0000-4000-8000-000000000023',
  acmeEmailCommunication: '20000000-0000-4000-8000-000000000024',
  acmeMeetingCommunication: '20000000-0000-4000-8000-000000000025',
  acmeWorkflow: '20000000-0000-4000-8000-000000000026',
  acmeWorkflowRun: '20000000-0000-4000-8000-000000000027',
  acmeWorkflowActionRun: '20000000-0000-4000-8000-000000000028',
  fixtureEmailAccount: '20000000-0000-4000-8000-000000000029',
  fixtureCalendarAccount: '20000000-0000-4000-8000-000000000030',
  fixtureEmailThread: '20000000-0000-4000-8000-000000000031',
  fixtureEmailMessage: '20000000-0000-4000-8000-000000000032',
  fixtureCalendar: '20000000-0000-4000-8000-000000000033',
  fixtureCalendarEvent: '20000000-0000-4000-8000-000000000034',
  fixtureEmailSync: '20000000-0000-4000-8000-000000000035',
  fixtureCalendarSync: '20000000-0000-4000-8000-000000000036',
  northstarOrganisation: '30000000-0000-4000-8000-000000000001',
} as const;

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number): string {
  const copy = new Date(base);
  copy.setUTCDate(copy.getUTCDate() + days);
  return dateOnly(copy);
}

export async function runSeed(): Promise<void> {
  console.log('Resetting and seeding the WI4 development database...');
  const sqlite = getSqliteConnection();
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const today = dateOnly(nowDate);
  const overdueDate = addDays(nowDate, -5);
  const upcomingDate = addDays(nowDate, 7);
  const endingSoonDate = addDays(nowDate, 21);

  sqlite.exec(`
    DELETE FROM match_suggestions; DELETE FROM email_attachments; DELETE FROM email_messages; DELETE FROM email_threads;
    DELETE FROM calendar_events; DELETE FROM calendars; DELETE FROM synchronization_runs; DELETE FROM communication_accounts;
    DELETE FROM workflow_action_runs; DELETE FROM workflow_runs; DELETE FROM workflow_definitions;
    DELETE FROM document_links; DELETE FROM document_versions; DELETE FROM documents;
    DELETE FROM reminders; DELETE FROM tasks; DELETE FROM communications;
  `);

  sqlite.transaction(() => {
    db.delete(schema.savedViews).run();
    db.delete(schema.searchDocuments).run();
    db.delete(schema.activities).run();
    db.delete(schema.legacyCustomerCrmMappings).run();
    db.delete(schema.legacyOrganisationMappings).run();
    db.delete(schema.engagements).run();
    db.delete(schema.contacts).run();
    db.delete(schema.organisations).run();
    db.delete(schema.payments).run();
    db.delete(schema.invoiceItems).run();
    db.delete(schema.invoices).run();
    db.delete(schema.bookings).run();
    db.delete(schema.customObjectsValues).run();
    db.delete(schema.customObjectsRecords).run();
    db.delete(schema.customFieldsValues).run();
    db.delete(schema.customFieldsDefinition).run();
    db.delete(schema.customObjectsDefinition).run();
    db.delete(schema.services).run();
    db.delete(schema.customers).run();
    db.delete(schema.settings).run();

    db.insert(schema.settings).values({
      id: 'default',
      businessName: 'Good Order Ltd',
      logoUrl: '',
      primaryColor: '#111827',
      secondaryColor: '#2563eb',
      accentColor: '#0f766e',
      address: 'Co. Kildare, Ireland',
      phone: 'Not provided',
      email: 'not-provided@goodorder.invalid',
      website: '',
      invoiceFooter: 'Good Order Ltd · Co. Kildare, Ireland',
      defaultTaxRate: 23,
      currency: 'EUR',
      timezone: 'Europe/Dublin',
      dateFormat: 'DD/MM/YYYY',
      createdAt: now,
      updatedAt: now,
    }).run();

    db.insert(schema.services).values({
      id: IDS.acmeService,
      name: 'Service Delivery Diagnostic',
      description: 'Structured assessment of service delivery, customer experience and operating controls.',
      duration: 90,
      price: 500000,
      taxRate: 23,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }).run();

    db.insert(schema.organisations).values([
      {
        id: IDS.goodOrderOrganisation,
        name: 'Good Order Ltd',
        legalName: 'Good Order Ltd',
        website: null,
        industry: 'Business consulting',
        employeeBand: '1_9',
        annualRevenueBand: null,
        country: 'IE',
        status: 'partner',
        source: 'Internal',
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      },
      {
        id: IDS.acmeOrganisation,
        name: 'Acme Ltd',
        legalName: 'Acme Ltd',
        website: null,
        industry: 'Technology services',
        employeeBand: '50_74',
        annualRevenueBand: '5m_20m',
        country: 'IE',
        status: 'active_client',
        source: 'Referral',
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      },
      {
        id: IDS.northstarOrganisation,
        name: 'Northstar Foods Ltd',
        legalName: null,
        website: null,
        industry: 'Food production',
        employeeBand: '25_49',
        annualRevenueBand: '1m_5m',
        country: 'IE',
        status: 'prospect',
        source: 'Website',
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      },
    ]).run();

    db.insert(schema.contacts).values([
      {
        id: IDS.stephenContact,
        organisationId: IDS.goodOrderOrganisation,
        firstName: 'Stephen',
        lastName: 'Mullins',
        jobTitle: 'Principal Consultant',
        email: null,
        phone: null,
        isPrimary: true,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      },
      {
        id: IDS.acmeAisling,
        organisationId: IDS.acmeOrganisation,
        firstName: 'Aisling',
        lastName: 'Byrne',
        jobTitle: 'Operations Director',
        email: 'aisling.byrne@acme.example',
        phone: null,
        isPrimary: true,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      },
      {
        id: IDS.acmeMark,
        organisationId: IDS.acmeOrganisation,
        firstName: 'Mark',
        lastName: "O'Connell",
        jobTitle: 'Finance Manager',
        email: 'mark.oconnell@acme.example',
        phone: null,
        isPrimary: false,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      },
    ]).run();

    db.insert(schema.engagements).values([
      {
        id: IDS.acmeDiagnostic,
        organisationId: IDS.acmeOrganisation,
        primaryContactId: IDS.acmeAisling,
        name: 'Service Delivery Diagnostic',
        type: 'diagnostic',
        status: 'active',
        summary: 'Assess service delivery performance, operating controls and customer-friction points.',
        startDate: addDays(nowDate, -14),
        endDate: endingSoonDate,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      },
      {
        id: IDS.acmeRedesign,
        organisationId: IDS.acmeOrganisation,
        primaryContactId: IDS.acmeAisling,
        name: 'Operating Model Redesign',
        type: 'redesign',
        status: 'proposed',
        summary: 'Proposed redesign following diagnostic findings.',
        startDate: addDays(nowDate, 30),
        endDate: null,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      },
    ]).run();

    db.insert(schema.customers).values({
      id: IDS.acmeCustomer,
      firstName: 'Aisling',
      lastName: 'Byrne',
      company: 'Acme Ltd',
      email: 'aisling.byrne@acme.example',
      phone: null,
      mobile: null,
      address: 'Ireland',
      notes: null,
      tags: JSON.stringify(['Active Client', 'Technology Services']),
      createdAt: now,
      updatedAt: now,
    }).run();

    db.insert(schema.legacyOrganisationMappings).values({
      sourceKey: 'company:acme ltd',
      sourceType: 'company',
      organisationId: IDS.acmeOrganisation,
      displayName: 'Acme Ltd',
      createdAt: now,
    }).run();
    db.insert(schema.legacyCustomerCrmMappings).values({
      customerId: IDS.acmeCustomer,
      organisationId: IDS.acmeOrganisation,
      contactId: IDS.acmeAisling,
      createdAt: now,
    }).run();

    const activityRows = [
      {
        id: IDS.acmeMeetingActivity, organisationId: IDS.acmeOrganisation, contactId: IDS.acmeAisling, engagementId: IDS.acmeDiagnostic,
        type: 'meeting', body: 'Diagnostic kickoff completed. Agreed scope, evidence request and leadership interviews.', author: 'Stephen Mullins',
        occurredAt: addDays(nowDate, -12) + 'T10:00:00.000Z', followUpDate: null, followUpCompletedAt: null,
      },
      {
        id: IDS.acmeOverdueActivity, organisationId: IDS.acmeOrganisation, contactId: IDS.acmeAisling, engagementId: IDS.acmeDiagnostic,
        type: 'call', body: 'Review the outstanding service-data extract with Aisling.', author: 'Stephen Mullins',
        occurredAt: addDays(nowDate, -7) + 'T14:00:00.000Z', followUpDate: overdueDate, followUpCompletedAt: null,
      },
      {
        id: IDS.acmeTodayActivity, organisationId: IDS.acmeOrganisation, contactId: IDS.acmeMark, engagementId: IDS.acmeDiagnostic,
        type: 'email', body: 'Confirm invoice coding and payment workflow with Finance.', author: 'Stephen Mullins',
        occurredAt: addDays(nowDate, -2) + 'T09:30:00.000Z', followUpDate: today, followUpCompletedAt: null,
      },
      {
        id: IDS.acmeUpcomingActivity, organisationId: IDS.acmeOrganisation, contactId: IDS.acmeAisling, engagementId: IDS.acmeRedesign,
        type: 'note', body: 'Prepare redesign options for the leadership workshop.', author: 'Stephen Mullins',
        occurredAt: now, followUpDate: upcomingDate, followUpCompletedAt: null,
      },
      {
        id: IDS.acmeCompletedActivity, organisationId: IDS.acmeOrganisation, contactId: IDS.acmeAisling, engagementId: IDS.acmeDiagnostic,
        type: 'message', body: 'Evidence request acknowledged and completed.', author: 'Stephen Mullins',
        occurredAt: addDays(nowDate, -9) + 'T12:00:00.000Z', followUpDate: addDays(nowDate, -8), followUpCompletedAt: addDays(nowDate, -8) + 'T16:00:00.000Z',
      },
      {
        id: IDS.acmeNoteActivity, organisationId: IDS.acmeOrganisation, contactId: null, engagementId: null,
        type: 'note', body: 'Acme Ltd is the principal WI4 demonstration account.', author: 'Stephen Mullins',
        occurredAt: now, followUpDate: null, followUpCompletedAt: null,
      },
    ];
    for (const activity of activityRows) {
      db.insert(schema.activities).values({
        ...activity,
        source: 'user',
        sourceReference: null,
        createdAt: activity.occurredAt,
        updatedAt: now,
        archivedAt: null,
      }).run();
    }

    db.insert(schema.bookings).values({
      id: IDS.acmeBooking,
      customerId: IDS.acmeCustomer,
      serviceId: IDS.acmeService,
      date: addDays(nowDate, -12),
      time: '10:00',
      status: 'completed',
      notes: 'Acme diagnostic kickoff.',
      createdAt: addDays(nowDate, -13) + 'T12:00:00.000Z',
      updatedAt: now,
    }).run();
    db.insert(schema.invoices).values({
      id: IDS.acmeInvoice,
      invoiceNumber: 'GO-ACME-0001',
      customerId: IDS.acmeCustomer,
      bookingId: IDS.acmeBooking,
      status: 'unpaid',
      notes: 'Acme Ltd diagnostic engagement.',
      taxRate: 23,
      discount: 0,
      createdAt: addDays(nowDate, -10) + 'T09:00:00.000Z',
      updatedAt: now,
    }).run();
    db.insert(schema.invoiceItems).values({
      id: IDS.acmeInvoiceItem,
      invoiceId: IDS.acmeInvoice,
      serviceId: IDS.acmeService,
      name: 'Service Delivery Diagnostic',
      quantity: 1,
      unitPrice: 500000,
      taxRate: 23,
      createdAt: addDays(nowDate, -10) + 'T09:00:00.000Z',
    }).run();
    db.insert(schema.payments).values({
      id: IDS.acmePayment,
      invoiceId: IDS.acmeInvoice,
      amount: 200000,
      paymentMethod: 'bank_transfer',
      paymentDate: addDays(nowDate, -3) + 'T11:00:00.000Z',
      notes: 'Part payment received.',
      createdAt: addDays(nowDate, -3) + 'T11:00:00.000Z',
    }).run();

    db.insert(schema.savedViews).values([
      {
        id: crypto.randomUUID(),
        context: 'organisations',
        name: 'Active clients',
        normalizedName: 'active clients',
        definitionJson: JSON.stringify({ version: 1, context: 'organisations', filters: { status: 'active_client' }, sort: 'recent_activity' }),
        isPinned: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        context: 'followups',
        name: 'Overdue follow-ups',
        normalizedName: 'overdue follow-ups',
        definitionJson: JSON.stringify({ version: 1, context: 'followups', filters: { bucket: 'overdue' }, sort: 'due_asc' }),
        isPinned: true,
        createdAt: now,
        updatedAt: now,
      },
    ]).run();
  })();

  const storage = new LocalDocumentStorage();
  const content = Buffer.from('Acme Ltd diagnostic proposal and evidence summary.','utf8');
  const stored = storage.write(IDS.acmeDocument,IDS.acmeDocumentVersion,'acme-diagnostic-proposal.txt',content);
  sqlite.transaction(() => {
    sqlite.prepare(`INSERT INTO tasks(id,organisation_id,contact_id,engagement_id,activity_id,source_type,source_id,title,description,status,priority,due_at,reminder_at,recurrence_rule,assigned_to,created_by_source,workflow_run_id,completed_at,created_at,updated_at,archived_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`).run(IDS.acmeTask,IDS.acmeOrganisation,IDS.acmeAisling,IDS.acmeDiagnostic,null,'engagement',IDS.acmeDiagnostic,'Prepare leadership readout','Consolidate diagnostic evidence and prepare the leadership readout.','in_progress','high',upcomingDate+'T10:00:00.000Z',today+'T16:00:00.000Z',null,'Stephen Mullins','user',null,null,now,now);
    sqlite.prepare(`INSERT INTO tasks(id,organisation_id,contact_id,engagement_id,title,description,status,priority,due_at,created_by_source,completed_at,created_at,updated_at,archived_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`).run(IDS.acmeCompletedTask,IDS.acmeOrganisation,IDS.acmeAisling,IDS.acmeDiagnostic,'Issue evidence request','Evidence request issued and acknowledged.','completed','normal',overdueDate+'T09:00:00.000Z','user',overdueDate+'T16:00:00.000Z',overdueDate+'T09:00:00.000Z',now);
    sqlite.prepare(`INSERT INTO reminders(id,source_type,source_id,organisation_id,scheduled_at,delivery_method,status,created_at,updated_at) VALUES(?,?,?,?,?,'desktop','pending',?,?)`).run(IDS.acmeReminder,'task',IDS.acmeTask,IDS.acmeOrganisation,today+'T16:00:00.000Z',now,now);
    sqlite.prepare(`INSERT INTO documents(id,title,current_filename,mime_type,byte_size,checksum,storage_provider,storage_key,description,category,created_at,updated_at,archived_at) VALUES(?,?,?,?,?,?,'local',?,?,?, ?,?,NULL)`).run(IDS.acmeDocument,'Acme diagnostic proposal','acme-diagnostic-proposal.txt','text/plain',stored.byteSize,stored.checksum,stored.storageKey,'Proposal and evidence summary for the active diagnostic.','proposal',now,now);
    sqlite.prepare(`INSERT INTO document_versions(id,document_id,version_number,filename,mime_type,byte_size,checksum,storage_key,version_note,created_at) VALUES(?,?,1,?,?,?,?,?,'Initial WI5 fixture',?)`).run(IDS.acmeDocumentVersion,IDS.acmeDocument,'acme-diagnostic-proposal.txt','text/plain',stored.byteSize,stored.checksum,stored.storageKey,now);
    sqlite.prepare(`INSERT INTO document_links(id,document_id,entity_type,entity_id,created_at) VALUES(?,?,'organisation',?,?)`).run(IDS.acmeDocumentLink,IDS.acmeDocument,IDS.acmeOrganisation,now);
    sqlite.prepare(`INSERT INTO communications(id,organisation_id,contact_id,engagement_id,channel,direction,subject,body,occurred_at,status,created_at,updated_at,archived_at) VALUES(?,?,?,?,?,?,?,?,?,'logged',?,?,NULL)`).run(IDS.acmeEmailCommunication,IDS.acmeOrganisation,IDS.acmeAisling,IDS.acmeDiagnostic,'email','inbound','Diagnostic evidence','Aisling confirmed the evidence pack is complete.',addDays(nowDate,-2)+'T11:00:00.000Z',now,now);
    sqlite.prepare(`INSERT INTO communications(id,organisation_id,contact_id,engagement_id,channel,direction,subject,body,occurred_at,status,created_at,updated_at,archived_at) VALUES(?,?,?,?,?,?,?,?,?,'logged',?,?,NULL)`).run(IDS.acmeMeetingCommunication,IDS.acmeOrganisation,IDS.acmeAisling,IDS.acmeDiagnostic,'meeting','internal','Leadership review','Reviewed initial findings and agreed the leadership readout.',addDays(nowDate,-1)+'T14:00:00.000Z',now,now);
    sqlite.prepare(`INSERT INTO workflow_definitions(id,name,description,enabled,version,trigger_type,condition_json,action_json,created_at,updated_at,archived_at) VALUES(?,?,?,1,1,'manual','{}',?,?,?,NULL)`).run(IDS.acmeWorkflow,'Post-meeting follow-up','Create a follow-up task after a meeting.',JSON.stringify([{type:'create_task',title:'Send meeting follow-up',priority:'high'}]),now,now);
    sqlite.prepare(`INSERT INTO workflow_runs(id,workflow_definition_id,workflow_version,source_type,source_id,trigger_event,idempotency_key,status,output_summary,started_at,completed_at) VALUES(?, ?,1,'organisation',?,'seed','wi5-seed-workflow','succeeded','[]',?,?)`).run(IDS.acmeWorkflowRun,IDS.acmeWorkflow,IDS.acmeOrganisation,now,now);
    sqlite.prepare(`INSERT INTO workflow_action_runs(id,workflow_run_id,action_index,action_type,status,output_json,started_at,completed_at) VALUES(?,?,0,'create_task','succeeded','{}',?,?)`).run(IDS.acmeWorkflowActionRun,IDS.acmeWorkflowRun,now,now);
  })();

  sqlite.transaction(() => {
    sqlite.prepare(`INSERT INTO communication_accounts(id,kind,name,server_url,username,credential_key,settings_json,enabled,health_status,sync_cursor,last_sync_at,created_at,updated_at,archived_at) VALUES(?, 'email','Good Order fixture inbox','imaps://mail.example','consultant@goodorder.example','fixture-email-key','{"mailbox":"INBOX"}',0,'healthy','42',?,?,?,NULL)`).run(IDS.fixtureEmailAccount,now,now,now);
    sqlite.prepare(`INSERT INTO communication_accounts(id,kind,name,server_url,username,credential_key,settings_json,enabled,health_status,sync_cursor,last_sync_at,created_at,updated_at,archived_at) VALUES(?, 'calendar','Good Order fixture calendar','https://dav.example/calendars/','consultant@goodorder.example','fixture-calendar-key','{}',0,'healthy',?, ?,?,?,NULL)`).run(IDS.fixtureCalendarAccount,upcomingDate+'T10:00:00.000Z',now,now,now);
    sqlite.prepare(`INSERT INTO email_threads(id,account_id,provider_thread_key,subject,latest_message_at,organisation_id,contact_id,match_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'matched',?,?)`).run(IDS.fixtureEmailThread,IDS.fixtureEmailAccount,'fixture-acme-thread','Evidence pack received',addDays(nowDate,-2)+'T11:00:00.000Z',IDS.acmeOrganisation,IDS.acmeAisling,now,now);
    sqlite.prepare(`INSERT INTO email_messages(id,account_id,thread_id,provider_message_key,rfc_message_id,direction,sender_json,recipients_json,subject,body_text,sent_at,received_at,is_read,raw_headers_json,communication_id,created_at,updated_at) VALUES(?,?,?,?,?,'inbound',?,?,?,?,?,?,0,'{}',?,?,?)`).run(IDS.fixtureEmailMessage,IDS.fixtureEmailAccount,IDS.fixtureEmailThread,'INBOX:42','fixture-42@example',JSON.stringify({name:'Aisling Byrne',address:'aisling.byrne@acme.example'}),JSON.stringify({to:[{address:'consultant@goodorder.example'}],cc:[],bcc:[]}), 'Evidence pack received','The diagnostic evidence pack is ready.',addDays(nowDate,-2)+'T11:00:00.000Z',addDays(nowDate,-2)+'T11:00:01.000Z',IDS.acmeEmailCommunication,now,now);
    sqlite.prepare(`INSERT INTO calendars(id,account_id,provider_calendar_key,display_name,selected,created_at,updated_at) VALUES(?,?,?,'Primary',1,?,?)`).run(IDS.fixtureCalendar,IDS.fixtureCalendarAccount,'https://dav.example/calendars/primary',now,now);
    sqlite.prepare(`INSERT INTO calendar_events(id,calendar_id,provider_event_key,title,description,starts_at,ends_at,timezone,recurrence_json,attendees_json,cancelled,organisation_id,contact_id,engagement_id,match_status,communication_id,created_at,updated_at) VALUES(?,?,?,'Acme leadership review','Review diagnostic findings.',?,?, 'Europe/Dublin','{}',?,0,?,?,?,'matched',?,?,?)`).run(IDS.fixtureCalendarEvent,IDS.fixtureCalendar,'fixture-acme-meeting',upcomingDate+'T09:00:00.000Z',upcomingDate+'T10:00:00.000Z',JSON.stringify([{name:'Aisling Byrne',address:'aisling.byrne@acme.example'}]),IDS.acmeOrganisation,IDS.acmeAisling,IDS.acmeDiagnostic,IDS.acmeMeetingCommunication,now,now);
    sqlite.prepare(`INSERT INTO synchronization_runs(id,account_id,sync_type,status,cursor_before,cursor_after,fetched_count,created_count,updated_count,matched_count,failure_count,started_at,completed_at) VALUES(?,?,'email','succeeded','41','42',1,1,0,1,0,?,?)`).run(IDS.fixtureEmailSync,IDS.fixtureEmailAccount,now,now);
    sqlite.prepare(`INSERT INTO synchronization_runs(id,account_id,sync_type,status,cursor_before,cursor_after,fetched_count,created_count,updated_count,matched_count,failure_count,started_at,completed_at) VALUES(?,?,'calendar','succeeded',NULL,?,1,1,0,1,0,?,?)`).run(IDS.fixtureCalendarSync,IDS.fixtureCalendarAccount,upcomingDate+'T10:00:00.000Z',now,now);
  })();

  rebuildSearchIndex(sqlite);
  console.log(`WI6 seed complete. Acme Ltd connected communications are ready; today is ${today}.`);
}

if (require.main === module) {
  runSeed().then(() => process.exit(0)).catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
}
