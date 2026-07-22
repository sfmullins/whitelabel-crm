# WI8–WI9 Integrated Implementation Plan

## Objective

Deliver reporting and dashboards together with the multi-user, permissions, audit and production controls they depend on. Reporting must never bypass record access, exports must be auditable, and administration must remain compatible with the local-first Electron deployment.

## Delivery principles

1. **One security boundary** — API reads, writes, reports, dashboards and exports use the same request identity and permission checks.
2. **Local-first without security theatre** — loopback desktop use can establish a trusted local owner session; non-loopback access requires an authenticated session.
3. **Immutable accountability** — successful mutations and privileged reads create audit events that cannot be edited or deleted through SQLite.
4. **Deterministic reporting** — every KPI has an explicit query, period and grain. No simulated trends or invented values.
5. **Upgrade-safe schema** — the pass uses idempotent schema bootstrap and nullable ownership columns so existing prelaunch databases remain migratable.
6. **No new runtime service** — SQLite, Express, React and the existing Recharts dependency remain the operating platform.

## Workstreams

### 1. Identity, sessions and roles

- Users with active, invited and disabled states.
- Password credentials hashed with Node `scrypt` and per-user salts.
- Expiring bearer sessions stored as token hashes.
- System roles: Owner, Administrator, Manager, Member and Viewer.
- Explicit permission catalogue and role-permission mappings.
- Loopback-only trusted local user selection for the desktop app.
- User creation, status management, password reset and role assignment APIs.

### 2. Permission enforcement and ownership

- Request identity middleware for every `/api` request except authentication bootstrap/login.
- Route-level permission policy for CRM reads/writes, reporting, exports, settings, operations, users, roles and audit.
- Ownership fields for organisations, engagements and tasks.
- Owner backfill for existing records.
- Permission-aware administration and navigation.

### 3. Audit and production hardening

- Immutable audit event table with actor, request ID, route, method, entity, organisation and redacted metadata.
- Automatic audit capture for successful API mutations and privileged exports.
- Request IDs returned to clients and included in errors/audit records.
- Security headers, body limits and configurable in-memory API rate limiting.
- Readiness endpoint covering database integrity, migration state and writable runtime directories.
- Session expiry/revocation and disabled-user enforcement.
- Sensitive-field redaction for credentials, passwords, tokens and message bodies.

### 4. Reporting model

- Executive summary: clients, engagements, work, activities, collected revenue and outstanding invoices.
- Revenue series: monthly collected revenue, invoiced value and outstanding balance.
- Pipeline: organisations by lifecycle status and engagements by status/type.
- Activity: monthly activity volume and channel/type distribution.
- Workload: open/overdue tasks grouped by owner/assignee.
- Customer concentration: top organisations by collected revenue.
- Explicit date range filters with bounded maximum periods.
- CSV export generated from the same permission-checked report result.

### 5. Saved reports and dashboards

- Saved report definitions with owner, visibility, filters and report key.
- Dashboard definitions with owner, visibility, default state and ordered preset widgets.
- Preset widget catalogue backed by reporting queries.
- Create, edit, archive and set-default operations.
- Reporting workspace with KPI cards, charts, tables, saved reports and CSV export.

### 6. Administration UI

- Current-user identity and role display.
- User directory, role assignment, status changes and password reset.
- Role/permission matrix.
- Filterable audit log.
- Permission-aware navigation and disabled actions.

## Acceptance criteria

- Existing WI1–WI7 workflows continue to build and pass.
- A viewer can read CRM/report data but cannot mutate records or export.
- A member can mutate CRM records but cannot administer users or roles.
- An administrator can manage users and review audit events.
- Disabled or expired sessions are rejected.
- Report exports create audit events and contain only persisted values.
- Audit events cannot be updated or deleted.
- Existing records receive a valid owner without destructive migration.
- Dashboard/report definitions are user-owned and visibility constrained.
- `npm run ci:verify` and the dedicated WI8–WI9 smoke suite pass before merge.

## Implementation sequence

1. Schema, bootstrap data and ownership backfill.
2. Security repository, identity middleware and audit middleware.
3. Authentication and administration routes.
4. Reporting repository, report/dashboard routes and CSV export.
5. Frontend identity integration, reporting workspace and administration workspace.
6. Regression tests, smoke test, final diff review and merge gate.
