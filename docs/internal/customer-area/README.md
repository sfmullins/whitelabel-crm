---
title: Customer-area documentation source
slug: /internal/customer-area
status: internal-source
visibility: internal
last_reviewed: 2026-07-24
---

# Customer-area documentation source

This directory is the canonical source for implementation, provisioning and
operations content that may later be published in the authenticated customer
area, knowledge base or partner portal.

## Publication rules

- Treat every document in this directory as internal until it has passed a
  product, security and commercial review.
- Publish only the customer-safe content selected for a specific audience.
- Do not publish credentials, enrolment tokens, instance URLs, customer data,
  private signing material, internal incident records or infrastructure
  identifiers.
- Keep commands and product behaviour aligned with the repository's current
  release. Do not present planned WI13 functionality as generally available.
- Define pricing, service levels, support hours, data-processing terms and
  recovery objectives in the applicable customer agreement, not in technical
  documentation.

## Documents

| Document | Audience | Purpose |
|---|---|---|
| [Implementation and provisioning](./IMPLEMENTATION-AND-PROVISIONING.md) | Implementation partners, customer technical leads and service operators | Implement, provision, publish and operate a WhiteLabelCRM instance. |

## Source hierarchy

The customer-area documents explain supported procedures. When implementation
details change, update these documents in the same pull request as the code.
Repository contracts, tests and the following engineering documents remain the
technical source of truth:

- [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)
- [`../../QUALITY-GATES.md`](../../QUALITY-GATES.md)
- [`../../RELEASE-CHECKLIST.md`](../../RELEASE-CHECKLIST.md)
- [`../../onboarding/INSTANCE-ONBOARDING.md`](../../onboarding/INSTANCE-ONBOARDING.md)
- [`../../onboarding/DEPLOYMENT-PROFILES.md`](../../onboarding/DEPLOYMENT-PROFILES.md)
- [`../../onboarding/MANAGED-CLIENTS.md`](../../onboarding/MANAGED-CLIENTS.md)

