# Domain Model

## Current implemented entities and relationships

- Settings: a singleton-style settings row stores business identity, theme colours, contact details, invoice footer, default tax rate, currency, timezone, and date format.
- Customers: individual-first records with first name, last name, optional company, email, phone/mobile, address, notes, tags, and timestamps.
- Services: named offerings with description, duration in minutes, price in cents, tax rate, active flag, and timestamps.
- Bookings: appointment records linking one customer to one service with date, time, status, notes, and timestamps.
- Invoices: invoice headers link to a customer and optionally a booking. They store invoice number, status, notes, snapshotted tax rate, discount in cents, and timestamps.
- Invoice items: invoice line items link to an invoice and optionally a service. They snapshot item name, quantity, unit price in cents, and tax rate.
- Payments: payment records link to invoices and store amount in cents, method, payment date, notes, and creation timestamp.
- Custom fields: field definitions describe fields for core entities or custom object API names. Values store serialized data by entity and field.
- Custom objects: custom object definitions describe Salesforce-style object types. Records link custom object instances to customers. Values link record fields to serialized values.
- Backups: backup management is infrastructure around the SQLite database and runtime paths rather than a primary Drizzle table in the current schema.

## Current relationship summary
Customers own bookings, invoices, and custom object records. Services can be referenced by bookings and invoice items. Invoices own invoice items and payments. Custom field definitions are reused by core entity values and custom object record values.

## Future work and known gaps
- Future work: Replace or extend the individual-first customer model with an organisation/contact model.
- Future work: Client notes are currently stored as combined customer text and parsed into timeline-style entries rather than being formal engagement or activity records.
- Future work: Invoice states are limited and do not model a complete accounting lifecycle.
- Future work: There is no formal credit-note model.
- Future work: Invoice calculations may be duplicated across frontend, repository, and PDF layers and should be centralized before behaviour changes.
- Future work: Currency presentation is not consistently enforced across all layers.
- Future work: The workflow is appointment-oriented and does not yet model B2B consulting engagements as first-class records.
