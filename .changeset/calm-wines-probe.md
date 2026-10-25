---
"app-builder-lib": patch
---

fix(nsis): treat PowerShell as available for the running-app check only when its capability probe returns the sentinel exit code 37, so Wine's (and CrossOver's) `powershell.exe` stub, which runs nothing and exits with 0, falls back to `tasklist` instead of reporting the app as running and looping on the "cannot be closed" dialog
