---
"electron-updater": patch
---

fix(updater): the Linux install only elevates a bare command name found as an executable regular file in the system directories (`/usr/sbin`, `/usr/bin`, `/sbin`, `/bin`), symlinks included only when their target lies there too
