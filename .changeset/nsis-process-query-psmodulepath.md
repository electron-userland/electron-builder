---
"app-builder-lib": patch
---

fix(nsis): the PowerShell commands of the installer's running-app check set PSModulePath to `$PSHOME\Modules` first, so `Get-CimInstance`, `Get-ExecutionPolicy` and `Stop-Process` are never auto-loaded from a module in a user-writable directory
