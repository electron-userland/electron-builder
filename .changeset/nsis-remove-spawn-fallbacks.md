---
"electron-updater": major
---

feat(updater)!: an NSIS update installer that Windows refuses to start is not started again elevated (`UNKNOWN`) or opened with the shell (`ENOENT`); the install fails with `ERR_UPDATER_INSTALLER_START_FAILED`. `elevate.exe` (for `isAdminRightsRequired` and an `EACCES` retry) runs only when the current user cannot modify it, its folder or the install folder of the app, else `ERR_UPDATER_INSTALLER_ELEVATION_REFUSED`: install per-machine apps into a folder only administrators can write, e.g. with `nsis.perMachine: true`
