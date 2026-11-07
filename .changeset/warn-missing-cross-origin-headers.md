---
"app-builder-lib": patch
---

feat(publish): a build that writes `app-update.yml` for an app that ships an electron-updater requiring `autoUpdater.crossOriginHeaders` warns once when it finds no assignment to that property in the app's own JavaScript (app.asar, its unpacked files or the app directory; not `node_modules`, symlinks or files over 20 MB). Without it, electron-updater rejects every update check and download of the installed app with `ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED`. The check is a heuristic and never fails the build. See https://www.electron.build/docs/migration/v27-runtime-changes#cross-origin-headers
