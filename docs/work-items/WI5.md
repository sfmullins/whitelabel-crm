# WI5 — Operational records foundation

WI5 establishes the shared local-first records used by tasks, reminders, documents, attachments, manual communications and constrained workflow execution.

## In scope

- versioned document metadata, safe local storage and polymorphic links;
- standalone tasks integrated with activity follow-ups in one work queue;
- reminder persistence and desktop/in-app delivery state;
- allow-listed workflow definitions, runs and action runs with idempotency;
- manual communication records for email, meeting, phone, SMS, WhatsApp, Teams, Slack and other channels;
- organisation workspace, search and timeline integration;
- deterministic Acme Ltd fixtures, tests, migration and smoke validation.

## Excluded

- external email/calendar synchronisation;
- outbound email;
- arbitrary code execution in workflows;
- OCR, e-signature or proprietary cloud storage.
