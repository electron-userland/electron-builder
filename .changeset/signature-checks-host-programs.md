---
"app-builder-lib": patch
"builder-util": patch
"electron-builder": patch
---

fix: the signature checks of `forceCodeSigning` and `electron-builder verify` start `codesign`, `stapler`, `pkgutil` and Windows PowerShell by absolute path, from `toolsets.executables` (new keys `stapler`, located with `/usr/bin/xcrun --find stapler` by default, and `pkgutil`, `/usr/sbin/pkgutil` by default) or their default locations. Reading an Authenticode signature back starts PowerShell without the build's credential variables, and `electron-builder verify` reads an app's `app-update.yml` only as a file inside the app, reporting one that is a symlink out of the app, invalid YAML or not a mapping as a failed check.
