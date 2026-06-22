---
"electron-updater": major
---

feat(updater): default `disableWebInstaller` to `true`

BREAKING CHANGE: `AppUpdater.disableWebInstaller` now defaults to `true`. NSIS web-installer packages are no longer loaded unless you opt in, because their payload is fetched from a manifest-supplied URL that may not undergo signature verification. If you intentionally publish and rely on an NSIS web installer, set `disableWebInstaller: false` explicitly; otherwise the download throws `ERR_UPDATER_WEB_INSTALLER_DISABLED`.
