---
"electron-updater": patch
---

fix(updater): install deb/rpm/pacman updates without freezing the app while the elevation dialog is open. `quitAndInstall()` and `installPendingUpdateIfAvailable()` now run the package manager asynchronously and quit once it finished; the commands, environment and elevation helper are unchanged, the on-quit install stays synchronous, and other platforms are unaffected
