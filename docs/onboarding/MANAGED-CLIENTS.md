# Managed employee clients

## Purpose

A managed client is a branded Electron shell for employees of a configured business instance. It connects to one authoritative CRM deployment and deliberately does not create an authoritative local business database.

## Startup

1. Load the packaged deployment profile.
2. Validate schema and size limits.
3. Recalculate the deterministic SHA-256 checksum.
4. Verify the Ed25519 signature.
5. Verify the minimum client version.
6. Enforce HTTPS and reject embedded URL credentials or fragments.
7. Optionally request the current profile from the bound instance.
8. Accept the refresh only when instance ID, signing key and instance URL still match.
9. Load the exact approved instance origin.

Any bootstrap-profile validation failure prevents startup.

## Navigation boundary

The privileged renderer remains on the exact configured instance origin. Cross-origin or cross-port navigation is denied. Allow-listed `http`, `https` and `mailto` links may be delegated to the system handler; unsafe schemes and popups remain blocked.

## Local capabilities

Managed mode does not:

- open or migrate a local CRM database;
- start the embedded Express server;
- administer local backups or restores;
- store server administrator credentials;
- permit the renderer to access arbitrary files;
- silently change the bound instance URL.

Local Electron IPC remains restricted to the application data directory. Backup and restore pickers explicitly refuse managed-mode use because recovery belongs to the shared server.

## Employee enrolment

Recommended employee activation:

```text
Install client
→ verify packaged profile
→ enter one-time enrolment token
→ register device
→ receive user-scoped session
→ load published instance
```

An enrolment token is random, hash-only at rest, short-lived, user-bound, device-limited and revocable. Redeeming it creates a normal expiring session; it does not distribute an administrator credential.

Revoking a device revokes the user's current sessions as a conservative security action.

## Configuration updates

Ordinary approved branding and terminology changes do not require a new installer. The client may retrieve a newer signed profile from the bound server. A new binary is required when the published minimum client version exceeds the installed version or when WI13 changes native package assets.

## Offline behaviour

The bootstrap profile remains available when profile refresh fails, but the managed application still depends on its authoritative CRM server. WI12 does not claim offline write support or local conflict reconciliation for managed clients.

## Development override

A non-packaged development client may set:

```text
CRM_ALLOW_INSECURE_MANAGED=true
```

This permits an HTTP loopback profile for controlled testing. Packaged production clients do not use that override.
