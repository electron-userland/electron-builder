---
"builder-util-runtime": minor
---

feat(runtime): `HttpExecutor.addRedirectHandlers` is public, so that requests made outside the executor (electron-updater's differential downloads) follow redirects with the same rules: credential headers are dropped on another origin, and the executor's redirect limit applies
