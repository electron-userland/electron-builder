---
"electron-updater": minor
"app-builder-lib": patch
---

feat(electron-updater): elevate per-machine NSIS installs via PowerShell `Start-Process -Verb RunAs`, with `elevate.exe` as fallback

`NsisUpdater` now launches a per-machine (`isAdminRightsRequired`) installer through Windows PowerShell (absolute `System32` path, hardened `-EncodedCommand` invocation) instead of the bundled third-party `resources/elevate.exe`, and waits for the UAC prompt to be answered before the app quits. A declined prompt emits an `error` event (`ERR_UPDATER_ELEVATION_CANCELLED`) and leaves the update cached instead of silently doing nothing; if PowerShell is missing or blocked (e.g. AppLocker/WDAC), the updater falls back to `elevate.exe` exactly as before. The install-on-quit path stays fire-and-forget. `BaseUpdater.install()`/`doInstall()` may now return a `Promise<boolean>` for launches that have to be awaited. The `Start-Process` script/argument builders are exported from `electron-updater/src/windowsElevation` and the shared hardened PowerShell invocation from `electron-updater/src/windowsPowerShell`.

`app-builder-lib`: documents `win.packElevateHelper` as the fallback for electron-updater's elevation (still shipped and required where PowerShell is unavailable).
