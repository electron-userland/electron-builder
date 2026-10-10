---
"app-builder-lib": patch
---

fix: retry an Electron/toolset download that times out instead of failing the build. Before, a silent connection ended in undici's 300s headers/body timeout, which was not treated as retryable, and the 10 minute cap on a download was one `AbortSignal.timeout()` shared by all attempts, so no attempt could follow it. After, each attempt gets its own 10 minute cap, and an attempt that hits it or undici's timeouts is retried once, with a warning in the log.
