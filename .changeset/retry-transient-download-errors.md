---
"app-builder-lib": patch
---

fix: actually retry transient Electron/toolset download failures. The download retry predicate only matched builder-util-runtime's `HttpError` and errors with a top-level `code`, but `@electron/get` v5 throws its own `HTTPError` (fetch `Response` on `.response`, no `.code`) and undici wraps socket errors in `TypeError: fetch failed` with the code on `error.cause.code` — so GitHub 503s and connection resets failed immediately with zero retries. Downloads now retry with backoff on HTTP 5xx/429 and on transient network codes (ECONNRESET, ETIMEDOUT, ECONNREFUSED, EAI_AGAIN, EPIPE, UND_ERR_SOCKET, UND_ERR_CONNECT_TIMEOUT)
