import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, uniqueIndex, index, check } from 'drizzle-orm/sqlite-core';

// ==========================================
// Settings Table
// ==========================================
export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(), // We can use 'default' as the single settings row ID
  businessName: text('business_name').notNull(),
  logoUrl: text('logo_url'),
  primaryColor: text('primary_color').notNull(),
  secondaryColor: text('secondary_color').notNull(),
  accentColor: text('accent_color').notNull(),
  address: text('address').notNull(),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  website: text('website').notNull(),
  invoiceFooter: text('invoice_footer'),
  defaultTaxRate: real('default_tax_rate').notNull().default(0.0),
  currency: text('currency').notNull().default('USD'),
  timezone: text('timezone').notNull().default('UTC'),
  dateFormat: text('date_format').notNull().default('YYYY-MM-DD'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ==========================================
// Customers Table
// ==========================================
export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  company: text('company'),
  email: text('email').notNull(),
  phone: text('phone'),
  mobile: text('mobile'),
  address: text('address'),
  notes: text('notes'),
  tags: text('tags').notNull().default('[]'), // Stored as serialized JSON array
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  emailIdx: index('customer_email_idx').on(table.email),
  nameIdx: index('customer_name_idx').on(table.firstName, table.lastName),
}));

// ==========================================
// Services Table
// ==========================================
export const services = sqliteTable('services', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  duration: integer('duration').notNull(), // in minutes
  price: integer('price').notNull(), // in cents
  taxRate: real('tax_rate').notNull(), // percentage e.g. 15.0
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ==========================================
// Bookings Table
// ==========================================
export const bookings = sqliteTable('bookings', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  serviceId: text('service_id').notNull().references(() => services.id, { onDelete: 'restrict' }),
  date: text('date').notNull(), // YYYY-MM-DD
  time: text('time').notNull(), // HH:MM
  status: text('status').notNull().default('pending'), // 'pending', 'confirmed', 'completed', 'cancelled'
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  customerIdx: index('booking_customer_idx').on(table.customerId),
  dateIdx: index('booking_date_idx').on(table.date),
}));

// ==========================================
// Invoices Table
// ==========================================
export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey(),
  invoiceNumber: text('invoice_number').notNull(), // e.g. INV-YYYYMMDD-0001
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  bookingId: text('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('unpaid'), // 'draft', 'unpaid', 'paid', 'cancelled'
  notes: text('notes'),
  taxRate: real('tax_rate').notNull().default(0.0), // Snapshotted tax rate
  discount: integer('discount').notNull().default(0), // Discount in cents
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  invoiceNumIdx: uniqueIndex('invoice_num_idx').on(table.invoiceNumber),
  customerIdx: index('invoice_customer_idx').on(table.customerId),
  bookingIdx: index('invoice_booking_idx').on(table.bookingId),
}));

// ==========================================
// Invoice Items Table
// ==========================================
export const invoiceItems = sqliteTable('invoice_items', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  serviceId: text('service_id').references(() => services.id, { onDelete: 'set null' }),
  name: text('name').notNull(), // Snapshotted service name
  quantity: integer('quantity').notNull().default(1),
  unitPrice: integer('unit_price').notNull(), // Snapshotted price in cents
  taxRate: real('tax_rate').notNull(), // Snapshotted tax rate
  createdAt: text('created_at').notNull(),
}, (table) => ({
  invoiceIdx: index('invoice_item_parent_idx').on(table.invoiceId),
}));

// ==========================================
// Payments Table
// ==========================================
export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(), // in cents
  paymentMethod: text('payment_method').notNull().default('cash'), // 'cash', 'card', 'bank_transfer', 'other'
  paymentDate: text('payment_date').notNull(),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  invoiceIdx: index('payment_invoice_idx').on(table.invoiceId),
}));

// ==========================================
// Custom Fields Definition Table
// ==========================================
export const customFieldsDefinition = sqliteTable('custom_fields_definition', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(), // 'customer', 'service', 'booking', 'invoice', or custom object API name
  name: text('name').notNull(), // API field name e.g. 'pet_breed'
  label: text('label').notNull(), // Display label e.g. 'Pet Breed'
  type: text('type').notNull(), // 'text', 'textarea', 'number', 'currency', 'percentage', 'date', 'datetime', 'checkbox', 'dropdown', 'multi-select', 'email', 'phone', 'url'
  options: text('options').notNull().default('[]'), // JSON array of options for dropdown/multi-select
  required: integer('required', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  entityTypeIdx: index('cf_def_entity_idx').on(table.entityType),
  entityTypeFieldNameIdx: uniqueIndex('cf_def_name_idx').on(table.entityType, table.name),
}));

// ==========================================
// Custom Fields Values Table (for Core Entities)
// ==========================================
export const customFieldsValues = sqliteTable('custom_fields_values', {
  id: text('id').primaryKey(),
  entityId: text('entity_id').notNull(), // Customer UUID, Booking UUID, etc.
  fieldId: text('field_id').notNull().references(() => customFieldsDefinition.id, { onDelete: 'cascade' }),
  value: text('value').notNull(), // Serialized string or JSON representation
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  entityIdx: index('cf_val_entity_idx').on(table.entityId),
  entityFieldIdx: uniqueIndex('cf_val_unique_idx').on(table.entityId, table.fieldId),
}));

// ==========================================
// Custom Objects Definition Table (Salesforce-Style)
// ==========================================
export const customObjectsDefinition = sqliteTable('custom_objects_definition', {
  id: text('id').primaryKey(),
  name: text('name').notNull(), // e.g. 'Vehicle'
  apiName: text('api_name').notNull(), // e.g. 'vehicle' (unique)
  pluralName: text('plural_name').notNull(), // e.g. 'Vehicles'
  description: text('description'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  apiNameIdx: uniqueIndex('co_def_api_idx').on(table.apiName),
}));

// ==========================================
// Custom Objects Records Table
// ==========================================
export const customObjectsRecords = sqliteTable('custom_objects_records', {
  id: text('id').primaryKey(),
  objectDefinitionId: text('object_definition_id').notNull().references(() => customObjectsDefinition.id, { onDelete: 'cascade' }),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  definitionIdx: index('co_rec_def_idx').on(table.objectDefinitionId),
  customerIdx: index('co_rec_cust_idx').on(table.customerId),
}));

// ==========================================
// Custom Objects Values Table
// ==========================================
export const customObjectsValues = sqliteTable('custom_objects_values', {
  id: text('id').primaryKey(),
  recordId: text('record_id').notNull().references(() => customObjectsRecords.id, { onDelete: 'cascade' }),
  fieldId: text('field_id').notNull().references(() => customFieldsDefinition.id, { onDelete: 'cascade' }),
  value: text('value').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  recordIdx: index('co_val_rec_idx').on(table.recordId),
  recordFieldIdx: uniqueIndex('co_val_unique_idx').on(table.recordId, table.fieldId),
}));


// ==========================================
// Organisations Table
// ==========================================
export const organisations = sqliteTable('organisations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  website: text('website'),
  industry: text('industry'),
  employeeBand: text('employee_band'),
  annualRevenueBand: text('annual_revenue_band'),
  country: text('country'),
  status: text('status').notNull().default('prospect'),
  source: text('source'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  archivedAt: text('archived_at'),
}, (table) => ({
  statusIdx: index('organisation_status_idx').on(table.status),
  nameIdx: index('organisation_name_idx').on(table.name),
}));

// ==========================================
// Contacts Table
// ==========================================
export const contacts = sqliteTable('contacts', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'restrict' }),
  firstName: text('first_name'),
  lastName: text('last_name'),
  jobTitle: text('job_title'),
  email: text('email'),
  phone: text('phone'),
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  archivedAt: text('archived_at'),
}, (table) => ({
  organisationIdx: index('contact_organisation_idx').on(table.organisationId),
  emailIdx: index('contact_email_idx').on(table.email),
  organisationPrimaryIdx: index('contact_organisation_primary_idx').on(table.organisationId, table.isPrimary),
  oneActivePrimaryPerOrgIdx: uniqueIndex('contact_one_active_primary_per_org_idx').on(table.organisationId).where(sql`${table.isPrimary} = 1 AND ${table.status} = 'active' AND ${table.archivedAt} IS NULL`),
}));

// ==========================================
// Engagements Table
// ==========================================
export const engagements = sqliteTable('engagements', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'restrict' }),
  primaryContactId: text('primary_contact_id').references(() => contacts.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull().default('proposed'),
  summary: text('summary'),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  archivedAt: text('archived_at'),
}, (table) => ({
  organisationIdx: index('engagement_organisation_idx').on(table.organisationId),
  statusIdx: index('engagement_status_idx').on(table.status),
  startDateIdx: index('engagement_start_date_idx').on(table.startDate),
}));
// ==========================================
// Activities Table
// ==========================================
export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'restrict' }),
  contactId: text('contact_id').references(() => contacts.id, { onDelete: 'restrict' }),
  engagementId: text('engagement_id').references(() => engagements.id, { onDelete: 'restrict' }),
  type: text('type').notNull(),
  body: text('body').notNull(),
  author: text('author').notNull(),
  occurredAt: text('occurred_at').notNull(),
  followUpDate: text('follow_up_date'),
  followUpCompletedAt: text('follow_up_completed_at'),
  source: text('source').notNull(),
  sourceReference: text('source_reference'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  archivedAt: text('archived_at'),
}, (table) => ({
  organisationOccurredIdx: index('activity_organisation_occurred_idx').on(table.organisationId, table.occurredAt),
  contactIdx: index('activity_contact_idx').on(table.contactId),
  engagementIdx: index('activity_engagement_idx').on(table.engagementId),
  typeIdx: index('activity_type_idx').on(table.type),
  followUpIdx: index('activity_follow_up_idx').on(table.followUpDate),
  followUpCompletedIdx: index('activity_follow_up_completed_idx').on(table.followUpCompletedAt),
  sourceReferenceIdx: uniqueIndex('activity_source_reference_idx').on(table.sourceReference).where(sql`${table.sourceReference} IS NOT NULL`),
  typeCheck: check('activity_type_check', sql`${table.type} in ('note', 'call', 'email', 'meeting', 'message', 'other')`),
  sourceCheck: check('activity_source_check', sql`${table.source} in ('user', 'legacy_import', 'system')`),
  bodyCheck: check('activity_body_check', sql`length(trim(${table.body})) > 0`),
  authorCheck: check('activity_author_check', sql`length(trim(${table.author})) > 0`),
}));

// ==========================================
// Legacy customer compatibility mappings
// ==========================================
export const legacyOrganisationMappings = sqliteTable('legacy_organisation_mappings', {
  sourceKey: text('source_key').primaryKey(),
  sourceType: text('source_type').notNull(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'restrict' }),
  displayName: text('display_name').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  organisationIdx: uniqueIndex('legacy_org_mapping_organisation_idx').on(table.organisationId),
  sourceTypeCheck: check('legacy_org_mapping_source_type_check', sql`${table.sourceType} in ('company', 'individual_customer')`),
}));

export const legacyCustomerCrmMappings = sqliteTable('legacy_customer_crm_mappings', {
  customerId: text('customer_id').primaryKey().references(() => customers.id, { onDelete: 'restrict' }),
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'restrict' }),
  contactId: text('contact_id').notNull().references(() => contacts.id, { onDelete: 'restrict' }),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  organisationIdx: index('legacy_customer_mapping_organisation_idx').on(table.organisationId),
  contactIdx: uniqueIndex('legacy_customer_mapping_contact_idx').on(table.contactId),
}));
