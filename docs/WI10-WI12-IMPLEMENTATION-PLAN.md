# WI10–WI12 Implementation Plan

## 1. Current baseline

This programme now has two completed implementation branches:

- WI10 was merged through PR #13 at `e10171356f582c8fc3c62771f804424adad7f028`;
- WI11 is completed on `WI11-Extension-Platform` and is presented for final review through PR #14;
- WI12 must start only after WI11 is reviewed and merged.

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
- existing transactional customer CSV import, encrypted backup portability and standards-based email/calendar synchronisation.

WIs 10–12 extend one coherent security, permission, audit, reporting, export, readiness, credential, backup and packaging architecture. Parallel systems are prohibited.

## 2. Programme corrections

1. **Sequential delivery remains mandatory.** WI12 starts only after WI11 is reviewed and merged.
2. **OAuth authorization-server scope remains deferred.** WhiteLabelCRM uses scoped API tokens and is not a general OAuth/OIDC provider.
3. **The public API never trusts loopback identity selection.** `/api/v1` requires a bearer session or scoped API token.
4. **The stable API surface is allow-listed.** Internal route reuse does not create accidental public contracts.
5. **Permission policy is explicit for platform and extension administration.**
6. **Existing report CSV export and `ReportingRepository` remain canonical.** Extensions may reference supported reports but cannot create another reporting engine.
7. **Generic bulk table mutation remains rejected.** Existing transactional import, backup and resource-specific operations remain authoritative.
8. **Existing communication synchronisation remains the connector baseline.**
9. **Linux packaging is an existing baseline.** WI12 certifies and releases it while adding Windows, container and remaining release-engineering work.
10. **Extensions are declarative.** No JavaScript, SQL, shell, renderer bundles or direct database access run from packages.
11. **SQLite deployment claims remain truthful.** WI12 may provide a single-replica reference but not horizontal multi-writer or active-active claims.

## 3. Delivery policy

| Work item | Branch | Base | Status / merge gate |
|---|---|---|---|
| WI10 — Platform API | `WI10-Platform-API` | merged WI8–WI9 `main` | merged via PR #13 |
| WI11 — Extension Platform | `WI11-Extension-Platform` | merged WI10 `main` | implementation complete; full WI4–WI11 and Linux package verification green; PR #14 final review required |
| WI12 — Enterprise Release | `WI12-Enterprise-Release` | merged WI11 `main` | not started; release certification required |

Each pull request targets `main` directly. Stacked feature-branch PRs are prohibited.

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

## WI11 final merge gate

PR #14 is ready for review only when its final head has passed:

```text
npm run build
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

The separate Linux workflow must also build, verify and upload the Debian package. The branch must remain directly based on merged WI10 `main`, with no unresolved review threads or known release-blocking defects.

---

# WI12 — Enterprise Release

## 4. Objective

Turn the completed product into a reproducible, installable and supportable release. WI12 is a certification and release-engineering work item, not another major domain expansion.

## 5. Required workstreams

- browser and packaged-desktop critical-path end-to-end tests;
- upgrade, backup, restore and failed-migration rehearsal;
- WCAG 2.2 AA target for supported workflows;
- measured performance baselines and regression budgets;
- UX consistency, first-run setup and error recovery;
- Windows installer and portable artifacts;
- certification of existing Linux Debian/ZIP artifacts;
- optional macOS packaging only where suitable runners and signing exist;
- OCI container and Docker Compose reference deployment;
- truthful single-replica Kubernetes reference with persistent-storage limitations;
- versioned user, administrator, API, extension, deployment and support documentation;
- semantic versioning, changelog, SBOM, checksums and provenance;
- release-candidate and stable release workflows;
- support, backport and vulnerability-reporting policy.

SQLite limitations must remain explicit. WI12 does not claim horizontal multi-writer scaling, active-active operation or distributed high availability.

## 6. Required gates

```text
npm run ci:verify
npm run e2e
npm run accessibility:verify
npm run performance:verify
npm run release:verify
npm run container:verify
```

Add `npm run wi12:smoke` only for deterministic repository-level certification checks; platform-specific installer tests remain separate release jobs.

## 7. Programme completion

The programme is complete when:

1. supported external clients use a stable permission-aware API without database access;
2. extensions are declarative, capability-controlled and upgrade-safe;
3. the application can be installed, upgraded, backed up, restored and supported from reproducible release artifacts;
4. every claim about security, packaging, accessibility, performance and deployment is backed by an executable gate or explicit documented limitation.
