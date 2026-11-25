---
"electron-updater": major
---

feat(updater)!: when Windows refuses to start an NSIS update installer (`UNKNOWN`, `ENOENT`), the install fails with `ERR_UPDATER_INSTALLER_START_FAILED`; electron-updater neither starts the installer elevated nor opens it with the shell. `elevate.exe` (for `isAdminRightsRequired` and an `EACCES` retry) runs only when the current user cannot modify it, its folder or the install folder of the app; elsewhere the installer is started directly, which installs in an app that runs with administrator rights and fails with `ERR_UPDATER_INSTALLER_ELEVATION_REFUSED` in any other, so an update cannot switch an app installed per user to a per-machine build unless the app runs with administrator rights: install per-machine apps into a folder only administrators can write, e.g. with `nsis.perMachine: true`
