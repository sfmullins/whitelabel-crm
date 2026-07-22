# Domain Model

## Core and legacy records

- **Settings:** singleton business identity, theme colours, contact details, invoice footer, default tax rate, currency, timezone and date format.
- **Customers:** retained individual-first records used by legacy bookings, invoices and custom objects.
- **Services:** named offerings with duration, price and tax configuration.
- **Bookings:** appointments linking a legacy customer to a service.
- **Invoices and invoice items:** customer-linked billing headers and snapshotted line items.
- **Payments:** amounts recorded against invoices.
- **Custom fields and custom objects:** existing dynamic definitions and values; extension-safe namespacing and lifecycle management remain WI11 work.

Legacy financial foreign keys remain intact. WI3 added deterministic customer-to-organisation/contact mapping rather than rewriting bookings, invoices or payments.

## Organisations, contacts and engagements

### Organisations

An organisation is a business account with status `prospect`, `active_client`, `past_client`, `partner` or `inactive`. Archival is soft. Archived organisations remain historical records, are excluded from ordinary lists and cannot receive new active child records.

WI8–WI9 added nullable user/team ownership with deterministic owner backfill for existing organisations.

### Contacts

A contact belongs to exactly one organisation and cannot be moved by ordinary updates. Contact status is `active` or `inactive`. At least one of first name, last name or email must remain populated.

Only one active, non-archived contact per organisation may be primary. Primary-contact promotion and demotion are transactional.

### Engagements

An engagement belongs to one organisation. Supported types are `diagnostic`, `sounding_board`, `guardrail`, `redesign`, `implementation` and `other`; statuses are `proposed`, `active`, `paused`, `completed` and `cancelled`.

Dates are real calendar dates in `YYYY-MM-DD` form. A referenced primary contact must belong to the same organisation and be active when assigned. WI8–WI9 added user/team ownership.

## Activities and legacy note migration

An activity is one interaction record with:

- required organisation ownership;
- optional same-organisation contact and engagement links;
- type `note`, `call`, `email`, `meeting`, `message` or `other`;
- trimmed body and author attribution;
- canonical event time and optional follow-up date;
- backend-owned source and source reference;
- timestamp-based soft archive.

Historic combined `customers.notes` text remains preserved as source data. The idempotent WI3 backfill creates explicit mappings and imports recognised and malformed/unmatched text into independent activities without discarding content.

A follow-up remains part of the activity history. Completion sets `follow_up_completed_at`; it does not archive or delete the activity.

## Work, documents and communications

WIs 5–7 added:

- standalone tasks and a work queue unified with activity follow-ups;
- persistent reminders and delivery state;
- versioned document metadata, safe local files, attachments and entity links;
- manual communications across supported channels;
- email threads/messages and calendar event projections;
- connected account, cursor, retry and reconciliation state;
- outbound journals for SMTP and remote calendar operations;
- constrained workflow definitions, runs and action runs.

Workflows use allow-listed triggers/actions, idempotency and bounded retries. They cannot execute arbitrary JavaScript, SQL or shell commands and cannot transmit an email without the existing explicit-send controls.

## Identity, ownership and audit

WIs 8–9 added:

- users with `active`, `invited` and `disabled` states;
- teams and memberships;
- system roles and explicit permission mappings;
- hash-only expiring/revocable sessions;
- user/team ownership for organisations, engagements and tasks;
- immutable audit events with actor, request, route, entity and redacted metadata.

The local owner is a real user record. Loopback-trusted profile selection is limited to internal desktop routes and is not accepted as public-API authentication.

## Reporting

Implemented report keys are:

- `executive`;
- `revenue`;
- `pipeline`;
- `activity`;
- `workload`;
- `concentration`;
- `operations`.

Saved reports and dashboards have user ownership and `private`, `team` or `all` visibility. Report schedules generate durable download artifacts. CSV exports use the same persisted reporting result and require `reports.export`.

## WI10 platform records

### API tokens

An API token belongs to one active user and stores:

- non-secret name and display prefix;
- SHA-256 token hash;
- explicit scope array;
- created, expiry, last-used and revocation timestamps.

The plaintext token is returned once. Scopes cannot exceed the issuer’s permissions at creation and are intersected with the owner’s current permissions at use. Disabling the owner invalidates the token.

### Platform events

A platform event is an immutable versioned integration record containing:

- controlled event type and version;
- aggregate type and optional aggregate ID;
- actor user and optional API-token references;
- request ID;
- bounded safe JSON payload;
- creation timestamp.

Platform events are separate from audit events: audit records support accountability, while platform events support external delivery. Neither can be updated or deleted through SQLite.

### Webhook subscriptions and deliveries

A webhook subscription belongs to a user and stores its endpoint, selected event types, enabled/archive state and delivery health. The signing secret is encrypted outside SQLite through `CredentialVault`; SQLite stores only its credential key.

Each matching platform event creates one durable delivery row. Delivery status is `pending`, `succeeded`, `failed` or `dead`. Attempts, next retry, response status and bounded errors are retained. HMAC-SHA256 signatures cover the timestamp and exact request body.

## Search and workspace projections

- **Search document:** local derived projection indexed by SQLite FTS5; not a source of truth.
- **Saved view:** versioned and schema-validated filters, never executable SQL.
- **Unified timeline event:** typed projection of activities, engagements and mapped legacy operational/financial events.

## Known gaps

- Invoice states do not yet model a complete accounting lifecycle and there is no formal credit-note model.
- Some financial calculation/presentation responsibilities still require consolidation.
- Legacy customers remain the financial parent model.
- Existing custom objects are customer-oriented and require WI11 extension-safe migration or compatibility treatment.
- Horizontal multi-writer or active-active operation is not supported by the SQLite architecture.

Development data remains resettable before launch. Deterministic fixtures use Good Order Ltd and Acme Ltd and do not include invented personal contact data.
