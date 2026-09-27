---
"electron-updater": patch
---

fix: strip `PSModulePath` from the PowerShell child environment case-insensitively during Windows code-signature verification. Windows environment variable names are case-insensitive but JS object keys are not, so a differently-cased key (e.g. `PSMODULEPATH`) could previously survive into the spawned PowerShell process.
