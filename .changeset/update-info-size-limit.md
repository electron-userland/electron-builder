---
"builder-util-runtime": patch
"electron-updater": patch
"app-builder-lib": patch
---

fix(updater): channel files (`latest*.yml`) are limited to 10 MiB, since they are parsed before anything verifies them: a larger one fails the update check with `ERR_HTTP_RESPONSE_TOO_LARGE`. `maxUpdateInfoSize` in the publish configuration (written into `app-update.yml`) or `autoUpdater.maxUpdateInfoSize` sets the limit in bytes, or `0` for none.
