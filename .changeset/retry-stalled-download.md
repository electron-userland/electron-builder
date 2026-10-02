---
"app-builder-lib": patch
---

fix: retry a stalled Electron/toolset download instead of failing the build. Before, the 10 minute download timeout was shared by all attempts and its abort was not treated as retryable, so one silent connection failed the build. After, each attempt gets its own timeout and a stalled attempt is retried once.
