---
"electron-builder": patch
---

fix(migrate-schema): print an advisory, for JS/TS configs as well as JSON, YAML, TOML and package.json ones, for a publish feed that electron-updater requests over plain http to a host that is not loopback (a `generic` or `custom` `url`, a `github` `protocol: "http"` or an `s3` `endpoint` without `accelerate`), with the same rule and solution as the build warning: `ERR_UPDATER_INSECURE_FEED`, and `autoUpdater.allowInsecureFeed = !app.isPackaged` for dev runs. https://www.electron.build/docs/migration/v27-runtime-changes#update-requests-require-https
