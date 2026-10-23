---
"app-builder-lib": minor
"electron-forge-maker-appimage": patch
"electron-forge-maker-nsis": patch
"electron-forge-maker-nsis-web": patch
"electron-forge-maker-snap": patch
---

fix(forge): make the electron-forge-maker-\* packages loadable by Electron Forge 6+ (`MakerBase`-compatible default export class, also exported by name, with the maker `config` applied as the target's options); calling the default export as an Electron Forge 5 maker function still works
