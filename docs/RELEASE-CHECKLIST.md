# Release Checklist

## Pull-request acceptance
- [ ] Purpose and scope are clear.
- [ ] Version and release-note impact considered.
- [ ] Clean checkout used where required.
- [ ] Dependency install completed.
- [ ] Build completed.
- [ ] Tests completed.
- [ ] Licence scan completed.
- [ ] Fresh migration smoke completed.
- [ ] Upgrade migration impact assessed.
- [ ] Known defects reviewed.
- [ ] No generated or sensitive artifacts committed.
- [ ] Human approval obtained.

## Release-candidate acceptance
- [ ] Version and release notes finalized.
- [ ] Clean checkout created.
- [ ] Dependency install completed with lockfile.
- [ ] Build completed.
- [ ] Tests completed.
- [ ] Licence scan completed.
- [ ] Fresh migration completed.
- [ ] Upgrade migration completed.
- [ ] Database backup created.
- [ ] Backup restore validated.
- [ ] SQLite integrity check returned `ok`.
- [ ] Desktop package generation completed.
- [ ] Fresh-profile launch completed.
- [ ] Invoice PDF generation validated.
- [ ] Golden workflow validation completed.
- [ ] Known defects reviewed.

## Production-release acceptance
- [ ] Final version and release notes approved.
- [ ] Checksums generated.
- [ ] Release artifacts attached.
- [ ] Backup and restore procedure documented.
- [ ] Known defects and rollback plan reviewed.
- [ ] Human approval recorded.
