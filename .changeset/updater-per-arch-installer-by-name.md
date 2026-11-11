---
"electron-updater": patch
---

fix(updater): pick the update file for the app's arch by name instead of by its position in the update manifest; when no file names the app's arch, prefer one that names no other arch. With `nsis.buildUniversalInstaller: false`, an x64 app no longer installs the ia32 or arm64 installer listed before its own, and an app built with `defaultArch` no longer installs another arch's installer
