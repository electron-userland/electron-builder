---
"app-builder-lib": patch
---

Fix NSIS installer hang when the user's PowerShell profile contains interactive commands: run powershell.exe with -NoProfile -NonInteractive in allowOnlyOneInstallerInstance checks
