import crypto from 'node:crypto';
import { db, getSqliteConnection } from './connection';
import * as schema from './schema';
import { rebuildSearchIndex } from './WorkspaceRepository';

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
        id: crypto.randomUUID(), organisationId: IDS.acmeOrganisation, contactId: IDS.acmeAisling, engagementId: IDS.acmeDiagnostic,
        type: 'meeting', body: 'Diagnostic kickoff completed. Agreed scope, evidence request and leadership interviews.', author: 'Stephen Mullins',
        occurredAt: addDays(nowDate, -12) + 'T10:00:00.000Z', followUpDate: null, followUpCompletedAt: null,
      },
      {
        id: crypto.randomUUID(), organisationId: IDS.acmeOrganisation, contactId: IDS.acmeAisling, engagementId: IDS.acmeDiagnostic,
        type: 'call', body: 'Review the outstanding service-data extract with Aisling.', author: 'Stephen Mullins',
        occurredAt: addDays(nowDate, -7) + 'T14:00:00.000Z', followUpDate: overdueDate, followUpCompletedAt: null,
      },
      {
        id: crypto.randomUUID(), organisationId: IDS.acmeOrganisation, contactId: IDS.acmeMark, engagementId: IDS.acmeDiagnostic,
        type: 'email', body: 'Confirm invoice coding and payment workflow with Finance.', author: 'Stephen Mullins',
        occurredAt: addDays(nowDate, -2) + 'T09:30:00.000Z', followUpDate: today, followUpCompletedAt: null,
      },
      {
        id: crypto.randomUUID(), organisationId: IDS.acmeOrganisation, contactId: IDS.acmeAisling, engagementId: IDS.acmeRedesign,
        type: 'note', body: 'Prepare redesign options for the leadership workshop.', author: 'Stephen Mullins',
        occurredAt: now, followUpDate: upcomingDate, followUpCompletedAt: null,
      },
      {
        id: crypto.randomUUID(), organisationId: IDS.acmeOrganisation, contactId: IDS.acmeAisling, engagementId: IDS.acmeDiagnostic,
        type: 'message', body: 'Evidence request acknowledged and completed.', author: 'Stephen Mullins',
        occurredAt: addDays(nowDate, -9) + 'T12:00:00.000Z', followUpDate: addDays(nowDate, -8), followUpCompletedAt: addDays(nowDate, -8) + 'T16:00:00.000Z',
      },
      {
        id: crypto.randomUUID(), organisationId: IDS.acmeOrganisation, contactId: null, engagementId: null,
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
      id: crypto.randomUUID(),
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

  rebuildSearchIndex(sqlite);
  console.log(`WI4 seed complete. Acme Ltd is ready; today is ${today}.`);
}

if (require.main === module) {
  runSeed().then(() => process.exit(0)).catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
}
