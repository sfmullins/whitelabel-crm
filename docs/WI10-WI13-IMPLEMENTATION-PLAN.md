# WI10–WI13 Implementation Plan

## 1. Audited baseline

The sequential platform programme has completed and merged:

- WI10 — Platform API, PR #13;
- WI11 — Declarative Extension Platform, PR #14;
- post-WI11 package and staging correction, PR #15;
- first full repository audit, PR #16;
- second independent security, backup, trust-boundary and packaging audit, PR #18.

WI12 starts from the merged PR #18 baseline on `main`. It must preserve every permanent WI4–WI11 regression and both audit corrections.

## 2. Programme sequencing

| Work item | Purpose | Status |
|---|---|---|
| WI10 — Platform API | Stable permission-aware API, tokens, events and webhooks | Delivered |
| WI11 — Extension Platform | Declarative, capability-controlled extension lifecycle | Delivered |
| WI12 — Instance Onboarding | Configure, validate, publish and bind each business instance | In implementation |
| WI13 — Enterprise Release | Package, attest, distribute and certify published instances | Not started |

WI13 may not start from an unpublished draft configuration. Final business or employee artifacts must consume a signed WI12 deployment profile.

## 3. Standing constraints

1. Delivery remains sequential.
2. `main` is never used as an implementation branch.
3. Existing authentication, permission, audit, reporting, backup and extension systems remain canonical.
4. Extensions remain declarative and receive no SQL, shell, JavaScript, renderer or direct database execution.
5. Generic database mutation remains prohibited.
6. SQLite claims remain truthful: no active-active or horizontal multi-writer support.
7. Production high or critical dependency advisories remain merge blockers.
8. GitHub Actions remain pinned to immutable commit SHAs.
9. A live operational SQLite database must not be cloned across employee machines.
10. Credentials, private keys and reusable sessions must not be embedded in deployment profiles or installers.

---

# WI10 — Platform API — Delivered

Delivered:

- explicit `/api/v1` allowlist;
- scoped hash-only API tokens;
- authenticated OpenAPI 3.1 metadata;
- immutable platform events;
- signed retryable webhooks;
- HTTPS and SSRF protections;
- permission and diagnostic controls;
- permanent WI10 regression coverage.

See `docs/work-items/WI10.md`.

---

# WI11 — Extension Platform — Delivered

Delivered:

- namespaced custom fields and entities;
- forms, views and navigation metadata;
- bounded themes and localisation;
- supported report and workflow contributions;
- manifest, checksum and signature validation;
- capability approval;
- pre-migration backup;
- transactional install and upgrade;
- enable, disable, purge and full recovery controls;
- immutable audit and platform events;
- permanent WI11 regression coverage.

See `docs/work-items/WI11.md`.

---

# WI12 — Instance Onboarding, Provisioning and Deployment Profiles

## Objective

Allow each business to configure, preview, validate and publish its instance before final distribution.

WI12 introduces a canonical versioned configuration registry rather than extending the legacy settings form. The output is a signed, secret-free deployment profile that identifies the approved instance and acts as WI13's packaging input.

## Deployment modes

### Managed business instance

- one authoritative backend and database;
- multiple employees connect to the same data;
- desktop clients verify a signed profile;
- employee clients do not start local authoritative databases;
- backups, migrations and recovery remain central.

### Standalone local instance

- embedded backend and local SQLite database;
- intentionally isolated;
- suitable for one operator or a deliberately separate installation;
- not represented as shared multi-user operation.

## Required workstreams

### A. Configuration lifecycle

- canonical instance identity;
- draft, published, superseded and rollback history;
- autosave and resume;
- deterministic serialization and checksums;
- legacy settings migration;
- immutable publications;
- atomic publication and rollback.

### B. State-of-the-art onboarding experience

- readiness dashboard;
- deployment-topology guidance;
- business identity;
- branding studio and live preview;
- locale and business terminology;
- organisation structure and CRM operating model;
- communications and financial defaults;
- security and recovery controls;
- employee rollout;
- review and publication.

### C. Readiness and publication

- required versus recommended checks;
- actionable remediation;
- pre-publication backup;
- Ed25519 profile signing;
- profile checksum and schema version;
- platform and audit events;
- compatible rollback as a new publication.

### D. Employee provisioning

- one-time hash-only enrolment tokens;
- user and instance binding;
- expiry and device limits;
- device registration and revocation;
- user-scoped session exchange;
- no shared administrator credentials.

### E. Managed client

- packaged trust-anchor verification;
- exact instance ID and origin binding;
- HTTPS enforcement;
- minimum client version;
- remote profile refresh with downgrade and key-replacement rejection;
- no embedded backend or local authoritative database in managed mode;
- continued standalone support.

## WI12 gates

```text
npm run onboarding:verify
npm run managed-client:smoke
npm run deployment:verify
npm run wi12:smoke
npm run ci:verify
```

See:

- `docs/work-items/WI12.md`;
- `docs/onboarding/INSTANCE-ONBOARDING.md`;
- `docs/onboarding/DEPLOYMENT-PROFILES.md`;
- `docs/onboarding/MANAGED-CLIENTS.md`.

## Completion

WI12 is complete when:

1. a business can configure an instance without editing source or SQLite;
2. configuration can be saved, resumed, previewed and validated;
3. mandatory failures block publication;
4. publication is backed up, atomic, signed and audited;
5. a deployment profile contains no reusable credential or live business database;
6. managed employee clients bind to one authoritative instance;
7. enrolment and device revocation are tested;
8. all prior regression gates remain green.

---

# WI13 — Enterprise Packaging, Distribution and Release Certification

## Objective

Turn a published WI12 instance into reproducible, installable, supportable and attestable release artifacts.

WI13 is release engineering and certification. It must not reintroduce business configuration through installer-specific hacks.

## Entry conditions

WI13 begins only when:

- WI12 is merged;
- a deployment profile can be generated and independently verified;
- managed and standalone topology claims are documented and tested;
- employee enrolment and device revocation are operational;
- existing Linux packaging remains green;
- production audit reports no high or critical advisories;
- no unresolved WI12 release-blocking defect remains.

## Required workstreams

### A. End-to-end certification

- browser and packaged-desktop journeys;
- first launch and enrolment;
- CRUD, search, tasks, reports and extensions;
- upgrade, backup, restore and migration rehearsal;
- produced-artifact tests rather than source-only tests.

### B. Accessibility and performance

- WCAG 2.2 AA target for supported workflows;
- keyboard, screen-reader, contrast and focus verification;
- reference datasets;
- startup, API, search, list and report budgets.

### C. Packaging

- certify Debian and portable Linux artifacts;
- Windows installer and portable artifact;
- optional macOS packaging where signing infrastructure exists;
- OCI image and Docker Compose reference;
- truthful single-replica Kubernetes reference.

### D. Release integrity

- semantic versioning and changelog;
- checksums;
- CycloneDX or SPDX SBOM;
- third-party notices;
- provenance or attestation;
- signing where real signing infrastructure exists;
- release-candidate and stable workflows.

### E. Operations and support

- user, administrator, API, extension and deployment guides;
- support and backport policy;
- vulnerability reporting;
- dependency-refresh cadence;
- rollback and disaster-recovery guidance.

## WI13 gates

```text
npm run e2e
npm run accessibility:verify
npm run performance:verify
npm run release:verify
npm run container:verify
npm run wi13:smoke
```

## Programme completion

The programme is complete when a configured business instance can be published, packaged, installed, enrolled, upgraded, backed up, restored and supported from reproducible artifacts, with every material security, accessibility, performance and deployment claim backed by executable evidence or an explicit limitation.
