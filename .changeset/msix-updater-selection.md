---
"electron-updater": major
---

feat(updater)!: in a Windows app with package identity (an installed AppX/MSIX package), `autoUpdater` is now an `MsixUpdater` (inactive unless the package was built with `msix.electronUpdaterAware`) instead of an `NsisUpdater`; construct `NsisUpdater` explicitly if a packaged app relied on it
