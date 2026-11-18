---
"app-builder-lib": patch
---

fix(nsis): with `installerDebugLogging`, an update over an installed version installs: the uninstaller kept `install.log` open in the installation directory while an update moved that directory aside, so the update aborted (`Can't rename "…" to "…\old-install"`, exit code 2) once the installed version was built with the option, and an uninstall left the file behind. The uninstaller now logs to `%TEMP%\<app package name>-uninstall\install.log`
