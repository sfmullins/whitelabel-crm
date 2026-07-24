# WI12 Stabilization — First-run lifecycle and development reliability

## Status

This correction pass is a release prerequisite. WI13 packaging and release certification remain paused until this work is merged and the exact merged head passes the repository gates.

## Evidence

The first manual development session exposed a systemic failure rather than isolated page defects:

- Vite silently moved from port 3000 to 3001;
- browser mutations retained the frontend `Origin` while the proxy rewrote the backend host;
- the backend rejected every captured write as `ORIGIN_FORBIDDEN`;
- the legacy settings row allowed the normal CRM shell to open while the authoritative WI12 instance remained `provisioning` with no published revision;
- draft logo data caused onboarding request and response bodies to exceed 400 KB;
- checksum concurrency controls existed in the backend but were not used by the active onboarding UI.

## Corrected contracts

### Development origin

The development frontend uses a deterministic port and a same-origin proxy:

- default frontend origin: `http://127.0.0.1:3000`;
- `strictPort` prevents silent fallback;
- `CRM_FRONTEND_PORT` may explicitly select an alternate port;
- the proxy preserves the browser host (`changeOrigin: false`);
- `/api` and immutable `/branding-assets` requests use the same proxy boundary;
- external, null, malformed and lookalike origins remain rejected.

### Instance lifecycle

`GET /api/onboarding/status` is the authoritative shell gate. Settings existence is not a lifecycle signal.

- `provisioning`: owners and administrators enter onboarding; employees see a blocked setup screen; ordinary CRM APIs return `INSTANCE_ONBOARDING_REQUIRED`;
- `active`: a published revision exists and normal CRM access is enabled;
- `suspended`: normal access returns `INSTANCE_SUSPENDED`.

The backend enforces the same lifecycle boundary so direct navigation or API calls cannot bypass the frontend shell.

### Development database modes

- `npm run db:seed:fresh` — empty CRM data and an unconfigured provisioning draft;
- `npm run db:seed:demo` — representative CRM fixtures and a provisioning draft for an end-to-end onboarding session;
- `npm run db:seed:published-fixture` — deterministic active fixture for automated regression tests only;
- `npm run db:seed` — alias of `db:seed:demo`.

Every reset removes publications, readiness runs, enrolments, devices, imports, signing material, documents and brand assets before recreating one lifecycle state.

### Draft persistence

The onboarding UI now:

- serializes saves and prevents overlapping writes;
- sends `expectedChecksum` for save, validation, publication and rollback;
- distinguishes unsaved, saving, saved, conflict and failed states;
- flushes pending edits before validation or publication;
- surfaces structured API status, error code and request ID;
- stores logos as validated content-addressed assets rather than base64 configuration values.

### Observability

Every request receives an `x-request-id`. Completion logs include status, duration, identity type, origin classification and rejection reason. Logs do not contain request bodies, credentials, tokens, enrolment codes, signatures or asset content.

## Verification

Run:

```bash
npm ci
npm run ci:verify
```

The permanent `wi12:stabilization` gate covers:

- lifecycle, seed-mode and brand-asset tests;
- origin-policy regressions;
- repository structure controls;
- an actual Vite proxy smoke on port 3000 and an explicitly configured alternate port;
- strict failure when port 3000 is occupied;
- successful checksum-backed onboarding mutation through the proxy;
- rejection of a hostile browser origin.

## Exit criteria

WI13 may restart only after:

1. PR CI passes on the exact final head.
2. `npm run db:seed:demo && npm run dev` opens onboarding on port 3000.
3. Onboarding publishes successfully and the active workspace survives restart.
4. A repeat manual HAR contains no unexpected 4xx/5xx responses or Vite `EPIPE` errors.
5. No temporary patch/export workflow remains in the repository.
