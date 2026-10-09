---
"electron-updater": patch
---

fix(updater): the warning about `disableWebInstaller` set to `false` for a full-installer update is logged only when the app set it; for the default of an install made by an nsis-web installer an info line says that web-installer updates need `disableWebInstaller = false` after that update
