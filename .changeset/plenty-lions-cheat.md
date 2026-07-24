---
"app-builder-lib": patch
---

fix: validate the resolved installed electron-updater version instead of the declared specifier, fixing false "At least electron-updater 4.0.0" errors for pnpm `catalog:`/`workspace:` specifiers
