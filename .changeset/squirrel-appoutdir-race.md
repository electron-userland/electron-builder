---
"app-builder-lib": patch
"electron-builder-squirrel-windows": patch
---

fix(squirrel): wait for the zip/7z targets of the same build to finish archiving the app directory before Squirrel.Windows writes its execution stub and re-signs the app exe in it
