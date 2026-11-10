---
"app-builder-lib": patch
"builder-util": patch
---

fix(win): build-time Windows PowerShell, including the signature read-back of `forceCodeSigning` and the `publisherName` check, is always resolved through `toolsets.executables` (default: the in-box Windows PowerShell under `SystemRoot`), so a configured `toolsets.executables.powershell` is used without reading `SystemRoot`.
