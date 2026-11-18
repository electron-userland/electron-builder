---
"app-builder-lib": patch
---

fix(nsis): with `installerDebugLogging`, the installer writes `install.log` to the installation directory. It turned logging on in `.onInit`, before the installation directory is set, so a one-click install wrote no log (and an install with an unquoted `/D=` kept one open there, which stopped the previous version's uninstaller from moving the directory aside). Logging now starts once the previous version is uninstalled, before the files are installed
