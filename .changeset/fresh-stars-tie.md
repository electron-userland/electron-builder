---
"electron-builder-squirrel-windows": patch
"app-builder-lib": patch
"dmg-builder": patch
---

fix: add toolset lockfile for operations that leverage system utils that don't support parallelism (e.g. hdiutil, WiX, etc.)
