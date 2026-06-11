---
"builder-util-runtime": patch
"app-builder-lib": patch
"electron-publish": patch
"electron-builder": patch
---

fix: resolve runtime ESM/CJS interop for namespace imports of CJS-only packages (`sax`, `which`, `mime`), declare the missing `electron-publish` dependency on `electron-builder`, and switch type-checking to `nodenext` module resolution so the compiler models Node's real ESM loader
