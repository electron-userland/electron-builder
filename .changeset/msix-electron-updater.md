---
"app-builder-lib": minor
"builder-util-runtime": minor
"electron-updater": minor
"electron-builder": patch
---

feat(msix): opt-in auto-update of MSIX packages with electron-updater (`msix.electronUpdaterAware`, beta): the build always produces the `.msixbundle` and writes `latest-msix.yml`, and the new `MsixUpdater` downloads it, verifies it against the signed update manifest, then hands it to Electron's native MSIX autoUpdater (Electron 39.5.2+, 40.2.1+, 41.0.0-alpha.6+); signed update manifests are required (`updateManifest: false` is rejected, and an install refuses a manifest no trusted key verified with `ERR_UPDATER_MSIX_MANIFEST_NOT_SIGNED`); every `.msixbundle` now carries its packages' 4-part version (makeappx `/bv`)
