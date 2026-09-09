---
"app-builder-lib": patch
---

fix(nsis): detect and close app instances running from the previous per-user/per-machine install location, not only the new `$INSTDIR`, so a `perMachine` install over a running per-user installation no longer fails. The path match now also requires a trailing backslash so sibling directories with the same prefix are no longer matched, and a failure to uninstall the previous version now reports the real uninstaller error instead of the misleading "cannot be closed" dialog.
