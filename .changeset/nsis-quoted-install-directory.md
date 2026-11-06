---
"app-builder-lib": patch
---

fix(nsis): read a quoted `/D=` argument without its closing quote, so an electron-updater `installDirectory` containing a space no longer leaves a `"` in `$INSTDIR` and the uninstall registry entries (a quote already stored in `InstallLocation` or `UninstallString` is dropped on the next install, so the old version is still found and removed)
