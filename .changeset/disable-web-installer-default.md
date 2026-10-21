---
"electron-updater": major
---

feat(updater): default `disableWebInstaller` to `true`

BREAKING CHANGE: `AppUpdater.disableWebInstaller` now defaults to `true`. NSIS web-installer packages are no longer loaded unless you opt in, because their payload is fetched from a manifest-supplied URL that may not undergo signature verification.

A web-installer update is rejected with `ERR_UPDATER_WEB_INSTALLER_DISABLED` unless `disableWebInstaller` is `false`. Installs made by an `nsis-web` installer built with electron-builder v27+ opt in automatically through the `resources/package-type` marker. If you publish and rely on an NSIS web installer for other installs, set `autoUpdater.disableWebInstaller = false` in your main process.
