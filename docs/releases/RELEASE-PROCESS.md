# Release process

1. Update the authoritative root version and keep all workspace versions aligned.
2. Run the complete PR certification matrix on the exact candidate commit.
3. Tag that commit `vX.Y.Z-rc.N`; candidate workflows produce prerelease artifacts and evidence.
4. Install and exercise every supported artifact in clean environments, including upgrade and recovery rehearsals.
5. Resolve blockers without creating a second WI13 pull request, then rerun the exact-head matrix.
6. Promote the exact certified commit with `vX.Y.Z`. Stable publication requires protected-environment approval and signing material supplied only through protected CI secrets.

A stable tag is rejected when it differs from the certified candidate source. Artifact names are immutable and include mode, version, architecture and package type.
