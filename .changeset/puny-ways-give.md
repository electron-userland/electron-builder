---
"electron-updater": patch
---

fix(updater): route all updater logging through a non-throwing logger (with an always-present `debug`), so a throwing logger or one without `debug()` cannot interrupt the update logic (exposed to subclasses as a protected `log` getter); `autoUpdater.logger` still returns the logger the app set
