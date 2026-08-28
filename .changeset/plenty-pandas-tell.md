---
"app-builder-lib": patch
---

fix: don't empty the locales dir when `electronLanguages` uses bare language codes (e.g. `en` now keeps `en-US.pak`), refuse to delete every locale, and warn about entries that match nothing
