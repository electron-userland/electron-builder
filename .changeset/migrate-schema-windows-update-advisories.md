---
"electron-builder": patch
---

fix(migrate-schema): print advisories, for JS/TS configs as well as JSON, YAML, TOML and package.json ones, for `nsis.perMachine` / `nsisWeb.perMachine` (per-machine NSIS updates) and a custom `win.sign.sign` hook without `win.sign.publisherName` or a certificate in the config; the `nsis-web` advisory now says that web-installer updates are rejected unless `autoUpdater.disableWebInstaller` is `false` and when to set `nsisWeb.allowUnverifiedAppPackage`, and target names with an `:arch` suffix (e.g. `nsis-web:ia32`) are detected
