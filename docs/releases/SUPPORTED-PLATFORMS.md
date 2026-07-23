# Supported platforms

The initial certified desktop targets are Windows 11 x64, Ubuntu 24.04 LTS x64 and Debian 12 x64. Windows installer and portable packages and Linux Debian and portable packages are produced in managed and standalone variants. Arm64 is not supported until native dependencies and clean-runner certification pass.

The server container is a single-instance x64 OCI image. Persistent SQLite, backups and generated assets use explicit writable volumes. The image runs as a non-root user. Horizontal SQLite scaling, active-active writes and a generic “all Linux” claim are not supported.
