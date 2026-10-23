---
"electron-updater": patch
---

fix(updater): the asynchronous deb/rpm/pacman install passes the package-manager command to pkexec and sudo as an argv array, without a shell: the authentication dialog shows the command being authorized, the installer path is passed unescaped (paths containing a single quote are supported), the command is looked up in /usr/sbin, /usr/bin, /sbin and /bin rather than the caller's PATH, and Node's DEP0190 warning does not apply. gksudo, kdesudo and beesu take a single command string and keep the `/bin/bash -c` form
