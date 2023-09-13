---
"electron-updater": patch
---


fix: When error code is ENOENT, try to use electron.shell.openPath to run installer on Windows
