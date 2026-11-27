---
"builder-util-runtime": major
"builder-util": major
---

feat(runtime)!: an `HttpExecutor` without a cross-origin header policy of its own, such as builder-util's `httpExecutor`, sends a redirect to another origin only the headers that carry no credential (`Accept`, `Accept-Encoding`, `Accept-Language`, `Cache-Control`, `Content-Encoding`, `Content-Language`, `Content-Length`, `Content-Type`, `If-Match`, `If-Modified-Since`, `If-None-Match`, `If-Range`, `If-Unmodified-Since`, `Pragma`, `Range`, `User-Agent`); every other header, a custom credential header such as `X-Api-Token` too, stays on its origin. builder-util's `NodeHttpExecutor` warns once per process, at the first redirect that leaves out headers other than the well-known credential headers (`Authorization`, `Cookie`, `PRIVATE-TOKEN`, `X-Api-Key` and the like), naming them and both origins (never a value). electron-updater keeps its own policy (`autoUpdater.crossOriginHeaders`). https://www.electron.build/docs/migration/v27-developer-changes#builder-util-runtime-default-cross-origin-headers
