import { 
  Settings, Customer, Service, Booking, Invoice, Payment, 
  CustomFieldDefinition, CustomFieldValue, CustomObjectDefinition, CustomObjectRecord 
} from 'shared';

export interface ISettingsRepository {
  get(): Promise<Settings | null>;
  save(settings: Settings): Promise<Settings>;
}

export interface ICustomerRepository {
  getById(id: string): Promise<Customer | null>;
  getAll(search?: string): Promise<Customer[]>;
  create(customer: Customer): Promise<Customer>;
  update(id: string, customer: Partial<Customer>): Promise<Customer>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  countNewByPeriod(startDate: string, endDate: string): Promise<number>;
}

export interface IServiceRepository {
  getById(id: string): Promise<Service | null>;
  getAll(includeInactive?: boolean): Promise<Service[]>;
  create(service: Service): Promise<Service>;
  update(id: string, service: Partial<Service>): Promise<Service>;
  delete(id: string): Promise<void>;
}

export interface IBookingRepository {
  getById(id: string): Promise<Booking | null>;
  getAll(filters?: { customerId?: string; date?: string; startDate?: string; endDate?: string }): Promise<Booking[]>;
  create(booking: Booking): Promise<Booking>;
  update(id: string, booking: Partial<Booking>): Promise<Booking>;
  delete(id: string): Promise<void>;
  count(startDate?: string, endDate?: string): Promise<number>;
}

export interface IInvoiceRepository {
  getById(id: string): Promise<Invoice | null>;
  getByBookingId(bookingId: string): Promise<Invoice | null>;
  getAll(filters?: { customerId?: string; status?: string; startDate?: string; endDate?: string; search?: string }): Promise<Invoice[]>;
  getNextInvoiceNumber(date: string): Promise<string>;
  create(invoice: Omit<Invoice, 'invoiceNumber'>): Promise<Invoice>;
  update(id: string, invoice: Partial<Invoice>): Promise<Invoice>;
  delete(id: string): Promise<void>;
  sumRevenue(startDate?: string, endDate?: string): Promise<number>;
  sumOutstanding(startDate?: string, endDate?: string): Promise<number>;
}

export interface IPaymentRepository {
  getById(id: string): Promise<Payment | null>;
  getByInvoiceId(invoiceId: string): Promise<Payment[]>;
  create(payment: Payment): Promise<Payment>;
  delete(id: string): Promise<void>;
}

export interface ICustomFieldRepository {
  // Definitions
  createDefinition(def: CustomFieldDefinition): Promise<CustomFieldDefinition>;
  getDefinitions(entityType: string): Promise<CustomFieldDefinition[]>;
  getDefinitionByName(entityType: string, name: string): Promise<CustomFieldDefinition | null>;
  deleteDefinition(id: string): Promise<void>;
  
  // Values
  saveValues(entityId: string, values: Record<string, string>): Promise<void>;
  getValues(entityId: string): Promise<Record<string, string>>; // returns fieldName -> value map
}

export interface ICustomObjectRepository {
  // Definitions
  createDefinition(def: CustomObjectDefinition): Promise<CustomObjectDefinition>;
  getDefinitions(): Promise<CustomObjectDefinition[]>;
  getDefinitionByApiName(apiName: string): Promise<CustomObjectDefinition | null>;
  deleteDefinition(id: string): Promise<void>;
  
  // Records
  createRecord(record: Omit<CustomObjectRecord, 'values'>): Promise<CustomObjectRecord>;
  getRecords(definitionId: string, customerId?: string): Promise<CustomObjectRecord[]>;
  getRecordById(recordId: string): Promise<CustomObjectRecord | null>;
  deleteRecord(recordId: string): Promise<void>;
  
  // Values
  saveRecordValues(recordId: string, values: Record<string, string>): Promise<void>;
  getRecordValues(recordId: string): Promise<Record<string, string>>; // fieldName -> value map
}

import type { Organisation, OrganisationCreate, OrganisationUpdate, OrganisationStatus, Contact, ContactCreate, ContactUpdate, ContactStatus, Engagement, EngagementCreate, EngagementUpdate, EngagementStatus } from 'shared';

export interface ListOptions<TStatus> { status?: TStatus; includeArchived?: boolean; limit: number; offset: number; }
export interface OrganisationListOptions extends ListOptions<OrganisationStatus> { search?: string; }
export interface ContactListOptions extends ListOptions<ContactStatus> { organisationId: string; }
export interface EngagementListOptions extends ListOptions<EngagementStatus> { organisationId: string; }

export interface IOrganisationRepository {
  create(input: OrganisationCreate): Promise<Organisation>;
  getById(id: string, options?: { includeArchived?: boolean }): Promise<Organisation | null>;
  list(options: OrganisationListOptions): Promise<Organisation[]>;
  update(id: string, patch: OrganisationUpdate): Promise<Organisation | null>;
  archive(id: string, archivedAt: string): Promise<Organisation | null>;
}
export interface IContactRepository {
  create(input: ContactCreate): Promise<Contact>;
  createPrimary(input: ContactCreate): Promise<Contact>;
  getById(id: string, options?: { includeArchived?: boolean }): Promise<Contact | null>;
  list(options: ContactListOptions): Promise<Contact[]>;
  update(id: string, patch: ContactUpdate): Promise<Contact | null>;
  updatePrimary(id: string, patch: ContactUpdate): Promise<Contact | null>;
  archive(id: string, archivedAt: string): Promise<Contact | null>;
}
export interface IEngagementRepository {
  create(input: EngagementCreate): Promise<Engagement>;
  getById(id: string, options?: { includeArchived?: boolean }): Promise<Engagement | null>;
  list(options: EngagementListOptions): Promise<Engagement[]>;
  update(id: string, patch: EngagementUpdate): Promise<Engagement | null>;
  archive(id: string, archivedAt: string): Promise<Engagement | null>;
}
