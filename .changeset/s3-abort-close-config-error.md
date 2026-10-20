---
"electron-publish": patch
---

fix(publish): detect aborted S3 responses via `close` instead of the deprecated `aborted` event, and report non-http(s) or unparseable S3 endpoints as configuration errors
