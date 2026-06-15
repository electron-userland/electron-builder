---
"app-builder-lib": patch
---

fix(snap): core24 now builds with `executableArgs`/`forceX11` flags that contain `=` or quotes (auto-wrapped in a launcher script), and the unused `chrome-sandbox` helper is removed automatically when launching with `--no-sandbox`
