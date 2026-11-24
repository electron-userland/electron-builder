---
"electron-updater": patch
---

fix(updater): an update pending for the next launch is installed only when the cached file is the installer the target picks from the update info fetched on that launch (new protected `BaseUpdater.findUpdateFile`; a subclass that does not override it keeps matching any file of that update info by SHA-512), and is started with that update info's `isAdminRightsRequired`, as is a cached update that an update check reuses. A pending cache that marks the update per-machine still makes the automatic install at launch skip it without a request, and a deb, rpm, pacman or AppImage download whose update info has no file for the target fails with `ERR_UPDATER_UPDATE_FILE_NOT_FOUND` instead of a `TypeError`. See https://www.electron.build/docs/migration/v27-runtime-changes#downloaded-updates-are-checked-again-before-they-are-installed
