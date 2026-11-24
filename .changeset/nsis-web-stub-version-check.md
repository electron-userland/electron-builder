---
"app-builder-lib": major
"electron-updater": major
---

feat(nsis)!: an `nsis-web` installer started as an update (`--updated`) without `--package-file` aborts (exit code 2), electron-updater rejects a web-installer update without a package for the app's arch or `ia32` before downloading it (`ERR_UPDATER_NO_WEB_PACKAGE_FOR_ARCH`), and the NSIS updater installs an update whose manifest signature is not verified only when the ProductVersion of its installer is the update version (`ERR_UPDATER_INSTALLER_VERSION_MISMATCH`)
