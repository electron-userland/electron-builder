---
"app-builder-lib": patch
---

fix(nsis): the installer copies itself into `%LOCALAPPDATA%\<app>-updater` only when the app has an `app-update.yml`. Before, every install kept that copy, which only electron-updater reads (as the base for a differential download), so apps without an update configuration carried a second copy of their installer, and the uninstaller left it behind. After, those apps get no copy; apps with an update configuration keep it as before.
