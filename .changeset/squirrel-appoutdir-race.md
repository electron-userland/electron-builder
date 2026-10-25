---
"app-builder-lib": patch
"electron-builder-squirrel-windows": patch
---

fix(squirrel): wait for the zip/7z archive of the same app directory (whatever its arch) to finish before Squirrel.Windows writes its execution stub and re-signs the app exe in it
