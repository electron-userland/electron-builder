---
"electron-updater": patch
---

fix(updater): deb/rpm/pacman installs pass the package-manager command to pkexec and sudo as an argv array, without a shell, both for `quitAndInstall()` / `installPendingUpdateIfAvailable()` and for the install when the app quits (`autoInstallEvent: "onQuit"`): the authentication dialog shows the command being authorized, the installer path is passed unescaped (paths containing a single quote are supported), the command is looked up in /usr/sbin, /usr/bin, /sbin and /bin rather than the caller's PATH, and Node's DEP0190 warning does not apply. gksudo, kdesudo and beesu take a single command string and keep the `/bin/bash -c` form. A command killed by a signal during the install on quit is reported as a failure
