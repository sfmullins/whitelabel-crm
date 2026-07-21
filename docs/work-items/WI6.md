# WI6 — Connected communications and deterministic automation

WI6 connects external email and calendar accounts to the shared WI5 communication, document, work and workflow domains.

## In scope

- encrypted local account credentials;
- incremental email and calendar synchronisation through standards-based adapters;
- email threads/messages and calendar/event projections;
- exact and suggested CRM matching with an explicit unmatched review queue;
- attachment ingestion into WI5 document storage;
- restart-safe reminder delivery and health reporting;
- event-driven allow-listed workflow triggers;
- integration health, sync cursor and retry diagnostics.

## Excluded

- outbound email transmission;
- remote calendar mutation;
- arbitrary workflow scripting;
- provider-specific proprietary middleware.

The database remains disposable prelaunch state; WI6 extends the baseline bootstrap and deterministic seed rather than introducing a compatibility migration.
