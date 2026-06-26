import { z } from 'zod';

// ==========================================
// Settings & Onboarding Schema
// ==========================================
export const SettingsSchema = z.object({
  id: z.string().optional(),
  businessName: z.string().min(1, 'Business name is required'),
  logoUrl: z.string().optional(), // Can store base64 string
  primaryColor: z.string().regex(/^#([A-Fa-f0-9]{6})$/, 'Must be a valid hex color (e.g. #3b82f6)'),
  secondaryColor: z.string().regex(/^#([A-Fa-f0-9]{6})$/, 'Must be a valid hex color'),
  accentColor: z.string().regex(/^#([A-Fa-f0-9]{6})$/, 'Must be a valid hex color'),
  address: z.string().min(1, 'Address is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email('Invalid email address'),
  website: z.string().url('Invalid website URL').or(z.literal('')),
  invoiceFooter: z.string().optional(),
  defaultTaxRate: z.number().min(0, 'Tax rate cannot be negative').default(0),
  currency: z.string().min(1, 'Currency is required').default('USD'),
  timezone: z.string().min(1, 'Time zone is required').default('UTC'),
  dateFormat: z.string().min(1, 'Date format is required').default('YYYY-MM-DD'),
});

export type Settings = z.infer<typeof SettingsSchema>;

// ==========================================
// Customer Schema
// ==========================================
export const CustomerSchema = z.object({
  id: z.string().uuid().optional(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  company: z.string().optional().or(z.literal('')),
  email: z.string().email('Invalid email address').or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  mobile: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Customer = z.infer<typeof CustomerSchema>;

// ==========================================
// Service Schema
// ==========================================
export const ServiceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Service name is required'),
  description: z.string().optional().or(z.literal('')),
  duration: z.number().int().min(1, 'Duration must be at least 1 minute'),
  price: z.number().int().min(0, 'Price cannot be negative'), // stored in cents
  taxRate: z.number().min(0, 'Tax rate cannot be negative'),
  isActive: z.boolean().default(true),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Service = z.infer<typeof ServiceSchema>;

// ==========================================
// Booking Schema
// ==========================================
export const BookingStatus = z.enum(['pending', 'confirmed', 'completed', 'cancelled']);
export type BookingStatusType = z.infer<typeof BookingStatus>;

export const BookingSchema = z.object({
  id: z.string().uuid().optional(),
  customerId: z.string().uuid('Customer is required'),
  serviceId: z.string().uuid('Service is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
  status: BookingStatus.default('pending'),
  notes: z.string().optional().or(z.literal('')),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Booking = z.infer<typeof BookingSchema>;

// ==========================================
// Invoice & Items Schemas
// ==========================================
export const InvoiceStatus = z.enum(['draft', 'unpaid', 'paid', 'cancelled']);
export type InvoiceStatusType = z.infer<typeof InvoiceStatus>;

export const InvoiceItemSchema = z.object({
  id: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional().nullable(),
  name: z.string().min(1, 'Item name is required'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  unitPrice: z.number().int().min(0, 'Price cannot be negative'), // in cents
  taxRate: z.number().min(0, 'Tax rate cannot be negative'),
});

export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;

export const InvoiceSchema = z.object({
  id: z.string().uuid().optional(),
  invoiceNumber: z.string().optional(), // generated automatically
  customerId: z.string().uuid('Customer is required'),
  bookingId: z.string().uuid().optional().nullable(),
  status: InvoiceStatus.default('unpaid'),
  notes: z.string().optional().or(z.literal('')),
  taxRate: z.number().min(0).default(0), // snapshot default tax rate or custom
  discount: z.number().int().min(0).default(0), // discount in cents
  items: z.array(InvoiceItemSchema).min(1, 'Invoice must have at least one item'),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Invoice = z.infer<typeof InvoiceSchema>;

// ==========================================
// Payment Schema
// ==========================================
export const PaymentMethod = z.enum(['cash', 'card', 'bank_transfer', 'other']);
export type PaymentMethodType = z.infer<typeof PaymentMethod>;

export const PaymentSchema = z.object({
  id: z.string().uuid().optional(),
  invoiceId: z.string().uuid('Invoice ID is required'),
  amount: z.number().int().min(1, 'Amount must be at least 1 cent'), // in cents
  paymentMethod: PaymentMethod.default('cash'),
  paymentDate: z.string().optional(), // defaults to now on backend
  notes: z.string().optional().or(z.literal('')),
  createdAt: z.string().optional(),
});

export type Payment = z.infer<typeof PaymentSchema>;

// ==========================================
// Custom Fields Schema
// ==========================================
export const CustomFieldType = z.enum([
  'text', 'textarea', 'number', 'currency', 'percentage',
  'date', 'datetime', 'checkbox', 'dropdown', 'multi-select',
  'email', 'phone', 'url'
]);
export type CustomFieldTypeEnum = z.infer<typeof CustomFieldType>;

export const CustomFieldDefinitionSchema = z.object({
  id: z.string().uuid().optional(),
  entityType: z.string().min(1, 'Entity type is required'), // 'customer', 'booking', 'service', 'invoice' or custom object api name
  name: z.string()
    .min(1, 'API Name is required')
    .regex(/^[a-z0-9_]+$/, 'API Name must contain only lowercase letters, numbers, and underscores'),
  label: z.string().min(1, 'Label is required'),
  type: CustomFieldType,
  options: z.array(z.string()).default([]), // For dropdown & multi-select
  required: z.boolean().default(false),
  createdAt: z.string().optional(),
});

export type CustomFieldDefinition = z.infer<typeof CustomFieldDefinitionSchema>;

export const CustomFieldValueSchema = z.object({
  id: z.string().uuid().optional(),
  entityId: z.string().uuid('Entity ID is required'),
  fieldId: z.string().uuid('Field ID is required'),
  value: z.string(), // serialized value
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type CustomFieldValue = z.infer<typeof CustomFieldValueSchema>;

// ==========================================
// Custom Objects Schema (Salesforce-Style)
// ==========================================
export const CustomObjectDefinitionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Label name is required (e.g. Vehicle)'),
  apiName: z.string()
    .min(1, 'API Name is required')
    .regex(/^[a-z0-9_]+$/, 'API Name must contain only lowercase letters, numbers, and underscores'),
  pluralName: z.string().min(1, 'Plural label is required (e.g. Vehicles)'),
  description: z.string().optional().or(z.literal('')),
  createdAt: z.string().optional(),
});

export type CustomObjectDefinition = z.infer<typeof CustomObjectDefinitionSchema>;

export const CustomObjectRecordSchema = z.object({
  id: z.string().uuid().optional(),
  objectDefinitionId: z.string().uuid('Definition ID is required'),
  customerId: z.string().uuid('Parent Customer ID is required'),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  values: z.record(z.string(), z.any()).optional(), // custom fields values mapped by field name/API name
});

export type CustomObjectRecord = z.infer<typeof CustomObjectRecordSchema>;

// Shared interface for full Custom Object Details
export interface CustomObjectDetails extends CustomObjectDefinition {
  fields: CustomFieldDefinition[];
}
