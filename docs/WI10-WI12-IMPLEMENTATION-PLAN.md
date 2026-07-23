# WI10–WI12 Implementation Plan

## 1. Current baseline

The sequential platform programme has completed WI10 and WI11:

- WI10 — Platform API was merged through PR #13 at `e10171356f582c8fc3c62771f804424adad7f028`;
- WI11 — Extension Platform was merged through PR #14 at `b9c579298a5ea168a2947c820613676ef08fe6e8`;
- post-WI11 npm/package-boundary and Electron staging hardening was merged through PR #15 at `e3175e8f8dd56372bc8af4eb4b2ed5e89620d28b`;
- the first full post-WI11 repository audit and release-baseline hardening was merged through PR #16 at `f6e66f3a1cde010aa8c360a682301b2ae970b173`.

PR #15 is a baseline correction, not an additional work item. It retained and reran the WI11 tests while making package exports, staging and source-hygiene controls deterministic.

The repository now has:

- users, teams, system roles and explicit permissions;
- expiring hash-only bearer sessions and loopback-trusted named local profiles;
- global `/api` authentication and permission enforcement;
- immutable redacted audit events with request IDs;
- ownership for organisations, engagements and tasks;
- deterministic reports, dashboards and permission-checked CSV exports;
- saved and scheduled reports with durable generated artifacts;
- readiness checks, security headers, controlled CORS and rate limiting;
- a versioned permission-aware public API with scoped API tokens;
- immutable platform events and signed retryable webhooks;
- a declarative extension registry, lifecycle and runtime;
- verified Linux Debian and portable ZIP packaging;
- transactional customer CSV import, encrypted backup portability and standards-based email/calendar synchronisation;
- permanent parser, package-boundary, production-dependency and work-item regression gates.

WIs 10–12 extend one coherent security, permission, audit, reporting, export, readiness, credential, backup and packaging architecture. Parallel systems are prohibited.

## 2. Programme corrections and standing constraints

1. **Sequential delivery remains mandatory.** WI12 starts from the fully audited post-WI11 `main` baseline.
2. **PRs #15 and #16 are baseline hardening and audit work.** They do not alter the WI10–WI12 work-item numbering.
3. **OAuth authorization-server scope remains deferred.** WhiteLabelCRM uses scoped API tokens and is not a general OAuth/OIDC provider.
4. **The public API never trusts loopback identity selection.** `/api/v1` requires a bearer session or scoped API token.
5. **The stable API surface is allow-listed.** Internal route reuse does not create accidental public contracts.
6. **Permission policy is explicit for platform and extension administration.**
7. **Existing report CSV export and `ReportingRepository` remain canonical.** Extensions may reference supported reports but cannot create another reporting engine.
8. **Generic bulk table mutation remains rejected.** Existing transactional import, backup and resource-specific operations remain authoritative.
9. **Existing communication synchronisation remains the connector baseline.**
10. **Linux packaging is an existing baseline.** WI12 certifies and releases it while adding Windows, container and remaining release-engineering work.
11. **Extensions are declarative.** No JavaScript, SQL, shell, renderer bundles or direct database access run from packages.
12. **SQLite deployment claims remain truthful.** WI12 may provide a single-replica reference but not horizontal multi-writer or active-active claims.
13. **Production dependency risk is a merge gate.** High or critical production advisories fail CI; build-only advisories require documented review and isolation.
14. **Supported runtime lines are explicit.** The repository declares supported Node/npm ranges and the Electron major must remain on a supported release line.

## 3. Delivery record and next work

| Work item | Branch | Base | Status / merge gate |
|---|---|---|---|
| WI10 — Platform API | `WI10-Platform-API` | merged WI8–WI9 `main` | merged via PR #13 |
| WI11 — Extension Platform | `WI11-Extension-Platform` | merged WI10 `main` | merged via PR #14; revalidated after PR #15 |
| Post-WI11 audit/hardening | audit branches | merged WI11 + PR #15 `main` | first full audit merged via PR #16; second independent pass in progress |
| WI12 — Enterprise Release | `WI12-Enterprise-Release` | audited post-WI11 `main` | not started; release certification required |

Feature work targets `main` directly through reviewable pull requests. WI12 must not be based on a stale pre-audit branch.

---

# WI10 — Platform API — Delivered

WI10 provides:

- `/api/v1` with an explicit path/method allowlist;
- scoped API tokens tied to existing active users and current permissions;
- authenticated OpenAPI 3.1 metadata;
- immutable versioned platform events;
- encrypted webhook secrets, HTTPS/SSRF controls, signed deliveries, bounded retries and dead-letter state;
- explicit platform permissions, diagnostics and permanent smoke coverage.

Detailed delivered scope is documented in `docs/work-items/WI10.md`.

---

# WI11 — Extension Platform — Delivered

WI11 provides an upgrade-safe declarative extension layer without editing core source.

Delivered contribution types:

- namespaced custom entities and fields;
- forms, views and navigation metadata;
- bounded theme packages;
- report definitions executed through the existing reporting model;
- workflow templates instantiated explicitly into disabled allow-listed workflows;
- event-subscription metadata;
- localisation dictionaries;
- verified static assets.

Delivered lifecycle controls:

- strict manifest/package validation;
- checksum and optional Ed25519 signature verification;
- application compatibility and explicit capability approval;
- verified pre-migration backups;
- transactional declarative schema updates;
- atomic verified asset publication;
- enable/disable without data loss;
- failed-install rollback preserving the prior active release;
- separate upgrade-retired and temporarily disabled resource states;
- metadata/history and extension-owned data exports;
- disabled-only exact-confirmation data purge with backup;
- exact-confirmation full-database recovery tooling;
- full audit and platform-event integration;
- administration and generic runtime UI;
- permanent WI11 tests and smoke verification.

The existing custom-field and custom-object data model is bridged into the extension registry and retained. Extension-owned definitions cannot be deleted directly through legacy routes.

Detailed delivered scope and exclusions are documented in `docs/work-items/WI11.md`.

## Permanent post-WI11 gate

The post-WI11 baseline is accepted only when the current head passes:

```text
npm ci
npm run build
npm run check:npm-hygiene
npm run audit:production
npm test
npm run db:smoke
npm run wi4:smoke
npm run wi5:smoke
npm run wi6:smoke
npm run wi7:smoke
npm run wi8-wi9:smoke
npm run wi10:smoke
npm run wi11:smoke
npm run desktop:preflight
```

The separate Linux workflow must build, verify and upload the Debian package. The repository must remain clean after verification, and there must be no unresolved review thread or known release-blocking defect.

---

# WI12 — Enterprise Release

## 4. Objective

Turn the completed product into a reproducible, installable and supportable release. WI12 is a certification and release-engineering work item, not another major domain expansion.

## 5. Entry conditions

WI12 may begin only when:

- WI10 and WI11 remain represented by permanent regression suites;
- the post-WI11 repository audit is merged;
- production dependency audit reports zero high or critical advisories;
- Node, npm, Electron, Vite, Vitest and database-tooling versions are explicitly supported and reproducible from the lockfile;
- Linux packaging succeeds from a clean checkout;
- current architecture, README, roadmap and work-item status documentation agree;
- all temporary audit workflows and artifacts have been removed from source control.

## 6. Required workstreams

### A. Critical-path certification

- browser and packaged-desktop end-to-end tests;
- first-run setup, login/profile selection, CRUD, search, task/reminder, report, extension and backup/restore journeys;
- upgrade, backup, restore and failed-migration rehearsal;
- explicit data-preservation and recovery acceptance evidence.

### B. Accessibility and performance

- WCAG 2.2 AA target for supported workflows;
- keyboard, focus, label, contrast and screen-reader verification;
- measured backend, frontend and packaged-desktop baselines;
- regression budgets for startup, key API operations, large lists and reports.

### C. Packaging and deployment

- certification of existing Linux Debian/ZIP artifacts;
- Windows installer and portable artifacts;
- optional macOS packaging only where suitable runners and signing exist;
- OCI container and Docker Compose reference deployment;
- truthful single-replica Kubernetes reference with persistent-storage limitations;
- platform-specific smoke tests against produced artifacts rather than source-only builds.

### D. Release integrity and operations

- semantic versioning and changelog policy;
- SBOM, third-party notices, checksums and provenance;
- release-candidate and stable release workflows;
- signed artifacts where practical;
- versioned user, administrator, API, extension, deployment and support documentation;
- support, backport, dependency-refresh and vulnerability-reporting policy;
- Dependabot triage and supported-runtime maintenance cadence.

### E. Product completion review

- UX consistency and error recovery;
- financial lifecycle review, including credit notes and legacy customer/organisation boundaries;
- public API compatibility review;
- extension install/upgrade/purge/recovery operator guidance;
- final scope exclusions and SQLite limitations stated in every deployment surface.

## 7. Required gates

```text
npm run ci:verify
npm run audit:production
npm run e2e
npm run accessibility:verify
npm run performance:verify
npm run release:verify
npm run container:verify
```

Add `npm run wi12:smoke` only for deterministic repository-level certification checks; platform-specific installer and packaged-application tests remain separate release jobs.

Coverage reporting may be added as an engineering signal, but arbitrary percentage thresholds must not replace critical-path and risk-based tests.

## 8. Programme completion

The programme is complete when:

1. supported external clients use a stable permission-aware API without database access;
2. extensions are declarative, capability-controlled and upgrade-safe;
3. the application can be installed, upgraded, backed up, restored and supported from reproducible release artifacts;
4. every claim about security, packaging, accessibility, performance and deployment is backed by an executable gate or explicit documented limitation;
5. supported dependency and runtime lines have a documented maintenance owner and update process.
