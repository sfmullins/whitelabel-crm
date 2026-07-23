# Deployment profiles

## Role

A deployment profile is the signed, versioned handoff between instance onboarding and employee distribution. It identifies the approved business instance without copying the live CRM database or reusable credentials.

## Envelope

```json
{
  "profile": {
    "schemaVersion": 1,
    "instanceId": "uuid",
    "configurationRevision": 4,
    "deploymentMode": "managed",
    "instanceUrl": "https://crm.example.ie",
    "businessIdentity": {},
    "branding": {},
    "locale": {},
    "terminology": {},
    "capabilities": [],
    "minimumClientVersion": "1.0.0",
    "publishedAt": "ISO-8601"
  },
  "checksum": "sha256",
  "signature": "base64",
  "publicKey": "base64 SPKI",
  "algorithm": "Ed25519"
}
```

The profile object is serialized deterministically before checksum and signature calculation.

## Trust model

Each CRM instance has an Ed25519 key pair. The private key is stored in the backend credential vault and never enters the profile, renderer, database or installer source.

The packaged profile acts as the managed client's trust anchor. A remote refresh is accepted only when:

- its checksum is valid;
- its Ed25519 signature is valid;
- its instance ID matches the bootstrap instance;
- its public key matches the bootstrap key;
- its instance URL is unchanged;
- its revision is not older than the bootstrap revision;
- its minimum client version is satisfied.

Key rotation requires a separately controlled trust-transition procedure. A remote response cannot silently replace the trust anchor.

## Secret exclusion

Profiles must never contain:

- passwords or password hashes;
- session or API tokens;
- employee enrolment tokens;
- OAuth client or refresh secrets;
- backup passwords or encryption keys;
- cloud-storage credentials;
- private signing keys;
- the live SQLite database;
- customer or employee business records.

The backend rejects credential-like configuration keys, and both backend and desktop verifiers perform recursive secret-bearing field checks.

## Managed profile

A managed profile contains an HTTPS instance URL. The employee client connects to that origin and does not start its embedded backend.

HTTP is accepted only through an explicit non-packaged development override. Production clients fail closed.

## Standalone profile

A standalone profile identifies an intentionally local deployment. It does not convert multiple desktop installations into one shared CRM. WI13 may use the profile to prepare a new configuration-only standalone image, but must not package a copy of a live operational database.

## Distribution

The onboarding workspace downloads a `.crmdeploy.json` file. WI13 packaging should place the verified profile at:

```text
resources/deployment-profile.crmdeploy.json
```

For controlled development, `CRM_DEPLOYMENT_PROFILE` may point to an explicit profile file. Missing, malformed or invalid explicit files are fatal rather than silently ignored.

## Verification

```bash
npm run deployment:verify
npm run managed-client:smoke
```
