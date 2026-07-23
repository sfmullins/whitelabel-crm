# Release certification record

Each candidate release stores machine-readable reports for build and unit tests, browser and desktop end-to-end tests, accessibility, performance, recovery, container checks, installed-artifact checks, SBOMs, checksums, provenance and secret scanning.

The final certification report records the exact commit, workflow run identities, supported platforms, signed/unsigned state, known limitations and every artifact SHA-256. A failed or skipped supported-platform gate prevents stable publication. Signing infrastructure that is not present is reported as unavailable; unsigned output is candidate-only and visibly labelled.
