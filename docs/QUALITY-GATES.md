# Quality Gates

## Mandatory pull-request checks
- Clean dependency installation using the committed lockfile: `npm ci`.
- Shared, backend, and frontend build/type-check: `npm run build`.
- Backend and frontend tests: `npm test`.
- Licence-policy check covering direct third-party dependencies and devDependencies declared by the shared, backend, frontend, and desktop workspaces.
- Isolated migration smoke test: `npm run db:smoke`.
- Desktop packaging preflight: `npm run desktop:preflight`.
- Verify no generated runtime database, backup, build, packaging, log, or local environment artifacts are accidentally committed.

## Financial logic changes
- Add unit tests for calculations.
- Add repository or integration tests covering persisted values.
- Add state-transition tests for invoice/payment lifecycle changes.
- Confirm all amounts remain integer minor units/cents.

## Migration changes
- Test fresh-database migration.
- Test existing-database migration.
- Repeat migrations or run idempotence checks where applicable.
- Confirm a backup is created before destructive-risk operations.
- Verify record counts or integrity invariants after migration.

## Desktop changes
- Run a local package build.
- Run the packaged executable smoke test.
- Verify fresh-profile startup.
- Verify upgrade and restore checks where applicable.

The automated licence-policy check is not a complete transitive dependency legal audit; deeper transitive legal review remains a release-hardening concern.

The full packaged Electron launch smoke test remains a local/release gate until PR7 unless it can be made reliable in GitHub Actions without broad product changes. CI uses the deterministic desktop preflight instead of launching Electron.
