# Domain Model

## Core and legacy records

- **Settings:** singleton business identity, theme colours, contact details, invoice footer, default tax rate, currency, timezone and date format.
- **Customers:** retained individual-first records used by legacy bookings, invoices and custom objects.
- **Services:** named offerings with duration, price and tax configuration.
- **Bookings:** appointments linking a legacy customer to a service.
- **Invoices and invoice items:** customer-linked billing headers and snapshotted line items.
- **Payments:** amounts recorded against invoices.
- **Custom fields and custom objects:** dynamic definitions and values. WI11 adds extension ownership, namespacing, visibility and non-destructive lifecycle controls while preserving the existing tables and values.

Legacy financial foreign keys remain intact. WI3 added deterministic customer-to-organisation/contact mapping rather than rewriting bookings, invoices or payments.

## Organisations, contacts and engagements

### Organisations

An organisation is a business account with status `prospect`, `active_client`, `past_client`, `partner` or `inactive`. Archival is soft. Archived organisations remain historical records, are excluded from ordinary lists and cannot receive new active child records. WI8–WI9 added nullable user/team ownership with deterministic owner backfill.

### Contacts

A contact belongs to exactly one organisation and cannot be moved by ordinary updates. Contact status is `active` or `inactive`. At least one of first name, last name or email must remain populated. Only one active, non-archived contact per organisation may be primary. Primary-contact promotion and demotion are transactional.

### Engagements

An engagement belongs to one organisation. Supported types are `diagnostic`, `sounding_board`, `guardrail`, `redesign`, `implementation` and `other`; statuses are `proposed`, `active`, `paused`, `completed` and `cancelled`.

Dates are real calendar dates in `YYYY-MM-DD` form. A referenced primary contact must belong to the same organisation and be active when assigned. WI8–WI9 added user/team ownership.

## Activities and legacy note migration

An activity is one interaction record with required organisation ownership, optional same-organisation contact and engagement links, a controlled type, trimmed body and author attribution, canonical event time, optional follow-up date, backend-owned source and source reference, and timestamp-based soft archive.

Historic combined `customers.notes` text remains preserved as source data. The idempotent WI3 backfill creates explicit mappings and imports recognised and malformed/unmatched text into independent activities without discarding content. A follow-up remains part of the activity history; completion does not archive the activity.

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

WIs 8–9 added users, teams, memberships, fixed system roles, explicit permission mappings, hash-only expiring/revocable sessions, user/team ownership and immutable audit events.

The local owner is a real user record. Loopback-trusted profile selection is limited to internal desktop routes and is not accepted as public-API authentication.

## Reporting

Implemented report keys are `executive`, `revenue`, `pipeline`, `activity`, `workload`, `concentration` and `operations`.

Saved reports and dashboards have user ownership and `private`, `team` or `all` visibility. Report schedules generate durable download artifacts. CSV exports use the same persisted reporting result and require `reports.export`.

WI11 report contributions reference one implemented report key, bounded default filters and optional presentation columns. Execution remains in `ReportingRepository`; extensions cannot provide SQL or a second reporting engine.

## WI10 platform records

### API tokens

An API token belongs to one active user and stores a non-secret name/display prefix, SHA-256 hash, explicit scope array and lifecycle timestamps. The plaintext token is returned once. Scopes cannot exceed the issuer’s permissions and are intersected with the owner’s current permissions at use.

### Platform events

A platform event is an immutable versioned integration record containing controlled type/version, aggregate reference, actor/API-token references, request ID, bounded safe JSON payload and creation timestamp.

Platform events are separate from audit events: audit records support accountability, while platform events support external delivery. Neither can be updated or deleted through SQLite.

### Webhook subscriptions and deliveries

A webhook subscription belongs to a user and stores its endpoint, selected event types, enabled/archive state and delivery health. The signing secret is encrypted outside SQLite through `CredentialVault`; SQLite stores only its credential key.

Each matching platform event creates one durable delivery row. Delivery status is `pending`, `succeeded`, `failed` or `dead`. HMAC-SHA256 signatures cover the timestamp and exact request body.

## WI11 extension records

### Extension

An extension is one installed package identity with:

- unique package key;
- current name, description and semantic version;
- `enabled`, `disabled` or `failed` status;
- system-managed flag;
- canonical manifest and SHA-256 checksum;
- `unsigned` or `verified` signature status;
- approved capabilities;
- installer and lifecycle timestamps.

The pre-WI11 customisation bridge is a system-managed extension and cannot be disabled or upgraded through the package API.

### Extension release

A release is an immutable installed package version associated with one extension. It stores its canonical manifest/checksum, signature status, `active`, `superseded` or `failed` status, optional pre-migration backup, installer and installation timestamp. Only one release is active after a successful install or upgrade.

### Contribution

A contribution is one declared item from a release: custom field/entity, form, view, navigation entry, theme, report, workflow template, event subscription, localisation dictionary or static asset metadata. Contributions are data, not executable code.

Disabling an extension marks active contributions unavailable without deleting them. Upgrade-retired custom definitions are recorded separately from temporary disable state so enable does not revive resources removed by a later release.

### Binding

A binding links an extension contribution to a concrete core resource such as a custom-field definition, custom-entity definition or explicitly instantiated workflow definition. Bindings prevent legacy APIs from deleting extension-owned definitions directly.

### Migration and install attempt

A declarative migration records each supported custom-field/entity upsert applied for a release. An install attempt records validation checksum, actor, backup, status and failure details. Failed attempts do not replace the prior active release.

### Asset

An extension asset record stores package/release ownership, asset key, relative path, media type, size and SHA-256 digest. File bytes live outside SQLite under the runtime data directory. They are verified during package validation and again before serving.

### Data action

An extension data action records an explicit `purge` or `restore` operation, actor, status, backup, bounded summary/failure details and timestamps. Disable does not purge data. Export, purge and restore are distinct operations.

## Search and workspace projections

- **Search document:** local derived projection indexed by SQLite FTS5; not a source of truth.
- **Saved view:** versioned and schema-validated filters, never executable SQL.
- **Unified timeline event:** typed projection of activities, engagements and mapped legacy operational/financial events.
- **Extension runtime registry:** derived read model of enabled active contributions; it is rebuilt from extension/release/contribution records and is not a separate source of truth.

## Known gaps

- Invoice states do not yet model a complete accounting lifecycle and there is no formal credit-note model.
- Some financial calculation/presentation responsibilities still require consolidation.
- Legacy customers remain the financial parent model.
- Extension forms/views use generic core renderers and cannot supply custom application components.
- Extension recovery restores a complete SQLite backup rather than applying a per-extension reverse migration.
- Horizontal multi-writer or active-active operation is not supported by the SQLite architecture.

Development data remains resettable before launch. Deterministic fixtures use Good Order Ltd and Acme Ltd and do not include invented personal contact data.
