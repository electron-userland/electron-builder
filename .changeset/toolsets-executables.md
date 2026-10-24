---
"app-builder-lib": patch
"builder-util": patch
"dmg-builder": patch
"electron-builder": patch
"electron-builder-squirrel-windows": patch
"electron-publish": patch
"electron-updater": patch
---

electron-builder starts the host programs it uses only from an absolute path, never by looking up a name on `PATH`: PowerShell, Wine, Mono (Squirrel.Windows on macOS and Linux), `prlctl`, `productbuild`, `pkgbuild`, `codesign`, `hdiutil`, `tiffutil`, `sips`, `actool`, `zip`, `notarytool` (passed to `@electron/notarize` as `notarytoolPath`, located with `/usr/bin/xcrun` by default), `lzip`, `snapcraft`, `flatpak` and `flatpak-builder`. Each comes from its default install locations or from the new `toolsets.executables` map, whose entries are `file://` URIs, or lists of them, that replace the defaults for that program. Child processes started without an explicit environment get no credential variables on Windows either, and `snapcraft upload` gets the store credentials but no other secret. The NSIS installer starts `tasklist` and `taskkill` from `$SYSDIR` (and passes the force flag in per-machine mode), the AppImage launcher runs the dialog tool it checked by its absolute path, and electron-updater on macOS starts `/usr/sbin/sysctl` and `/usr/bin/uname`.
