"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomObjectRecordSchema = exports.CustomObjectDefinitionSchema = exports.CustomFieldValueSchema = exports.CustomFieldDefinitionSchema = exports.CustomFieldType = exports.PaymentSchema = exports.PaymentMethod = exports.InvoiceSchema = exports.InvoiceItemSchema = exports.InvoiceStatus = exports.BookingSchema = exports.BookingStatus = exports.ServiceSchema = exports.CustomerSchema = exports.SettingsSchema = void 0;
const zod_1 = require("zod");
// ==========================================
// Settings & Onboarding Schema
// ==========================================
exports.SettingsSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    businessName: zod_1.z.string().min(1, 'Business name is required'),
    logoUrl: zod_1.z.string().optional(), // Can store base64 string
    primaryColor: zod_1.z.string().regex(/^#([A-Fa-f0-9]{6})$/, 'Must be a valid hex color (e.g. #3b82f6)'),
    secondaryColor: zod_1.z.string().regex(/^#([A-Fa-f0-9]{6})$/, 'Must be a valid hex color'),
    accentColor: zod_1.z.string().regex(/^#([A-Fa-f0-9]{6})$/, 'Must be a valid hex color'),
    address: zod_1.z.string().min(1, 'Address is required'),
    phone: zod_1.z.string().min(1, 'Phone is required'),
    email: zod_1.z.string().email('Invalid email address'),
    website: zod_1.z.string().url('Invalid website URL').or(zod_1.z.literal('')),
    invoiceFooter: zod_1.z.string().optional(),
    defaultTaxRate: zod_1.z.number().min(0, 'Tax rate cannot be negative').default(0),
    currency: zod_1.z.string().min(1, 'Currency is required').default('USD'),
    timezone: zod_1.z.string().min(1, 'Time zone is required').default('UTC'),
    dateFormat: zod_1.z.string().min(1, 'Date format is required').default('YYYY-MM-DD'),
});
// ==========================================
// Customer Schema
// ==========================================
exports.CustomerSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    firstName: zod_1.z.string().min(1, 'First name is required'),
    lastName: zod_1.z.string().min(1, 'Last name is required'),
    company: zod_1.z.string().optional().or(zod_1.z.literal('')),
    email: zod_1.z.string().email('Invalid email address').or(zod_1.z.literal('')),
    phone: zod_1.z.string().optional().or(zod_1.z.literal('')),
    mobile: zod_1.z.string().optional().or(zod_1.z.literal('')),
    address: zod_1.z.string().optional().or(zod_1.z.literal('')),
    notes: zod_1.z.string().optional().or(zod_1.z.literal('')),
    tags: zod_1.z.array(zod_1.z.string()).default([]),
    createdAt: zod_1.z.string().optional(),
    updatedAt: zod_1.z.string().optional(),
});
// ==========================================
// Service Schema
// ==========================================
exports.ServiceSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    name: zod_1.z.string().min(1, 'Service name is required'),
    description: zod_1.z.string().optional().or(zod_1.z.literal('')),
    duration: zod_1.z.number().int().min(1, 'Duration must be at least 1 minute'),
    price: zod_1.z.number().int().min(0, 'Price cannot be negative'), // stored in cents
    taxRate: zod_1.z.number().min(0, 'Tax rate cannot be negative'),
    isActive: zod_1.z.boolean().default(true),
    createdAt: zod_1.z.string().optional(),
    updatedAt: zod_1.z.string().optional(),
});
// ==========================================
// Booking Schema
// ==========================================
exports.BookingStatus = zod_1.z.enum(['pending', 'confirmed', 'completed', 'cancelled']);
exports.BookingSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    customerId: zod_1.z.string().uuid('Customer is required'),
    serviceId: zod_1.z.string().uuid('Service is required'),
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
    time: zod_1.z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
    status: exports.BookingStatus.default('pending'),
    notes: zod_1.z.string().optional().or(zod_1.z.literal('')),
    createdAt: zod_1.z.string().optional(),
    updatedAt: zod_1.z.string().optional(),
});
// ==========================================
// Invoice & Items Schemas
// ==========================================
exports.InvoiceStatus = zod_1.z.enum(['draft', 'unpaid', 'paid', 'cancelled']);
exports.InvoiceItemSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    invoiceId: zod_1.z.string().uuid().optional(),
    serviceId: zod_1.z.string().uuid().optional().nullable(),
    name: zod_1.z.string().min(1, 'Item name is required'),
    quantity: zod_1.z.number().int().min(1, 'Quantity must be at least 1'),
    unitPrice: zod_1.z.number().int().min(0, 'Price cannot be negative'), // in cents
    taxRate: zod_1.z.number().min(0, 'Tax rate cannot be negative'),
});
exports.InvoiceSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    invoiceNumber: zod_1.z.string().optional(), // generated automatically
    customerId: zod_1.z.string().uuid('Customer is required'),
    bookingId: zod_1.z.string().uuid().optional().nullable(),
    status: exports.InvoiceStatus.default('unpaid'),
    notes: zod_1.z.string().optional().or(zod_1.z.literal('')),
    taxRate: zod_1.z.number().min(0).default(0), // snapshot default tax rate or custom
    discount: zod_1.z.number().int().min(0).default(0), // discount in cents
    items: zod_1.z.array(exports.InvoiceItemSchema).min(1, 'Invoice must have at least one item'),
    createdAt: zod_1.z.string().optional(),
    updatedAt: zod_1.z.string().optional(),
});
// ==========================================
// Payment Schema
// ==========================================
exports.PaymentMethod = zod_1.z.enum(['cash', 'card', 'bank_transfer', 'other']);
exports.PaymentSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    invoiceId: zod_1.z.string().uuid('Invoice ID is required'),
    amount: zod_1.z.number().int().min(1, 'Amount must be at least 1 cent'), // in cents
    paymentMethod: exports.PaymentMethod.default('cash'),
    paymentDate: zod_1.z.string().optional(), // defaults to now on backend
    notes: zod_1.z.string().optional().or(zod_1.z.literal('')),
    createdAt: zod_1.z.string().optional(),
});
// ==========================================
// Custom Fields Schema
// ==========================================
exports.CustomFieldType = zod_1.z.enum([
    'text', 'textarea', 'number', 'currency', 'percentage',
    'date', 'datetime', 'checkbox', 'dropdown', 'multi-select',
    'email', 'phone', 'url'
]);
exports.CustomFieldDefinitionSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    entityType: zod_1.z.string().min(1, 'Entity type is required'), // 'customer', 'booking', 'service', 'invoice' or custom object api name
    name: zod_1.z.string()
        .min(1, 'API Name is required')
        .regex(/^[a-z0-9_]+$/, 'API Name must contain only lowercase letters, numbers, and underscores'),
    label: zod_1.z.string().min(1, 'Label is required'),
    type: exports.CustomFieldType,
    options: zod_1.z.array(zod_1.z.string()).default([]), // For dropdown & multi-select
    required: zod_1.z.boolean().default(false),
    createdAt: zod_1.z.string().optional(),
});
exports.CustomFieldValueSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    entityId: zod_1.z.string().uuid('Entity ID is required'),
    fieldId: zod_1.z.string().uuid('Field ID is required'),
    value: zod_1.z.string(), // serialized value
    createdAt: zod_1.z.string().optional(),
    updatedAt: zod_1.z.string().optional(),
});
// ==========================================
// Custom Objects Schema (Salesforce-Style)
// ==========================================
exports.CustomObjectDefinitionSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    name: zod_1.z.string().min(1, 'Label name is required (e.g. Vehicle)'),
    apiName: zod_1.z.string()
        .min(1, 'API Name is required')
        .regex(/^[a-z0-9_]+$/, 'API Name must contain only lowercase letters, numbers, and underscores'),
    pluralName: zod_1.z.string().min(1, 'Plural label is required (e.g. Vehicles)'),
    description: zod_1.z.string().optional().or(zod_1.z.literal('')),
    createdAt: zod_1.z.string().optional(),
});
exports.CustomObjectRecordSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    objectDefinitionId: zod_1.z.string().uuid('Definition ID is required'),
    customerId: zod_1.z.string().uuid('Parent Customer ID is required'),
    createdAt: zod_1.z.string().optional(),
    updatedAt: zod_1.z.string().optional(),
    values: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(), // custom fields values mapped by field name/API name
});
