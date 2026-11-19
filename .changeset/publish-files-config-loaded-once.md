---
"electron-builder": patch
"app-builder-lib": patch
---

fix(publish): `electron-builder publish -f` works with a configuration that has a `publish` list: it loaded the configuration and then had it merged into the same file again, which failed validation (JSON, YAML) or crashed with "Converting circular structure to JSON" (a JS config). A `-c` path without a dot (`-c ci/ebconfig`) is read as the configuration file, and an absolute `extends` path without a dot given in the options is too, as one with a dot already was
