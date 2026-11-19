---
"app-builder-lib": patch
---

fix(nsis): with `installerDebugLogging`, an update over an installed version installs: the uninstaller kept `install.log` open in the installation directory while an update moved that directory aside, so the update aborted (`Can't rename "…" to "…\old-install"`, exit code 2) once the installed version was built with the option. The uninstaller now leaves its open `install.log` in place (it stays in the installation directory, which only admins can write for a per-machine install), which also covers an installer started with `/D=` that logs there
