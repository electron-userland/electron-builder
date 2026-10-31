---
"electron-updater": major
"app-builder-lib": patch
"builder-util-runtime": minor
---

feat(updater)!: reject plain http update requests and https-to-http redirects (except to a loopback host) with `ERR_UPDATER_INSECURE_FEED` unless the app sets `AppUpdater.allowInsecureFeed = true`; the build warns when the feed written to `app-update.yml` (a generic or custom publish `url`, a github `protocol: "http"` or an s3 `endpoint`) uses plain http. With `allowInsecureFeed`, a server's authentication challenge on a request that is not https is cancelled without emitting `login`
