---
"electron-updater": patch
---

fix(updater): hash the downloaded update again right before it is installed, and verify an NSIS installer's signature again before `quitAndInstall()`, `installAsync()` or the install on launch starts it and before a cached installer is reused, and refuse to download an update file whose update info has no checksum (`ERR_UPDATER_NO_CHECKSUM`) with every provider, including GitLab, private GitHub and custom ones
