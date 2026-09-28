---
"app-builder-lib": major
---

feat!: the nsis-web installer verifies and installs its own copy of a local app package. A package passed via `--package-file` (electron-updater does this for updates) or found next to the installer is first copied into the installer's own temporary directory; the checksum is computed on that copy and that copy is what is extracted. With `nsisWeb.allowUnverifiedAppPackage` a package passed via `--package-file` is still copied, but not verified. The local package file is now left in place (the installer's copy is moved into the app's update cache instead), and the installation is aborted (exit code `2`) if the file cannot be copied.
