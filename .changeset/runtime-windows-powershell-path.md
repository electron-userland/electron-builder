---
"builder-util-runtime": minor
---

feat(win): export `windowsPowerShellPath()`, which returns the absolute path of the in-box Windows PowerShell (`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`) for runtime use such as electron-updater, and throws when `SystemRoot` is not a drive-absolute path. `preparePowerShellExec` and `prepareAuthenticodeSignatureExec` take an optional PowerShell path, used instead of `windowsPowerShellPath()` when given.
