# Post-WI11 Repository Audit

## 1. Audit baseline

The audit was performed after:

- WI10 merged through PR #13 at `e10171356f582c8fc3c62771f804424adad7f028`;
- WI11 merged through PR #14 at `b9c579298a5ea168a2947c820613676ef08fe6e8`;
- post-WI11 npm/package-boundary and Electron staging hardening merged through PR #15 at `e3175e8f8dd56372bc8af4eb4b2ed5e89620d28b`.

PR #15 is treated as a baseline correction, not another work item. WI11 remains the completed extension-platform work item.

## 2. Scope and method

The review covered:

- npm workspace declarations, lockfile state and package output boundaries;
- production and complete dependency advisory reports;
- backend build, tests, migrations and WI4–WI11 smoke coverage;
- frontend build, test configuration and WI11 runtime behaviour;
- Electron version, staging, package preflight and Linux package creation;
- remote runtime assets and local-first/offline assumptions;
- CI failure diagnostics, clean-repository enforcement and dependency monitoring;
- README, architecture and WI10–WI12 roadmap accuracy;
- unresolved review threads, TODO/FIXME markers and obvious committed secrets.

The audit deliberately did not claim full release certification. End-to-end, accessibility, performance, Windows, container and release-provenance work remains WI12.

## 3. Findings and remediation

### A. Production dependency exposure — remediated

The original lockfile contained two high-severity production findings:

- `drizzle-orm` was below the patched identifier-handling release;
- the unused `xlsx` dependency had unresolved prototype-pollution and regular-expression denial-of-service advisories.

Remediation:

- upgraded `drizzle-orm` to the patched `0.45.2` line;
- upgraded the associated Drizzle/TSX/Vitest tooling required to validate that change;
- removed `xlsx` after repository search confirmed that no source code imported or used it;
- regenerated the npm lockfile from the updated manifests;
- added `npm run audit:production` and made high/critical production advisories a CI failure.

Result: the post-remediation production audit reports zero vulnerabilities.

### B. Unsupported desktop runtime — remediated

Electron 29 was outside the supported Electron major window.

Remediation:

- upgraded Electron to 43.2;
- upgraded Electron Forge packages to 7.11.2;
- retained a real Debian package build as the compatibility gate for the Electron/native-module transition;
- declared the supported Node/npm range, including the Node 22.12 minimum required by the updated Electron tooling.

### C. Frontend test suite could silently disappear — remediated

The frontend test command used `--passWithNoTests`, and the repository did not contain a discoverable frontend test file.

Remediation:

- removed the empty-suite exemption;
- extracted pure WI11 extension-runtime helpers;
- added tests for CSS token isolation, selected-theme/fallback behaviour and localisation fallback.

### D. Repository hygiene scanner had no negative regression fixtures — remediated

PR #15 introduced a strong parser/package scanner, but CI only exercised its successful path.

Remediation:

- added an isolated temporary-repository self-test proving that the scanner rejects:
  - malformed TypeScript;
  - duplicate JSON keys;
  - a bounded common misspelling;
  - tracked Electron staging output;
  - an invalid ESM/CommonJS package boundary.

### E. Packaged frontend contacted remote font infrastructure — remediated

The local-first frontend loaded Inter and Outfit from Google Fonts and referenced a missing Vite placeholder favicon.

Remediation:

- removed the external font/preconnect requests and placeholder favicon;
- retained system font fallbacks through Tailwind;
- extended desktop preflight to reject remote script, stylesheet, font or image subresources in the built frontend HTML.

### F. Repository and roadmap documentation was materially stale — remediated

The README described an early three-package/12-table prototype, listed the wrong frontend port and omitted WI10/WI11 capabilities. The roadmap still described PR #14 as awaiting review.

Remediation:

- rewrote the README around the current four-workspace architecture and verified commands;
- recorded PR #14 and PR #15 as merged;
- defined the audited post-WI11 baseline as the base for WI12;
- expanded WI12 into explicit entry conditions, workstreams and executable gates;
- updated the WI11 work-item record from “awaiting review” to delivered and permanently revalidated.

### G. Dependency maintenance was reactive — remediated

Remediation:

- added weekly Dependabot npm monitoring;
- grouped patch/minor production and development updates;
- added a supported runtime declaration;
- added a permanent production advisory gate with failure diagnostics.

## 4. Test decision

New tests were required, but a broad test rewrite was not.

Added now:

1. negative fixtures for the npm/source-hygiene scanner;
2. frontend WI11 runtime helper tests;
3. packaged-frontend remote-subresource rejection in desktop preflight.

Existing permanent coverage remains authoritative for:

- backend unit/integration behaviour;
- isolated migration execution;
- WI4–WI11 cross-work-item regression smokes;
- WI11 extension install, lifecycle, permission, runtime, workflow and data-management behaviour;
- desktop staging and Linux package creation.

Not added now:

- arbitrary percentage coverage thresholds;
- browser or packaged-desktop end-to-end tests;
- accessibility automation;
- performance budgets;
- Windows or container tests.

Those require the WI12 supported-workflow and release-artifact definitions. A percentage target without those definitions would create a misleading gate.

## 5. Residual risks and WI12 obligations

### Build-tool advisory chain

The complete npm audit still reports development/build-time findings rooted primarily in Electron Forge’s transitive `@electron/rebuild`/`@electron/node-gyp` extraction chain and Drizzle Kit’s deprecated loader chain. The current public package releases do not provide a clean compatible dependency graph, and attempted root overrides did not alter the resolved Forge graph.

These findings are not present in the production dependency set, but they affect the release build environment. WI12 must therefore:

- run packaging only in clean, ephemeral CI workers;
- retain lockfile integrity and trusted registry controls;
- continue tracking upstream Forge/rebuild and Drizzle Kit releases;
- replace or isolate the packaging/migration toolchain if patched upstream graphs do not become available;
- produce SBOM, provenance and checksums for released artifacts.

### Release-certification gaps

Still required in WI12:

- critical-path browser and packaged-desktop end-to-end tests;
- upgrade, failed-migration, backup and restore rehearsal;
- WCAG 2.2 AA verification;
- measured performance baselines and regression budgets;
- Windows installer/portable verification;
- OCI/Docker Compose and truthful single-replica deployment references;
- release versioning, changelog, SBOM, provenance and support/security policy.

### Product-model limitations

The known domain limitations remain:

- some booking, invoice and payment relationships still use the legacy customer model;
- credit-note and some financial-lifecycle consolidation is incomplete;
- extension recovery restores a full SQLite backup rather than reversing one extension in isolation;
- SQLite remains a local-first, single-instance datastore.

## 6. Permanent merge gates

The audited baseline must pass from a clean lockfile installation:

```text
npm ci
npm run build
npm run check:npm-hygiene
npm run audit:production
npm test
npm run db:smoke
npm run wi4:smoke
npm run wi5:smoke
npm run wi6:smoke
npm run wi7:smoke
npm run wi8-wi9:smoke
npm run wi10:smoke
npm run wi11:smoke
npm run desktop:preflight
```

A separate Linux workflow must also:

- build the desktop package;
- verify that a Debian artifact exists;
- upload the package artifact successfully.

The repository must remain unchanged after the deterministic CI sequence.

## 7. Audit conclusion

No WI11 rollback or redesign is required. The extension platform remains valid after the dependency, package-boundary, frontend and packaging review.

Once the exact audit head passes the permanent CI and Linux package workflows, the repository is suitable to become the WI12 base. WI12 should then focus on certification, release integrity and the explicitly recorded residual risks rather than reopening completed platform scope.
