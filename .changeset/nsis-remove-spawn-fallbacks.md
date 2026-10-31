---
"electron-updater": major
---

feat(updater)!: an NSIS update installer that Windows refuses to start is not started again elevated (`UNKNOWN`) or opened with the shell (`ENOENT`); the install fails with `ERR_UPDATER_INSTALLER_START_FAILED`. `EACCES` is retried through `elevate.exe` only for an app installed under a Program Files folder, else `ERR_UPDATER_INSTALLER_ELEVATION_REFUSED`
