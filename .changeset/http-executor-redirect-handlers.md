---
"builder-util-runtime": minor
---

feat(runtime): `HttpExecutor.addRedirectHandlers` is public, so that requests made outside the executor (electron-updater's differential downloads) follow redirects with the same rules: a redirect to another origin sends the headers the executor's cross-origin header policy keeps, plus the request's own (`ownHeaders`), and the executor's redirect limit applies
