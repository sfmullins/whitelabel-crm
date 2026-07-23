# Instance onboarding

## Purpose

Instance onboarding is the controlled business-configuration process that precedes employee distribution. It is not an employee first-run wizard.

An authorised owner or administrator uses the onboarding workspace to produce one approved business instance. Employees receive a client bound to the resulting signed deployment profile.

## Workflow

```text
Draft configuration
→ live preview
→ readiness validation
→ resolve mandatory failures
→ approval
→ pre-publication backup
→ signed publication
→ employee enrolment or WI13 packaging
```

Draft edits autosave. The active employee experience changes only after publication.

## Sections

1. **Readiness** — overall score, mandatory blockers and recommended warnings.
2. **Deployment** — managed shared instance or standalone local instance.
3. **Business identity** — legal, trading, support and privacy details.
4. **Brand studio** — embedded logo assets, bounded design tokens and live preview.
5. **Locale** — language, timezone, currency, date and time conventions.
6. **Terminology** — presentation labels without changing stable API semantics.
7. **Operating model** — teams, departments, queues, statuses and working defaults.
8. **Communications** — enabled channels, sender defaults and connection-test evidence.
9. **Security and recovery** — session, backup, encryption and recovery confirmations.
10. **Employee rollout** — default role, token lifetime and device registration.
11. **Review and publish** — final approval, signed profile and publication history.

## Managed versus standalone

Choose **managed** when multiple employees must work from the same CRM records. All clients use one authoritative backend and database.

Choose **standalone** only where one isolated machine is intended to own its own database. Installing the standalone package on several machines produces several separate CRMs; it does not create a shared deployment.

## Readiness policy

A readiness check has a stable ID and one of two severities:

- **required** — failure blocks publication;
- **recommended** — warning remains visible but does not block publication.

Current mandatory controls include:

- valid configuration contract;
- complete business identity;
- coherent deployment topology;
- valid managed HTTPS origin;
- accessible primary colour;
- active owner;
- valid default employee role;
- viable managed backup and recovery configuration;
- compatible selected extensions;
- secret-free deployment configuration.

## Branding assets

The onboarding interface accepts embedded PNG, JPEG and WebP logos up to the configured size limit. Arbitrary CSS, JavaScript, HTML, remote fonts and executable SVG content are not part of the branding model.

Branding is expressed through bounded tokens so accessibility, packaging and runtime behaviour remain supportable.

## Publication behaviour

Publication is atomic. If validation, backup, signing or database mutation fails, the prior publication remains active.

A successful publication creates a fresh draft cloned from the published configuration, allowing future changes without editing immutable history.

## Rollback

Rollback never edits an old publication. The selected historical configuration is copied into the current draft and published as a new signed revision. This preserves a complete chronological audit trail.
