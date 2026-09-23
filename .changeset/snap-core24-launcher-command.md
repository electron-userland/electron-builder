---
"app-builder-lib": patch
---

fix(snap): core24 now runs the app through a generated launcher script, so `executableArgs`/`forceX11` flags containing `=` or quotes build correctly, and the unused `chrome-sandbox` helper is removed automatically when launching with `--no-sandbox`
