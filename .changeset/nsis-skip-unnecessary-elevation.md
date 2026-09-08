---
"app-builder-lib": patch
---

fix(nsis): skip unnecessary UAC elevation on silent per-machine updates when the install directory and its registry bookkeeping are already writable. Before, every silent update of a `perMachine: false` install redirected outside its default per-user location (e.g. via `allowToChangeInstallationDirectory`) unconditionally re-elevated on every apply, driven only by the persisted `hasPerMachineInstallation` flag. After, the installer live-checks whether `$INSTDIR`, its `INSTALL_REGISTRY_KEY`, its `UNINSTALL_REGISTRY_KEY` (Programs and Features metadata), and the Start Menu/desktop shortcut locations are actually writable, and only elevates if at least one still requires it — letting an app whose `customInstall` hook has loosened its own install directory's ACL update silently without a UAC prompt on later updates.
