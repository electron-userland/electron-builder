---
"electron-updater": patch
---

fix(updater): install an update deferred with `quitAndInstall({ waitUntilNextLaunch: true })` at the next launch with any `autoInstallEvent` but `"manual"`, once the app's own `ready` handlers have run
