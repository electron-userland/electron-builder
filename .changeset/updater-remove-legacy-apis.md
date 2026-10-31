---
"electron-updater": major
---

feat(updater)!: remove the deprecated `UpdateCheckResult.versionInfo` (use `updateInfo`) and the protected `BaseUpdater.quitAndInstallCalled`; plain JavaScript code that still uses them gets `undefined` and a warning naming the replacement
