---
"app-builder-lib": minor
---

feat(win): harden Windows dependency install — route the package-manager `.cmd` shim through `powershell.exe -EncodedCommand` (matching node-module collection) instead of cross-spawn's `cmd.exe` wrapper, with a narrow win32-guarded retry for the residual spurious "The batch file cannot be found." race
