# Post-WI11 Repository Audit — Pass 2

Status: complete; merge remains gated on final exact-head CI and package verification.

This audit independently re-examined the repository state produced by merged PR #16. It did not assume that the prior audit narrative, green checks or roadmap were sufficient evidence. The review covered source-level trust boundaries, backup and restore handling, renderer/main-process separation, dependency resolution, workflow supply-chain controls, package construction, documentation and the full WI4–WI11 regression matrix.

## Result

WI11 remains structurally valid, but the merged post-WI11 baseline contained security and reproducibility defects that justified a corrective PR. No new product work item is introduced: this remains baseline hardening before WI12 certification.

## Findings and remediation

### Critical — backup paths were not confined to the backup directory

Restore and delete operations joined a route-controlled filename directly to the internal backup directory. Traversal sequences could resolve outside that directory, and lexical checks alone would not prevent an existing symlink escape.

Remediation:

- added a central backup-path policy;
- allowlisted `.db` and `.crmbackup` filenames;
- rejected separators, traversal and unsupported extensions;
- enforced lexical and real-path containment;
- applied the policy to restore and deletion operations.

Permanent tests cover valid paths, traversal attempts, Windows and POSIX separators, unsupported extensions and symlinks resolving outside the backup root.

### Critical — trusted-local authentication accepted unsafe browser origins

The API treated `Origin: null` as trusted, accepted loopback origins on a different port and exposed local-session routes before normal authentication. CORS alone is not a state-change protection boundary.

Remediation:

- added exact loopback-origin comparison against the active request protocol, host and port;
- rejected literal `Origin: null`, cross-port loopback origins and external browser origins before API processing;
- independently enforced the same rule on local-session and local-user discovery endpoints;
- retained originless local clients and the exact embedded application origin.

Live HTTP tests cover accepted same-origin and originless clients plus rejected null, cross-port and external origins.

### Critical — desktop IPC could open arbitrary filesystem paths

The renderer-exposed `openPath` handler accepted every absolute Unix path because any resolved absolute path starts with `/`. Navigation also checked only the hostname, not the exact embedded-server origin, and popup handling passed unvalidated schemes to the operating system.

Remediation:

- restricted filesystem IPC to the application data tree using real-path containment;
- rejected prefix collisions and symlink escapes;
- restricted privileged renderer navigation to the exact embedded-server origin;
- allowlisted only HTTP, HTTPS and mailto external targets;
- retained popup denial.

A desktop security smoke test covers containment, prefix collisions, symlink escapes, wrong ports, alternate loopback hostnames, file URLs and JavaScript URLs.

### Critical — backup credentials crossed unsafe persistence and audit boundaries

The Settings renderer persisted the backup password, S3 access key and S3 secret key in `localStorage`. Separately, the immutable audit redactor did not classify `encryptionKeyHex`, encryption passwords or access/private-key fields as sensitive, allowing backup secrets to enter audit metadata.

Remediation:

- removed secret reads and writes from renderer persistence;
- remove any legacy persisted secret values at startup;
- clear in-memory secret state after successful backup creation;
- expanded recursive audit redaction to encryption, access and private-key fields;
- added route-level validation for encryption material and bounded retention values.

Tests prevent secret `localStorage` persistence, verify recursive redaction and exercise a real backup request through the immutable audit path.

### High — password-derived backup encryption used a fast unsalted hash

The renderer converted a backup password directly with one SHA-256 operation. That is intentionally fast and provided neither a per-backup salt nor a password-specific work factor. The plaintext archive manifest was also outside AES-GCM authentication.

Remediation:

- introduced archive version 2;
- derive AES-256 keys with PBKDF2-HMAC-SHA256, a random 16-byte per-backup salt and 600,000 iterations;
- bound accepted KDF work factors during restore;
- authenticate the encoded manifest as AES-GCM additional authenticated data;
- validate key lengths, archive headers and bounded manifest lengths;
- keep version-1 archive decryption and legacy password derivation solely for existing-backup compatibility;
- moved password derivation into the local backend and removed renderer-side fast hashing.

Tests cover unique salts, the work factor, successful restore, wrong-password failure, manifest tamper failure and legacy version-1 archive compatibility.

### High — staged desktop dependencies could diverge from the reviewed lockfile

Electron staging generated a new package declaration and ran an unlocked `npm install --package-lock=false`. The first enforcement run correctly found six newer transitive packages than those recorded in the reviewed root lockfile and blocked the artifact.

Remediation:

- compare every staged installed `name@version` against versions represented by the root lockfile;
- include workspace packages in the comparison;
- fail package construction on any unreviewed version;
- refresh only the six observed drifted package entries in the reviewed lockfile;
- retain the real Debian build as the acceptance gate.

The stage-policy self-test covers workspace packages, matching transitive packages and rejected drift.

### High — workflow actions were referenced by mutable tags

Permanent CI and Linux packaging workflows used mutable major-version action tags.

Remediation:

- pinned checkout, setup-node and upload-artifact actions to full commit SHAs;
- added workflow hygiene that rejects mutable external action references and `pull_request_target`;
- removed obsolete WI4–WI7 branch-validation workflows that no longer represented the current branch model.

### Medium — local and hosted verification were not equivalent

The local `ci:verify` command omitted the production dependency audit enforced in hosted CI.

Remediation:

- added the production audit to local verification;
- added desktop security and staged-dependency policy checks to local and hosted verification.

### Medium — roadmap status lagged the merged repository

The roadmap recorded post-WI11 hardening only through PR #15 after PR #16 had already merged.

Remediation:

- recorded PR #16 as the first completed post-WI11 audit;
- clarified that PRs #15, #16 and this second pass are baseline hardening rather than new work-item numbers;
- retained WI12 as the next product/release work item.

## Permanent test additions

The second pass added or expanded:

- backup path and symlink-containment tests;
- backup route validation and immutable-audit secrecy tests;
- version-2 backup cryptography and version-1 compatibility tests;
- exact loopback-origin integration tests;
- desktop origin, external-URL and filesystem IPC tests;
- renderer credential-persistence regression checks;
- staged dependency-version policy tests;
- workflow action-pinning and obsolete-workflow checks.

## Required merge evidence

The final PR head must pass all of the following on a clean checkout:

- `npm ci`;
- every workspace build;
- parser, package, workflow and workspace hygiene;
- production dependency audit;
- backend and frontend tests, including all second-pass security tests;
- database migration smoke;
- WI4–WI7 regression smoke;
- WI8–WI10 regression smoke;
- WI11 extension lifecycle/runtime smoke;
- desktop offline/resource preflight;
- desktop security and staged-dependency policy checks;
- clean-repository verification;
- real Electron Linux package construction;
- Debian package inspection and artifact upload.

## Residual WI12 boundary

The following remain release-certification work rather than defects concealed by this audit:

- full browser and installed-desktop end-to-end suites;
- upgrade, failed-migration, backup and restore rehearsals using production-scale data;
- WCAG 2.2 AA certification;
- performance budgets and sustained-load baselines;
- Windows and container artifacts;
- SBOM, checksums, provenance, signing and release-channel controls;
- formal release, support and vulnerability-response policy;
- continued isolation and monitoring of build-only transitive advisories in Electron Forge and Drizzle Kit.

Legacy version-1 encrypted archives remain readable for compatibility, but their historical plaintext manifest was not authenticated. All newly created encrypted archives use the authenticated version-2 format.
