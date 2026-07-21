# WI7 — Communications hub, outbound actions and automation hardening

WI7 completes the operational communications loop established by WI5 and WI6.

## In scope

- explicit-user-action SMTP compose, reply, reply-all and forward;
- local drafts, attachment selection and sent-message reconciliation;
- CalDAV create, update and cancellation with conflict-safe ETags;
- meeting preparation, completion and post-meeting work generation;
- consolidated communications hub and organisation-level communication context;
- declarative workflow management, templates, dry-runs and safe retries;
- recursion, cycle, timeout and run-limit protections;
- failed synchronization, reminder, workflow, document and search-index administration;
- stable adapter contracts for future SMS, WhatsApp, Teams, Slack and VoIP connectors;
- deterministic Acme Ltd fixtures, regression tests and full smoke validation.

## Safety constraints

- external email is never sent without an explicit user action;
- workflows may create drafts but may not transmit them;
- no arbitrary JavaScript, SQL or shell execution;
- no proprietary communication middleware is required;
- provider credentials remain encrypted outside SQLite.
