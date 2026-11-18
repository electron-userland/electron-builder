---
"electron-builder": patch
---

fix(publish): `electron-builder publish -f` works with a configuration that has a `publish` list: it loaded the configuration and then had it merged into the same file again, which failed validation (JSON, YAML) or crashed with "Converting circular structure to JSON" (a JS config)
