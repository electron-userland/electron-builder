---
"electron-updater": patch
---

fix(updater): hash the downloaded update again right before it is installed, and verify an NSIS installer's signature again before `quitAndInstall()` or the install on launch starts it and before a cached installer is reused
