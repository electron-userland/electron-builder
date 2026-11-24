---
"electron-updater": patch
---

fix(updater): hash the downloaded update again right before it is installed (on Linux a package replaced while the authentication prompt is shown is still installed), and verify an NSIS installer's signature again before `quitAndInstall()`, `installAsync()` or the install on launch starts it and before a cached installer is reused
