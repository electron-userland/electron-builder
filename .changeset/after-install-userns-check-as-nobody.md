---
"app-builder-lib": patch
---

fix(linux): run the deb, rpm and pacman after-install user namespace check as an unprivileged user. Before, the check ran as root, which is exempt from `kernel.unprivileged_userns_clone` and `kernel.apparmor_restrict_unprivileged_userns`, so it passed on systems where normal users can't create user namespaces; `chrome-sandbox` was left at `0755` and the app aborted with "The SUID sandbox helper binary was found, but is not configured correctly". After, the check runs through `setpriv` as uid/gid 65534 (`nobody`) and `chrome-sandbox` gets `4755` whenever the app itself can't create a user namespace. Without `setpriv` the check can't run unprivileged, so `chrome-sandbox` gets `4755`.
