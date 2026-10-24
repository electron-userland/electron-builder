---
"electron-builder": patch
---

fix(migrate-schema): print an advisory, for JS/TS configs as well as JSON, YAML, TOML and package.json ones, for a `win.sign.publisherName` that is a bare common name (not a distinguished name), unless `win.verifyUpdateCodeSignature` is `false`: v27 fails a build that writes it into `app-update.yml`
