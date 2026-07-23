# WhiteLabelCRM

WhiteLabelCRM is a local-first, privacy-oriented CRM and operations platform built with TypeScript, React, Express, SQLite and Electron. It is designed for white-label deployment without requiring a hosted database or a third-party workflow service.

## Current product baseline

The merged application includes:

- organisation, contact and engagement workspaces;
- unified activities, notes, follow-ups and timeline history;
- documents, tasks, reminders and operational queues;
- connected email and calendar accounts with explicit outbound actions;
- allow-listed workflow automation;
- invoicing, payments, services and bookings retained from the original CRM model;
- users, teams, roles, permissions, ownership and immutable audit records;
- deterministic reports, dashboards, exports and scheduled report artifacts;
- a scoped, versioned `/api/v1` platform API with API tokens and OpenAPI metadata;
- signed, durable webhook delivery;
- a capability-controlled declarative extension platform;
- Linux Debian and portable ZIP desktop packaging.

The application remains a single-instance, local-first SQLite system. It does not claim horizontal multi-writer or active-active operation.

## Repository structure

This is an npm workspace monorepo with four runtime packages and a deterministic verification layer:

| Path | Responsibility |
|---|---|
| `shared/` | Runtime contracts, DTOs and Zod validation shared across packages. |
| `backend/` | Express APIs, application services, repositories, SQLite persistence, migrations, integrations, schedulers, backups, reports and extension lifecycle. |
| `frontend/` | React/Vite single-page application and generic extension runtime UI. |
| `desktop/` | Electron main/preload boundary and Electron Forge packaging. |
| `scratch/` | Migration, packaging, work-item smoke and repository-governance checks. |
| `docs/` | Architecture, domain, work-item and release-planning documentation. |

The principal dependency direction is:

```text
React or external client
  -> Express route and security boundary
  -> application service / bounded runtime service
  -> repository
  -> SQLite, verified filesystem storage or standards-based adapter
```

The Electron renderer does not receive direct database, filesystem or credential access.

## Supported toolchain

- Node.js 22–24
- npm 10–11

Use the repository lockfile for reproducible installation:

```bash
npm ci
```

## Local development

Run database migrations and seed the development database:

```bash
npm run db:migrate
npm run db:seed
```

Start the backend and frontend development servers:

```bash
npm run dev
```

Default development endpoints:

- Backend: `http://localhost:5000`
- Frontend: `http://localhost:3000`
- Frontend requests under `/api` are proxied to the backend.

Start the built Electron application:

```bash
npm run desktop:start
```

## Build and verification

Build every workspace and regenerate the third-party licence inventory:

```bash
npm run build
```

Run the complete deterministic repository gate:

```bash
npm run ci:verify
```

That gate covers:

- TypeScript and production frontend builds;
- package declarations, workspace links, parser diagnostics and duplicate JSON keys;
- negative regression fixtures for the npm/source hygiene scanner;
- backend and frontend tests;
- isolated database migration smoke;
- permanent WI4–WI11 regression smoke suites;
- desktop packaging preflight.

Check production dependencies for high or critical advisories:

```bash
npm run audit:production
```

GitHub Actions also verifies that the repository remains clean after the build and produces a Linux Debian package through a separate packaging workflow.

## Desktop packaging

Create an unpacked desktop package:

```bash
npm run desktop:package
```

Create Linux installers and portable artifacts:

```bash
npm run desktop:make
```

Generated staging files and workspace tarballs are temporary and are not committed. Package outputs are written under `desktop/out/`.

## API, security and extension boundaries

Internal UI routes remain under `/api`. External integrations use the explicitly allow-listed `/api/v1` surface and authenticated scoped API tokens.

The request boundary provides identity resolution, permissions, ownership enforcement, rate limiting, origin controls, request IDs and immutable redacted audit events. Credentials and webhook secrets are encrypted outside SQLite; SQLite retains operational metadata and non-secret keys.

Extensions are declarative. Packages may contribute custom fields and entities, forms, views, navigation, bounded themes, supported reports, workflow templates, event subscriptions, localisation and verified static assets. Packages cannot execute JavaScript, SQL, shell commands or renderer bundles and do not receive database or credential access.

See:

- `docs/ARCHITECTURE.md`
- `docs/DOMAIN.md`
- `docs/work-items/WI10.md`
- `docs/work-items/WI11.md`

## Delivery status and roadmap

Completed and merged:

- WI10 — Platform API, PR #13;
- WI11 — Extension Platform, PR #14;
- post-WI11 npm, package-boundary and staging hardening, PR #15;
- first full post-WI11 repository audit and release-baseline hardening, PR #16.

The remaining programme is WI12 — Enterprise Release. Its scope is release certification rather than another broad domain expansion: end-to-end testing, accessibility, performance budgets, upgrade/restore rehearsal, Windows and container artifacts, release provenance, versioned operational documentation and support/security policy.

The authoritative plan and current entry gates are maintained in `docs/WI10-WI12-IMPLEMENTATION-PLAN.md`.

## Current limitations

- SQLite remains a local-first, single-instance datastore.
- Some legacy booking, invoice and payment relationships still use the original customer model rather than the newer organisation model.
- Credit notes and some financial-lifecycle consolidation remain incomplete.
- The public API is intentionally narrower than the internal application API.
- Extension recovery is a full database restore, not an isolated reverse migration.
- Full browser/packaged-desktop end-to-end, WCAG, performance, Windows, container and release certification remain WI12 work.
