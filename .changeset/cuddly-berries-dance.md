---
"electron-builder": patch
"app-builder-lib": patch
---

fix: declare the missing `electron-publish` dependency on `electron-builder`, and switch type-checking to `nodenext` module resolution so the compiler models Node's real ESM loader

