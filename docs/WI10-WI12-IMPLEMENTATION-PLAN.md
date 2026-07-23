# WI10–WI13 Implementation Plan

## 1. Current baseline

The sequential platform programme has completed WI10 and WI11:

- WI10 — Platform API was merged through PR #13 at `e10171356f582c8fc3c62771f804424adad7f028`;
- WI11 — Extension Platform was merged through PR #14 at `b9c579298a5ea168a2947c820613676ef08fe6e8`;
- post-WI11 npm/package-boundary and Electron staging hardening was merged through PR #15 at `e3175e8f8dd56372bc8af4eb4b2ed5e89620d28b`;
- the first post-WI11 repository audit was merged through PR #16 at `f6e66f3a1cde010aa8c360a682301b2ae970b173`;
- the independent second audit and trust-boundary correction pass was merged through PR #18 at `0092bb48a466bf6c57ec7772922dac4ea74ff375`.

PRs #15, #16 and #18 are baseline corrections. They do not alter work-item numbering.

The repository baseline includes:

- users, teams, roles and explicit permissions;
- expiring hash-only sessions and named local profiles;
- global API authentication and permission enforcement;
- immutable recursively redacted audit events;
- ownership for organisations, engagements and tasks;
- deterministic reports, dashboards and permission-checked exports;
- saved and scheduled reports;
- readiness checks, controlled origins, security headers and rate limiting;
- a stable permission-aware public API with scoped tokens;
- immutable platform events and signed retryable webhooks;
- a declarative extension registry, lifecycle and runtime;
- encrypted backup portability and communication synchronisation;
- verified Linux packaging;
- permanent parser, dependency, package-boundary, security and work-item regression gates.

WI12 and WI13 must extend these systems. Parallel authentication, permission, reporting, backup, extension, audit or configuration systems are prohibited.

## 2. Programme correction

Final packaging cannot precede business-instance onboarding.

WhiteLabelCRM is a white-label product. Each business must first configure, validate and publish its own instance. Employee clients then bind to that approved instance through a signed deployment profile.

A configured SQLite database must not be copied onto multiple employee machines as a substitute for shared deployment. That would create divergent authoritative databases and audit histories.

The remaining programme is therefore:

1. **WI12 — Instance Onboarding, Provisioning and Deployment Profiles**
2. **WI13 — Enterprise Packaging, Distribution and Release Certification**

## 3. Standing constraints

1. Sequential delivery remains mandatory.
2. WI12 starts from the fully audited post-WI11 `main` baseline.
3. WI13 starts only after WI12 is merged and revalidated.
4. OAuth authorization-server scope remains deferred; scoped API tokens remain authoritative.
5. `/api/v1` never trusts loopback identity selection.
6. The stable API remains explicitly allow-listed.
7. Existing reporting, transactional import, backup and communication systems remain canonical.
8. Extensions remain declarative; packages cannot execute JavaScript, SQL, shell code or renderer bundles.
9. Managed deployment means one authoritative backend and database.
10. Standalone deployment is deliberately isolated and must not be represented as shared multi-user operation.
11. SQLite active-active, horizontal multi-writer and clustered-write claims remain prohibited.
12. High or critical production dependency advisories fail CI.
13. Runtime and package versions must remain explicit and reproducible from the reviewed lockfile.
14. Employee packages must contain no reusable administrator credential, database encryption key, backup password, API token or live business database.

## 4. Delivery record

| Work item | Branch | Base | Status / merge gate |
|---|---|---|---|
| WI10 — Platform API | `WI10-Platform-API` | merged WI8–WI9 `main` | merged via PR #13 |
| WI11 — Extension Platform | `WI11-Extension-Platform` | merged WI10 `main` | merged via PR #14; revalidated after audit passes |
| Post-WI11 audit/hardening | audit branches | merged WI11 baseline | merged via PRs #15, #16 and #18 |
| WI12 — Instance Onboarding | `WI12-Instance-Onboarding` | audited post-WI11 `main` | implementation in PR #28; full regression gate required |
| WI13 — Enterprise Release | `WI13-Enterprise-Release` | merged WI12 `main` | not started; final release certification required |

Feature work reaches `main` only through reviewable pull requests.

---

# WI10 — Platform API — Delivered

WI10 provides:

- `/api/v1` with an explicit path/method allow-list;
- scoped API tokens tied to active users and current permissions;
- authenticated OpenAPI 3.1 metadata;
- immutable versioned platform events;
- encrypted webhook secrets, HTTPS/SSRF controls, signed deliveries, bounded retries and dead-letter state;
- explicit platform permissions, diagnostics and permanent smoke coverage.

Detailed scope is recorded in `docs/work-items/WI10.md`.

---

# WI11 — Extension Platform — Delivered

WI11 provides an upgrade-safe declarative extension layer without core-source forks.

Delivered contribution types include custom entities and fields, forms, views, navigation, bounded themes, supported reports, workflow templates, event metadata, localisation dictionaries and verified static assets.

Delivered lifecycle controls include strict validation, checksum and optional signature verification, capability approval, pre-migration backups, transactional schema changes, atomic asset publication, enable/disable without data loss, rollback, upgrade retirement, metadata/history, data export, exact-confirmation purge and recovery tooling.

Detailed scope is recorded in `docs/work-items/WI11.md`.

---

# WI12 — Instance Onboarding, Provisioning and Deployment Profiles

## Objective

Allow each business to configure, validate, preview and publish its WhiteLabelCRM instance before employee distribution or final packaging.

WI12 is a product-configuration and provisioning work item. It is not the final installer or release-certification phase.

## Required architecture

WI12 must provide:

- a stable instance identifier;
- a canonical structured configuration contract;
- draft, published, superseded and rollback-safe revision states;
- a persistent onboarding workspace;
- readiness validation with required failures and recommended warnings;
- business identity and bounded brand configuration;
- locale and business terminology;
- organisation structure and CRM operating defaults;
- communications and financial presentation settings;
- security and recovery confirmation;
- extension selection through the existing extension platform;
- employee enrolment and device registration;
- managed and standalone desktop modes;
- atomic publication after a pre-publication backup;
- deterministic, checksummed and Ed25519-signed deployment profiles;
- profile verification and instance binding in managed clients;
- migration of existing white-label settings;
- an explicit packaging handoff for WI13.

## Deployment topology

### Managed business instance

- one authoritative backend and database;
- employees connect through desktop clients or a supported browser;
- the managed client verifies the published profile;
- the client does not create another authoritative local business database;
- backup, migration and recovery are central responsibilities.

### Standalone instance

- embedded backend and local SQLite database;
- intentionally independent;
- suitable for a single operator or isolated installation;
- not presented as shared multi-user deployment.

## Deployment-profile boundary

A profile may contain instance identity, approved URL, business display identity, branding, locale, terminology, capabilities, minimum client version and publication metadata.

It must not contain:

- passwords or sessions;
- administrator or employee credentials;
- API or OAuth tokens;
- backup passwords;
- database or storage encryption keys;
- remote-storage secrets;
- private signing keys;
- a live CRM database.

## Permanent WI12 gates

```text
npm run onboarding:verify
npm run managed-client:smoke
npm run deployment:verify
npm run wi12:smoke
npm run ci:verify
```

Detailed scope, architecture and exclusions are recorded in `docs/work-items/WI12.md`.

## WI12 completion

WI12 is complete when:

1. a business can configure an instance without source or database editing;
2. draft changes do not affect the current published instance;
3. readiness failures block unsafe publication;
4. publication is backed up, atomic, signed and auditable;
5. employee clients verify and bind to one managed instance;
6. enrolment credentials are short-lived, hash-only, bounded and revocable;
7. legacy settings migrate without data loss;
8. the full WI4–WI12 regression suite and Linux packaging workflow pass on the exact PR head.

---

# WI13 — Enterprise Packaging, Distribution and Release Certification

## Objective

Consume a published WI12 deployment profile and turn the configured product into reproducible, installable, upgradeable and supportable release artifacts.

WI13 must not bypass the WI12 publication gate or embed production credentials and databases into employee artifacts.

## Required workstreams

### A. Critical-path certification

- browser and packaged-desktop end-to-end tests;
- first-run, authentication, CRUD, search, task, report, extension and recovery journeys;
- managed-client enrolment and profile-refresh journeys;
- upgrade, backup, restore and failed-migration rehearsal;
- explicit data-preservation evidence.

### B. Accessibility and performance

- WCAG 2.2 AA target for supported workflows;
- keyboard, focus, label, contrast and screen-reader verification;
- measured backend, frontend and packaged-desktop baselines;
- regression budgets for startup, key API operations, lists and reports.

### C. Packaging and deployment

- certification of Linux Debian and portable artifacts;
- Windows installer and portable artifacts;
- optional macOS packaging only where suitable signing infrastructure exists;
- OCI image and Docker Compose reference deployment;
- truthful single-replica Kubernetes reference where useful;
- platform-specific tests against produced artifacts.

### D. Release integrity and operations

- semantic versioning and changelog policy;
- SBOM, third-party notices, checksums and provenance;
- release-candidate and stable workflows;
- signed artifacts where practical;
- user, administrator, API, extension, deployment and support documentation;
- support, backport, dependency-refresh and vulnerability-reporting policy.

### E. Product-completion review

- UX consistency and error recovery;
- financial lifecycle review, including credit notes and legacy entity boundaries;
- public API compatibility review;
- extension operator guidance;
- final scope exclusions and SQLite limitations on every deployment surface.

## Required WI13 gates

```text
npm run ci:verify
npm run audit:production
npm run e2e
npm run accessibility:verify
npm run performance:verify
npm run release:verify
npm run container:verify
```

Platform-specific installer and packaged-application tests remain separate release jobs.

## Programme completion

The programme is complete when:

1. supported clients use a stable permission-aware API without direct database access;
2. extensions remain declarative, capability-controlled and upgrade-safe;
3. businesses publish signed instance configurations before distribution;
4. employees bind safely to the intended managed instance;
5. supported artifacts can be installed, upgraded, backed up, restored and supported reproducibly;
6. every claim about security, packaging, accessibility, performance and deployment has executable evidence or an explicit limitation;
7. supported dependency and runtime lines have a documented maintenance process.
