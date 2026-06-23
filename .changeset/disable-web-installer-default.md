---
"electron-updater": major
---

feat(updater): default `disableWebInstaller` to `true`

BREAKING CHANGE: `AppUpdater.disableWebInstaller` now defaults to `true`. NSIS web-installer packages are no longer loaded unless you opt in, because their payload is fetched from a manifest-supplied URL that may not undergo signature verification.

v27 ships a one-major-version grace period so existing deployments are not broken without warning:

- If you never set `disableWebInstaller` (the default) and a web-installer update is received, the updater logs a deprecation warning and still downloads it. In v28 this becomes an error and the download is blocked (`ERR_UPDATER_WEB_INSTALLER_DISABLED`).
- If you explicitly set `disableWebInstaller = true`, the download throws `ERR_UPDATER_WEB_INSTALLER_DISABLED` immediately.

If you intentionally publish and rely on an NSIS web installer, opt back in before v28 by setting `autoUpdater.disableWebInstaller = false` in your main process.
