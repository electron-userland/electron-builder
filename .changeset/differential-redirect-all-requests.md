---
"electron-updater": patch
---

fix(updater): every request of a differential download (single-range, multi-range and reading the embedded block map) follows redirects through `ElectronHttpExecutor.addRedirectHandlers`: a redirect target on another origin gets only the request headers the app's `autoUpdater.crossOriginHeaders` keeps, plus the request's own `Accept` and `Range`, so a pre-signed S3 or R2 redirect target accepts the range requests instead of rejecting them and forcing a full download. A single-range download requests its remaining ranges from the redirect target, while each multi-range request starts at the update URL, and at most 10 redirects are followed per request, as for every `ElectronHttpExecutor` request
