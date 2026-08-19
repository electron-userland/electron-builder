---
"electron-updater": patch
---

fix: prefer pkexec over gksudo and kdesudo when elevating a Linux install. Before, `determineSudoCommand` tried `gksudo` and `kdesudo` first, so a machine that still has either of them installed used it. Both are unmaintained and have been dropped from Debian (since Buster) and Ubuntu (since 18.04) — the Debian maintainers removed gksu as unsafe, upstream had stopped maintaining it, and neither works under Wayland. After, `pkexec` is tried first: it is the polkit-based mechanism those distributions point to, it works under Wayland, and it is the only supported helper that takes an argv array, so the authentication dialog shows the install command instead of a `/bin/bash -c '…'` wrapper and the installer path needs no shell escaping. gksudo, kdesudo and beesu remain as fallbacks for systems without polkit.
