---
"electron-updater": major
"app-builder-lib": patch
"builder-util-runtime": minor
---

feat(updater)!: reject plain http update requests and https-to-http redirects (except to a loopback host) with `ERR_UPDATER_INSECURE_FEED` unless the app sets `AppUpdater.allowInsecureFeed`, which is meant for development (`autoUpdater.allowInsecureFeed = !app.isPackaged`): a packaged app with it set logs a warning once, the first time it loads update info (an update check, or the validation of an update pending install at launch); the build warns when the feed written to `app-update.yml` (a generic or custom publish `url`, a github `protocol: "http"` or an s3 `endpoint` without `accelerate`) uses plain http to a host that is not loopback. With `allowInsecureFeed`, a server's authentication challenge on a request that is neither https nor to a loopback host is cancelled without emitting `login`. A redirect to a loopback host (http or https) from a URL that is not on one fails with `ERR_UPDATER_LOOPBACK_REDIRECT`, whatever `allowInsecureFeed` is; `ApiRequestOptions.redirectedFromNonLoopback` carries that through a redirect chain. https://www.electron.build/docs/migration/v27-runtime-changes#update-requests-require-https
