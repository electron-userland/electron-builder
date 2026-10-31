---
"builder-util-runtime": patch
"electron-updater": patch
---

fix(runtime): on Node, a download that fails with a status of 400 or more drains the response, so its socket is released and the request's socket timeout does not call back the failed download a second time with "Request timed out"
