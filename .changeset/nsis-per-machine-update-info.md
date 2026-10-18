---
"app-builder-lib": major
---

feat!: electron-builder sets `isAdminRightsRequired` in the update info of every per-machine `nsis` and `nsis-web` build (`perMachine: true`), including assisted installers (`oneClick: false`) that don't set `packElevateHelper` and builds with `differentialPackage: false`, and writes it into the file entry of the installer for `nsis-web` builds too, so their updates are started with `elevate.exe` directly and, like other per-machine updates, are not installed automatically at launch with `autoInstallEvent: "onNextLaunch"` (call `installPendingUpdateIfAvailable()`)
