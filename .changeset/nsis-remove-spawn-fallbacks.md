---
"electron-updater": major
---

feat(updater)!: an NSIS update installer that Windows refuses to start is not started again elevated (`UNKNOWN`) or opened with the shell (`ENOENT`); the install fails with `ERR_UPDATER_INSTALLER_START_FAILED`. `elevate.exe` (for `isAdminRightsRequired` and an `EACCES` retry) runs only when the current user cannot modify it, its folder or the install folder of the app; elsewhere the installer is started directly, which installs in an app that runs with administrator rights and fails with `ERR_UPDATER_INSTALLER_ELEVATION_REFUSED` in any other, so an update cannot switch an app installed per user to a per-machine build: install per-machine apps into a folder only administrators can write, e.g. with `nsis.perMachine: true`
