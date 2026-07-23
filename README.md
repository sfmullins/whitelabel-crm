# WhiteLabelCRM

WhiteLabelCRM is a privacy-oriented CRM and operations platform built with TypeScript, React, Express, SQLite and Electron. It supports a standalone local-first deployment and a managed employee-client deployment bound to one centrally operated business instance.

## Current product baseline

The application includes:

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
- versioned instance onboarding, readiness validation and signed deployment profiles;
- hash-only one-time employee enrolment and device registration;
- standalone and managed-client Electron runtime modes;
- Linux Debian and portable ZIP desktop packaging.

Managed deployment uses one authoritative backend and SQLite database. Standalone deployment is deliberately isolated. The product does not claim horizontal multi-writer, clustered-write or active-active SQLite operation.

## Repository structure

This is an npm workspace monorepo with four runtime packages and a deterministic verification layer:

| Path | Responsibility |
|---|---|
| `shared/` | Runtime contracts, DTOs and Zod validation shared across packages. |
| `backend/` | Express APIs, application services, repositories, SQLite persistence, migrations, integrations, schedulers, backups, reports, onboarding and extension lifecycle. |
| `frontend/` | React/Vite single-page application, onboarding workspace and generic extension runtime UI. |
| `desktop/` | Electron main/preload boundary, signed deployment-profile verification and Electron Forge packaging. |
| `scratch/` | Migration, packaging, work-item smoke and repository-governance checks. |
| `docs/` | Architecture, domain, onboarding, work-item and release-planning documentation. |

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

Start the built standalone Electron application:

```bash
npm run desktop:start
```

A controlled managed-client development run may point `CRM_DEPLOYMENT_PROFILE` to an explicit signed profile. HTTP managed origins require the separate non-packaged `CRM_ALLOW_INSECURE_MANAGED=true` test override.

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
- permanent WI4–WI12 regression smoke suites;
- onboarding publication, enrolment and managed-client profile verification;
- desktop packaging and security preflight.

Check production dependencies for high or critical advisories:

```bash
npm run audit:production
```

GitHub Actions also verifies that the repository remains clean after the build and produces a Linux Debian package through a separate packaging workflow.

## Instance onboarding

An authorised owner or administrator configures the business in the persistent onboarding workspace before employee distribution.

```text
Draft
→ preview
→ readiness validation
→ pre-publication backup
→ signed publication
→ employee enrolment or WI13 packaging
```

Required failures block publication. Recommended warnings remain visible without being disguised as failures.

Useful gates:

```bash
npm run onboarding:verify
npm run managed-client:smoke
npm run deployment:verify
npm run wi12:smoke
```

A configured live SQLite database must not be copied onto multiple employee machines. Shared employee access uses a managed deployment with one authoritative backend. The employee package contains a signed instance profile, not a live database or reusable administrator credential.

## Desktop packaging

Create an unpacked desktop package:

```bash
npm run desktop:package
```

Create current Linux installers and portable artifacts:

```bash
npm run desktop:make
```

Generated staging files and workspace tarballs are temporary and are not committed. Package outputs are written under `desktop/out/`.

Final profile-driven Windows, Linux and container publication, release signing, SBOM publication, provenance and installed-artifact certification are WI13 work.

## API, security and extension boundaries

Internal UI routes remain under `/api`. External integrations use the explicitly allow-listed `/api/v1` surface and authenticated scoped API tokens.

The request boundary provides identity resolution, permissions, ownership enforcement, rate limiting, origin controls, request IDs and immutable recursively redacted audit events. Credentials, signing material and webhook secrets are encrypted outside SQLite; SQLite retains operational metadata and non-secret references.

Published deployment profiles are deterministically serialized, SHA-256 checksummed and Ed25519 signed. Profiles contain no password, reusable session, API token, backup password, private key, cloud credential or live business database.

Extensions are declarative. Packages may contribute custom fields and entities, forms, views, navigation, bounded themes, supported reports, workflow templates, event subscriptions, localisation and verified static assets. Packages cannot execute JavaScript, SQL, shell commands or renderer bundles and do not receive database or credential access.

See:

- `docs/ARCHITECTURE.md`
- `docs/DOMAIN.md`
- `docs/work-items/WI10.md`
- `docs/work-items/WI11.md`
- `docs/work-items/WI12.md`
- `docs/onboarding/INSTANCE-ONBOARDING.md`
- `docs/onboarding/DEPLOYMENT-PROFILES.md`
- `docs/onboarding/MANAGED-CLIENTS.md`

## Delivery status and roadmap

Completed and merged:

- WI10 — Platform API, PR #13;
- WI11 — Extension Platform, PR #14;
- post-WI11 npm, package-boundary and staging hardening, PR #15;
- first full post-WI11 repository audit, PR #16;
- independent second audit and trust-boundary correction, PR #18.

Current:

- WI12 — Instance Onboarding, Provisioning and Deployment Profiles, PR #28.

Next:

- WI13 — Enterprise Packaging, Distribution and Release Certification.

The authoritative plan and current gates are maintained in `docs/WI10-WI12-IMPLEMENTATION-PLAN.md`, whose title now covers WI10–WI13.

## Current limitations

- Managed deployment remains a single authoritative application/database instance rather than a horizontally scaled SQLite cluster.
- Standalone installations remain independent and do not synchronise with one another.
- Some legacy booking, invoice and payment relationships still use the original customer model rather than the newer organisation model.
- Credit notes and some financial-lifecycle consolidation remain incomplete.
- The public API is intentionally narrower than the internal application API.
- Extension recovery is a full database restore, not an isolated reverse migration.
- Full browser and packaged-desktop E2E, WCAG certification, performance budgets, Windows/container publication and release provenance remain WI13 work.
