---
"electron-updater": major
"app-builder-lib": patch
"builder-util-runtime": minor
---

feat(updater)!: reject plain http update requests and https-to-http redirects (except to a loopback host) with `ERR_UPDATER_INSECURE_FEED` unless the app sets the new `AppUpdater.allowInsecureFeed`; the build warns when a generic or custom publish `url` uses plain http
