---
"app-builder-lib": patch
"builder-util": patch
"builder-util-runtime": patch
"dmg-builder": patch
"electron-builder": patch
"electron-builder-squirrel-windows": patch
"electron-publish": patch
---

chore: "organize imports" + change `ObjectMap` => `Record` for non-external properties (i.e. things that don't get processed for `scheme.json`)
