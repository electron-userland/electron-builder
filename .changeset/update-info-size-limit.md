---
"builder-util-runtime": patch
"electron-updater": patch
---

fix(updater): update info responses (channel files, release feeds, provider API responses) are limited to 10 MiB: a larger response fails the update check with `ERR_HTTP_RESPONSE_TOO_LARGE`
