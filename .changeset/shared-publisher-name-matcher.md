---
"builder-util-runtime": patch
---

refactor(win): export the Windows Authenticode helpers electron-updater verifies update signatures with (`preparePowerShellExec`, `escapePowerShellSingleQuotes`, `parseAuthenticodeSignatureOutput`, `matchPublisherName`), moved unchanged from electron-updater so electron-builder can check signed installers with the same code
