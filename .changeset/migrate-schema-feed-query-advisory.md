---
"electron-builder": patch
---

fix(migrate-schema): print an advisory, for JS/TS configs as well as JSON, YAML, TOML and package.json ones, for a `generic` publish `url` with a query string: electron-updater sends the feed query and the credential headers only to downloads on the feed's origin
