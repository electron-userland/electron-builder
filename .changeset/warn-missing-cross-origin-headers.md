---
"app-builder-lib": patch
---

feat(publish): a build that writes `app-update.yml` for an app that ships an electron-updater requiring `autoUpdater.crossOriginHeaders` warns once when no file of the app (app.asar, its unpacked files or the app directory; not `node_modules`, symlinks or files over 20 MB) contains the string `crossOriginHeaders`. Without the property, electron-updater rejects every update check and download of the installed app with `ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED`. An app that bundles electron-updater into its own JavaScript contains the string anyway, so the check stays quiet for it. The check never fails the build. See https://www.electron.build/docs/migration/v27-runtime-changes#cross-origin-headers
