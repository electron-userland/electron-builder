---
"app-builder-lib": patch
---

fix(nsis): warn when `differentialPackage: "store-asar"` finds no `resources/app.asar` (e.g. `asar: false`) instead of silently compressing the package normally
