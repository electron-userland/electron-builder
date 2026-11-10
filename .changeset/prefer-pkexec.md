---
"electron-updater": patch
---

fix(updater): elevate Linux package installs with pkexec (polkit) whenever it is installed; gksudo and kdesudo, which are unmaintained, removed from Debian and Ubuntu and do not work under Wayland, are only used on systems without polkit, and the updater logs once when it skips one
