# Versioning and compatibility

The authoritative application version is the root `package.json` value. Every workspace package must match it and `npm run release:contract` enforces that rule.

WhiteLabelCRM uses semantic versioning. Major releases may break database, deployment-profile or public API contracts. Minor releases add backward-compatible capability. Patch releases contain backward-compatible fixes and dependency refreshes. Candidate builds use `X.Y.Z-rc.N` and identify their channel as `candidate`; stable builds cannot contain a prerelease suffix.

Compatibility is fail-closed. Clients reject profiles newer than the supported profile schema or requiring a newer client. Older applications refuse a newer unsupported database schema and direct the operator to restore a compatible backup. Extension and backup compatibility remain versioned independently and are declared in `release.config.json`.
