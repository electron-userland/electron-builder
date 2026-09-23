---
"app-builder-lib": patch
---

fix(win): retry the spurious "The batch file cannot be found." cmd.exe race during dependency install (idempotent, win32-guarded — real install failures still fail fast)
