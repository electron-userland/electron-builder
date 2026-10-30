---
"builder-util-runtime": major
"electron-updater": major
---

feat(runtime)!: a redirect to another origin, and an electron-updater download or channel file request on another origin than the feed, now send only an allowlist of request headers (`Accept`, `Accept-Encoding`, `Accept-Language`, `User-Agent`, `Cache-Control`, `Pragma`, `Range`, `If-Range`, `If-Match`, `If-None-Match`, `If-Modified-Since`, `If-Unmodified-Since`, `Content-Type`, `Content-Length`, `Content-Encoding`, `Content-Language`) instead of removing a fixed list of credential headers, so a custom header such as `X-Api-Token` is no longer sent on to another origin. electron-updater warns once per updater naming the headers (never their values) a redirect left out, a custom provider whose downloads carry a header off the allowlist must declare `Provider.feedBaseUrl`, and the unexported `addSensitiveRedirectHeader` is removed. See https://www.electron.build/docs/migration/v27-runtime-changes#cross-origin-header-allowlist
