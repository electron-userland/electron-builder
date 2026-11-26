---
"electron-updater": patch
---

fix(updater): an update pending for the next launch is installed only when the cached file is the installer the target picks from the update info fetched on that launch (new protected `BaseUpdater.findUpdateFile`, which picks the first file unless a target overrides it; an updater subclass that downloads another file overrides it to return that file, and otherwise logs a warning and does not install the pending update), and is started with that update info's `isAdminRightsRequired`, as a cached update that an update check reuses is. A pending cache that marks the update per-machine makes the automatic install at launch skip it without a request, and a deb, rpm, pacman or AppImage download whose update info has no file for the target rejects with `ERR_UPDATER_UPDATE_FILE_NOT_FOUND`. See https://www.electron.build/docs/migration/v27-runtime-changes#downloaded-updates-are-checked-again-before-they-are-installed
