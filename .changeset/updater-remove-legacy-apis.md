---
"electron-updater": major
---

feat(updater)!: `UpdateCheckResult.versionInfo` (read `updateInfo` instead) and the protected `BaseUpdater.quitAndInstallCalled` are removed; plain JavaScript code that uses them gets `undefined` and a warning naming the replacement
