---
"app-builder-lib": patch
"builder-util": patch
"dmg-builder": patch
"electron-builder": patch
"electron-builder-squirrel-windows": patch
"electron-updater": patch
---

chore(refactor): refactoring code to reduce cyclical imports in order to migrate to rollup + vite (which have much more strict module resolutions)
