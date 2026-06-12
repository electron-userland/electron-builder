---
"electron-builder-squirrel-windows": patch
"electron-forge-maker-appimage": patch
"electron-forge-maker-nsis-web": patch
"electron-forge-maker-nsis": patch
"electron-forge-maker-snap": patch
"builder-util-runtime": patch
"electron-builder": patch
"electron-publish": patch
"electron-updater": patch
"app-builder-lib": patch
"builder-util": patch
"dmg-builder": patch
---

fix: declare the missing `electron-publish` dependency on `electron-builder`, and switch type-checking to `nodenext` module resolution so the compiler models Node's real ESM loader
