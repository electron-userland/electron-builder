---
"electron-updater": patch
---

fix: install Linux packages without freezing the app. Before, `LinuxUpdater` ran the package manager through `spawnSync`, so the main process was blocked for as long as the elevation dialog was open — while the user typed their password — and desktops reported the app as not responding. After, `quitAndInstall()` and `installPendingUpdateIfAvailable()` install through an asynchronous path and the app stays responsive; the command, the environment and the elevation helper are unchanged. The on-quit install keeps the synchronous path, which a quit handler cannot await, and other platforms are unaffected — `doInstallAsync` defaults to the existing synchronous `doInstall`. Each package manager now declares its commands once as an install plan, executed by both paths.
