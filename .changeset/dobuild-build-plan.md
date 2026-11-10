---
"app-builder-lib": patch
---

refactor: resolve the build plan once and split `Packager.doBuild` into small steps; the electron-updater check and the build resolve the targets with the same function
