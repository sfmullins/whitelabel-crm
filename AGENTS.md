# WhiteLabelCRM Agent Guide

## Purpose and architecture
WhiteLabelCRM is a local-first TypeScript npm monorepo for a white-label CRM with invoicing, bookings, custom fields, backup support, and an Electron desktop shell. The current stack is React/Vite in `frontend/`, Express with SQLite and Drizzle in `backend/`, shared TypeScript contracts in `shared/`, and Electron packaging in `desktop/`.

## Workspace responsibilities
- `shared/`: Shared TypeScript types and validation schemas consumed by frontend, backend, and desktop packaging.
- `backend/`: Express API, application/repository/database layering, SQLite/Drizzle schema and migrations, backup utilities, import utilities, and PDF generation.
- `frontend/`: React/Vite UI, API client calls to the Express backend, routing, pages, and UI components.
- `desktop/`: Electron main/preload process, Forge packaging configuration, and staging script for compiled backend, frontend, shared, and migration assets.

## Canonical commands
- Install: `npm ci` for clean validation; `npm install` only when intentionally updating dependencies.
- Develop web app: `npm run dev`.
- Build: `npm run build`.
- Test: `npm test`.
- Generate migrations: `npm run db:generate`.
- Apply normal configured migrations: `npm run db:migrate`.
- Isolated migration smoke test: `npm run db:smoke`.
- Desktop start: `npm run desktop:start`.
- Desktop package/make: `npm run desktop:package`, `npm run desktop:make`.
- Desktop headless preflight: `npm run desktop:preflight`.
- Full local/release desktop smoke: `npm run desktop:smoke`.
- Local PR verification after dependencies are installed: `npm run ci:verify`.

## Required validation before proposing a PR
Run and report the commands actually used and their results. At minimum for repository-level changes: `npm run build`, `npm test`, `npm run db:smoke`, `npm run desktop:preflight`, and `git status --short`. Use `npm ci` when validating from a clean checkout.

## Engineering rules
- TypeScript changes must remain type-safe and pass existing build/type checks.
- Financial amounts are integer minor units/cents.
- Financial calculations must have one canonical implementation rather than duplicated frontend, repository, and PDF logic.
- Database migrations must be additive, reversible through backup, and tested against an existing database.
- Never delete or overwrite a user database during tests or migrations.
- Use transactions for related financial writes.
- Do not silently mutate issued financial records.
- Avoid unrelated refactors and formatting-only churn.
- Prefer the smallest safe implementation that preserves current behaviour.

## Agent workflow
- Use one issue and one defined scope per branch.
- Read relevant code and tests before modifying anything.
- Add or update tests for changed behaviour.
- Run all required quality gates.
- Report commands actually run and their results.
- Do not merge the PR.

## PR body requirements
Include: Summary, files changed, validation performed, risks, deferred work, and any command not run with the reason.
