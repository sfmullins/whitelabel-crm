---
title: WhiteLabelCRM implementation and provisioning
slug: /developer/implementation-and-provisioning
description: Implement, provision, publish and operate a WhiteLabelCRM business instance.
audience:
  - implementation-partner
  - customer-technical-lead
  - service-operator
status: draft
visibility: internal-source
product_area: deployment
last_reviewed: 2026-07-24
---

# WhiteLabelCRM implementation and provisioning

This guide covers the supported path from a clean repository checkout to a
published WhiteLabelCRM business instance. It is written for implementers,
customer technical leads and operators responsible for deployment, recovery
and employee rollout.

WhiteLabelCRM supports two deployment modes:

| Mode | Use when | Authoritative data | Important constraint |
|---|---|---|---|
| Managed | Multiple employees need shared records | One centrally operated backend and SQLite database | Employee clients require the managed service and do not contain an authoritative local database. |
| Standalone | One isolated machine owns the CRM | The machine's embedded backend and local SQLite database | Separate installations do not synchronise and must not be represented as a shared deployment. |

For a multi-user customer implementation, use managed mode. Copying a live
SQLite database to several employee machines creates divergent systems and is
not a supported deployment method.

## 1. Delivery boundary

The implemented service consists of:

- a React customer and onboarding interface;
- an Express API and application-service layer;
- an authoritative SQLite database;
- an encrypted credential vault outside SQLite;
- an Electron desktop shell for standalone or managed-client operation;
- versioned onboarding configuration and signed deployment profiles;
- hash-only, one-time employee enrolment and device registration;
- declarative, capability-controlled extensions.

Managed deployment is one authoritative application/database instance. It is
not an active-active or horizontally scaled SQLite cluster. Managed clients do
not support offline writes. Standalone installations do not synchronise.

Final Windows and container publication, release signing, SBOM publication,
provenance and installed-artifact certification remain WI13 work. Do not sell or
document those items as generally available until their release gates pass.

## 2. Responsibility model

Confirm the operating model before implementation. A typical division of
responsibility is:

| Area | Implementer or managed-service operator | Customer |
|---|---|---|
| Deployment design | Recommend and document the supported topology | Approve topology, users and business requirements |
| Infrastructure | Provision and secure the managed host, or prepare the standalone device | Supply approved domain, network and device access |
| Business configuration | Facilitate onboarding and validate configuration | Approve identity, terminology, workflow and publication |
| Identity and access | Configure roles, enrolment and device controls | Nominate owners and approve employee access |
| Backup and recovery | Operate, test and evidence the agreed controls | Approve retention and recovery objectives |
| Extensions | Validate compatibility and govern lifecycle | Approve required business capabilities |
| Updates | Test, schedule and apply supported releases | Approve maintenance windows |
| Incident handling | Diagnose within the contracted support boundary | Report incidents and preserve relevant evidence |

This table is an implementation baseline, not a service-level agreement.
Availability targets, support hours, retention, recovery objectives, security
responsibilities and data-processing terms must be agreed separately.

## 3. Prerequisites

Use the following supported toolchain:

- Node.js 22–24;
- npm 10–11;
- the repository lockfile;
- an operating environment suitable for the chosen topology;
- `dpkg` and `fakeroot` when producing Linux Debian packages.

For managed mode, also prepare:

- a stable HTTPS origin without embedded credentials or a URL fragment;
- TLS and DNS ownership;
- a server-owned runtime data directory with restricted permissions;
- a backup destination and documented restore procedure;
- the customer-approved default employee role;
- an operator responsible for migrations, backups and recovery tests.

Do not place passwords, tokens, private keys, cloud credentials or live
customer records in source control or a deployment profile.

## 4. Repository setup

Install exactly the dependency graph recorded in the lockfile:

```bash
npm ci
```

Build all workspaces:

```bash
npm run build
```

Run the full deterministic repository gate before using a candidate release:

```bash
npm run ci:verify
```

The gate covers workspace builds and tests, dependency and package governance,
database migration smoke, WI4–WI12 regression suites, onboarding publication,
managed-profile verification and Electron security checks.

For a production candidate, also run:

```bash
npm run audit:production
npm run desktop:package
```

On Linux, produce installers and portable artifacts with:

```bash
npm run desktop:make
```

Package output is written under `desktop/out/`. A locally successful build is
not a substitute for the repository CI and Linux packaging workflows.

## 5. Database initialization

Run migrations before seeding:

```bash
npm run db:migrate
```

Choose the seed mode that matches the purpose:

```bash
npm run db:seed:fresh
npm run db:seed:demo
npm run db:seed:published-fixture
```

- `db:seed:fresh` creates an empty CRM that requires onboarding.
- `db:seed:demo` adds demonstration records but still requires onboarding.
- `db:seed:published-fixture` is an active fixture for automation, not a
  customer provisioning shortcut.

The supported first-run path deliberately leaves a new instance in
`provisioning` until an authorised owner or administrator publishes it.

Existing installations are migrated into an initial published revision and
receive a cloned editable draft. Validate the migration and backup before
changing the active configuration.

## 6. Local implementation environment

Start the backend and frontend development servers:

```bash
npm run dev
```

The default development endpoints are:

- backend: `http://localhost:5000`;
- frontend: `http://localhost:3000`.

Frontend requests under `/api` and `/branding-assets` are proxied to the
backend. The frontend port is strict. If port 3000 is occupied, development
fails instead of silently changing origin. Set `CRM_FRONTEND_PORT` explicitly
when an alternate port is required.

The default environment is appropriate for implementation and verification. It
is not evidence that a managed production host has suitable TLS, monitoring,
backup, patching or access controls.

## 7. Instance lifecycle

An instance has three lifecycle states:

| State | Behaviour |
|---|---|
| `provisioning` | Authorised owners and administrators can use onboarding. Employees are blocked, and normal CRM APIs return `INSTANCE_ONBOARDING_REQUIRED`. |
| `active` | A signed publication exists and normal authorised access is available. |
| `suspended` | Normal access is blocked and APIs return `INSTANCE_SUSPENDED`. |

The lifecycle gate is authoritative. Do not attempt to bypass it with direct
navigation or by copying a database. Complete and publish onboarding.

## 8. Provision the instance

Open the onboarding workspace as an authorised owner or administrator.
Configuration saves as a versioned draft; it does not change the active
employee experience until publication.

Complete the sections in order:

| Section | Requirement | Completion outcome |
|---|---|---|
| Readiness | Required review | Shows blockers, warnings and the next section requiring attention. |
| Deployment | Required | Selects managed or standalone topology and records the managed HTTPS origin when applicable. |
| Business identity | Required | Records the approved legal, trading, support and privacy identity. |
| Brand studio | Required | Stores approved embedded logo assets and bounded accessible design tokens. |
| Locale | Required | Sets timezone, currency, language, date and time conventions. |
| Terminology | Optional | Changes presentation labels without changing stable API semantics. |
| People | Required | Establishes the owner, employee roles and operating ownership required for access control. |
| CRM model | Optional | Defines supported custom entities and fields where the standard model is insufficient. |
| Data import | Optional | Prepares approved source data for controlled migration. |
| Communications | Optional unless required by the service design | Configures supported channels and records connection-test evidence. |
| Extensions | Optional | Selects compatible installed extensions. Installation becomes available after the initial instance is published. |
| Security and recovery | Required | Confirms sessions, backup, encryption and recovery controls. |
| Employee rollout | Conditional | Configures default role, token lifetime and device rules for managed employee distribution. |
| Review and publish | Required | Presents the final approval, readiness evidence and publication action. |

Optional means that publication does not require the customer to configure that
business capability. It does not mean the platform's security or compatibility
checks can be ignored.

### Branding constraints

Branding accepts embedded PNG, JPEG and WebP logos within the configured size
limit. It uses bounded design tokens to preserve accessibility and supportable
runtime behaviour. Arbitrary CSS, JavaScript, HTML, remote fonts and executable
SVG are outside the branding model.

### CRM model constraints

Custom entities and fields must use supported declarative definitions. They do
not grant direct database access or arbitrary runtime code execution. Validate
the resulting model and import mapping against representative customer data
before publication.

### Extension constraints

Extensions are optional during initial provisioning. The initial instance must
be published before package installation is available. Installed extensions
remain declarative and capability controlled; they cannot execute arbitrary
JavaScript, SQL, shell commands or renderer bundles and receive no direct
database or credential access.

## 9. Drafts and configuration conflicts

Draft saves use a checksum to prevent silent overwrites.

When a save encounters a single-session checksum conflict, the client fetches
the latest workspace, reconciles the latest checksum and retries the unsaved
local draft once. A manual conflict is shown only when that retry also fails or
when genuine concurrent edits are detected.

If a manual conflict appears:

1. stop editing in all other sessions;
2. compare the current server draft with the unsaved local changes;
3. decide which values are authoritative;
4. apply the approved changes to the latest draft;
5. rerun readiness validation before publication.

Do not repeatedly force saves or edit the database directly. Those actions
defeat the concurrency control the checksum is intended to provide.

## 10. Validate readiness

Readiness checks have two severities:

- `required`: failure blocks publication;
- `recommended`: warning remains visible but does not block publication.

Mandatory controls include:

- a valid configuration contract;
- complete business identity;
- coherent deployment topology;
- a valid managed HTTPS origin;
- accessible primary branding colour;
- an active owner;
- a valid default employee role;
- viable managed backup and recovery configuration;
- compatible selected extensions;
- a deployment configuration free of secrets.

Run the focused verification commands before approval:

```bash
npm run onboarding:verify
npm run deployment:verify
npm run managed-client:smoke
npm run wi12:smoke
npm run wi12:stabilization
```

Resolve all required failures. Record the customer decision for any accepted
recommended warning.

## 11. Publish

Publication performs the following controlled sequence:

1. validate the complete configuration contract;
2. record machine-readable readiness evidence;
3. block unresolved required failures;
4. create a pre-publication backup;
5. serialize the deployment profile deterministically;
6. calculate its SHA-256 checksum;
7. sign it with the instance's Ed25519 private key held in the credential vault;
8. atomically activate the revision;
9. create a new editable draft cloned from the publication;
10. emit immutable audit and platform events.

If validation, backup, signing or database mutation fails, the previous
publication remains active.

After publication:

- confirm the instance lifecycle is `active`;
- sign in through the supported customer route;
- verify branding, locale, permissions and representative CRM operations;
- download and independently verify the deployment profile;
- retain the approval and validation evidence under the customer's change
  process.

## 12. Deployment profile

The signed deployment profile is the configuration handoff between onboarding
and employee distribution. It contains safe runtime identity and presentation
data, including:

- schema and configuration revision;
- instance ID;
- deployment mode and approved managed origin;
- business display identity;
- bounded branding;
- locale and terminology;
- capability identifiers;
- minimum client version;
- publication timestamp.

It must not contain:

- passwords, password hashes, sessions or API tokens;
- enrolment or OAuth tokens;
- backup passwords, encryption keys or cloud credentials;
- a private signing key;
- customer or employee business records;
- the live SQLite database.

The profile is signed with Ed25519 and checksummed with SHA-256. For managed
clients, the packaged profile is the trust anchor. A refreshed profile is
accepted only when its signature and checksum are valid, its instance ID,
public key and instance URL still match, its revision is not older, and its
minimum client version is supported.

The onboarding workspace downloads a `.crmdeploy.json` file. The supported
packaging location is:

```text
resources/deployment-profile.crmdeploy.json
```

For controlled development, `CRM_DEPLOYMENT_PROFILE` may point to an explicit
profile file. Missing, malformed or invalid explicit profiles fail closed.
Production managed clients require HTTPS. The
`CRM_ALLOW_INSECURE_MANAGED=true` override is limited to non-packaged,
controlled loopback testing.

## 13. Employee rollout

The recommended managed employee activation sequence is:

1. install the approved client;
2. verify the packaged profile;
3. enter a one-time enrolment token;
4. register the employee device;
5. exchange the token for a user-scoped session;
6. load the published instance.

An enrolment token is random, stored only as a SHA-256 hash with a non-secret
prefix, bound to one user and instance, expiring, device-limited and revocable.
The raw token is shown once. Transfer it through an approved secure channel.

Revoking a device conservatively revokes the user's active sessions. Managed
clients do not administer server backup or restore operations and do not hold
server administrator credentials.

Ordinary approved branding and terminology changes may be delivered through a
newer signed profile without a new installer. A new binary is required when the
published minimum client version exceeds the installed version or native
package assets change.

## 14. Backup, recovery and rollback

For managed mode, backup and recovery are central server responsibilities.
Before go-live:

- define retention and storage separation;
- protect backup credentials outside the database;
- test restoration into an isolated environment;
- record the achieved recovery point and recovery time;
- identify the person authorised to approve a restore;
- confirm monitoring and failure escalation.

Publication creates a pre-publication backup. That control does not replace a
scheduled, tested backup programme.

Rollback does not edit immutable publication history. The selected historical
configuration is copied into the current draft and published as a new signed
revision. Validate readiness and create the required backup before the rollback
publication.

Extension recovery is currently a full-database restore, not an isolated
reverse migration. Treat extension installation, upgrade and purge as governed
changes.

## 15. Operating runbook

At minimum, the service operator should maintain these controls:

| Frequency or trigger | Control |
|---|---|
| Every release | Run complete CI, production dependency audit and applicable packaging workflows against the exact candidate commit. |
| Before configuration publication | Review readiness evidence, customer approval, backup result and profile verification. |
| Scheduled | Verify backup completion, storage access and retention. |
| Periodic and after recovery changes | Perform an isolated restore exercise and record results. |
| Employee joiner, mover or leaver | Review role, issue or revoke enrolment, and revoke obsolete devices and sessions. |
| Extension change | Validate compatibility, permissions, backup and recovery path. |
| Security incident | Preserve request IDs and audit evidence, revoke affected credentials or sessions, and follow the contracted response procedure. |
| Customer change | Update the draft, obtain approval and create a new immutable publication. |

The exact frequency, ownership and escalation path must be set in the customer
operating agreement.

## 16. Troubleshooting

### `INSTANCE_ONBOARDING_REQUIRED`

The instance is still in `provisioning`. Sign in as an authorised owner or
administrator, complete required sections and publish. Employee navigation
cannot bypass the lifecycle gate.

### `INSTANCE_SUSPENDED`

The instance has been administratively suspended. Confirm the reason and the
authorised recovery procedure before changing lifecycle state.

### Draft conflict

Allow the automatic one-time reconciliation to complete. If a manual conflict
remains, stop concurrent editing and reconcile the unsaved changes against the
latest server draft as described in section 9.

### Development frontend does not start

Port 3000 is probably occupied. Stop the conflicting process or set
`CRM_FRONTEND_PORT` explicitly. Do not rely on an automatic port fallback,
because it would change the permitted origin.

### Migration or seed reports a missing table

Confirm dependencies are installed, build the shared workspace, run migrations,
then run the selected seed:

```bash
npm ci
npm run build -w shared
npm run db:migrate
npm run db:seed:fresh
```

### Managed client refuses a profile

Check the checksum, Ed25519 signature, trusted public key, instance ID, exact
HTTPS origin, configuration revision and minimum client version. Do not bypass
profile validation or silently replace the trust anchor.

### Linux packaging fails locally

Confirm `dpkg` and `fakeroot` are installed and rerun
`npm run desktop:make`. Review the Linux packaging workflow for the
authoritative clean-run result and artifact.

## 17. Go-live acceptance

Do not declare the implementation live until all applicable items are evidenced:

- the selected topology matches the customer's user and data-sharing needs;
- CI, production audit and required package workflows pass on the exact release
  commit;
- migrations complete against a tested backup and recovery plan;
- every required onboarding control passes;
- accepted recommended warnings have an owner and decision record;
- publication completes and the instance becomes `active`;
- the signed deployment profile verifies independently;
- representative customer workflows pass in the supported browser or client;
- roles, enrolment and device revocation are tested;
- backup restoration has been exercised;
- monitoring, support ownership and escalation are active;
- contractual service boundaries and data-processing responsibilities are
  approved.

## 18. Managed service catalogue boundary

The implementation supports a recurring managed-service offer around:

- implementation discovery and configuration;
- managed hosting and routine operations;
- backup monitoring and recovery exercises;
- release testing, updates and maintenance windows;
- employee access and device administration;
- extension compatibility and lifecycle governance;
- operational monitoring, evidence and support;
- periodic configuration and security review.

These are service possibilities, not automatic product entitlements. Each offer
must define its scope, exclusions, support channel, hours, response targets,
availability objective, backup retention, recovery objectives, change allowance,
security responsibilities, data location, subprocessors, exit process and
price. Avoid promising clustered availability, offline managed operation or
uncertified release formats that the current architecture does not provide.

## 19. Engineering references

- [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)
- [`../../QUALITY-GATES.md`](../../QUALITY-GATES.md)
- [`../../RELEASE-CHECKLIST.md`](../../RELEASE-CHECKLIST.md)
- [`../../onboarding/INSTANCE-ONBOARDING.md`](../../onboarding/INSTANCE-ONBOARDING.md)
- [`../../onboarding/DEPLOYMENT-PROFILES.md`](../../onboarding/DEPLOYMENT-PROFILES.md)
- [`../../onboarding/MANAGED-CLIENTS.md`](../../onboarding/MANAGED-CLIENTS.md)

