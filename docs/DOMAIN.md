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

## Organisations, contacts and engagements

WhiteLabelCRM now models a first-class B2B consulting domain alongside the existing individual-first customer model.

### Organisations

An organisation represents a business account. Organisation status values are `prospect`, `active_client`, `past_client`, `partner`, and `inactive`. Optional descriptive fields such as legal name, website, industry, employee band, annual revenue band, country and source are nullable when absent. Organisation archival is soft: archived records keep their rows and timestamps, are excluded from normal lookups/lists, cannot be edited by ordinary update operations, and cannot receive new contacts or engagements.

### Contacts

A contact belongs to exactly one organisation and cannot be moved by ordinary updates. Contact status values are `active` and `inactive`. At least one of first name, last name or email must remain populated. Email addresses are optional, normalized to lowercase when present, indexed for lookup, and intentionally not unique.

Only one active, non-archived contact per organisation may be primary at a time. Assigning a primary contact clears other active organisation-level primaries in the same transaction. A contact cannot be primary while inactive or archived, and changing a primary contact to inactive or archiving it clears its primary flag without deleting the row.

### Engagements

An engagement belongs to exactly one organisation and cannot be moved by ordinary updates. Engagement type values are `diagnostic`, `sounding_board`, `guardrail`, `redesign`, `implementation`, and `other`. Engagement status values are `proposed`, `active`, `paused`, `completed`, and `cancelled`.

Engagement dates are date-only `YYYY-MM-DD` values. The start date is required, the end date is nullable, and the end date cannot precede the start date. Date validation checks real calendar validity rather than only string shape.

An engagement may optionally reference a primary contact. When assigned or changed, that contact must exist, belong to the same organisation, be active, and be non-archived. Later contact archival does not erase the historical engagement contact ID.

### Relationship with legacy customers and financial records

Legacy `customers` remain the appointment and financial customer model for bookings, invoices, custom object records and payments. There is deliberately no relationship in this PR between legacy customers and organisations, contacts or engagements. The system does not infer organisations from customer company names, convert customers into contacts, link invoices to organisations, or link bookings to engagements.

### Deletion and archival

The organisation/contact/engagement API exposes archive endpoints and no hard-delete endpoints. Foreign keys do not cascade-delete organisations, contacts or engagements; business records are preserved for future activity, notes and reporting work.
