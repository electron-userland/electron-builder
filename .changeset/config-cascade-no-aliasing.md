---
"app-builder-lib": patch
---

fix: merge configuration cascades (extends / file / build({ config }), mac → mas → masDev, platform → target, nsis → nsisWeb, linux → snap) into new objects, so a mac + mas build no longer signs the macOS app with mas.sign values, a target's nested options no longer leak into its platform or sibling targets, and a later layer's hook or signer function wins; linux.compression (a level) no longer reaches the deb, rpm and pacman targets. See https://www.electron.build/docs/migration/v27-build-changes#cascaded-options-no-longer-leak
