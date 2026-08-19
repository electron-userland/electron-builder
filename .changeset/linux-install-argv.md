---
"electron-updater": patch
---

fix: show the install command in the Linux elevation dialog. Before, the privileged command was wrapped in `/bin/bash -c '…'`, so polkit displayed the wrapper rather than the command being authorized; the wrapper is also what forced the backslash-escaping of the installer path (paths containing a single quote were unsupported), and passing an args array with `shell: true` triggers Node's DEP0190 warning. After, the asynchronous install spawns the command with an argv array and no shell wherever the elevation helper accepts one — `pkexec` and `sudo` do, so the dialog reads `dpkg -i /path/app.deb` and the path is passed as-is. `gksudo`, `kdesudo` and `beesu` take a single command string and keep the wrapped form.
