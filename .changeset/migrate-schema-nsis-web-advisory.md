---
"electron-builder": minor
---

feat(migrate-schema): advise on `autoUpdater.disableWebInstaller` when an `nsis-web` target is detected

`electron-builder migrate-schema` now prints an advisory when the config builds an `nsis-web` target, reminding you that `AppUpdater.disableWebInstaller` defaults to `true` as of v27 and that you must set `autoUpdater.disableWebInstaller = false` in your main process to keep downloading web installers. The advisory is informational only — it surfaces on the JSON/YAML and programmatic (JS/TS) paths and never rewrites the config (`disableWebInstaller` is an electron-updater runtime setting, not a build-config key).
