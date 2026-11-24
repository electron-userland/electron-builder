---
"app-builder-lib": patch
---

fix: the build warning about a missing `autoUpdater.crossOriginHeaders` now also covers apps that bundle electron-updater into their own JavaScript, where only an assignment of the property counts
