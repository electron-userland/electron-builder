---
"electron-updater": patch
---

fix(updater): route all updater logging through a non-throwing logger (with an always-present `debug`), so a throwing logger or one without `debug()` cannot interrupt the update logic; `autoUpdater.logger` still returns the logger the app set
