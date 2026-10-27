---
"electron-updater": patch
---

fix(updater): a failed `install()` or `installAsync()` no longer blocks every later install in the session: the next quit installs the update (on Linux deb/rpm/pacman, only a different update, so the dismissed authentication dialog is not shown again on quit), and the protected `quitAndInstallCalled` is deprecated
