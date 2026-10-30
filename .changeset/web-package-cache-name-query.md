---
"electron-updater": patch
---

fix(updater): name the downloaded NSIS web installer package after the URL path only, so a feed or package URL with a query (an auth token, a pre-signed URL, Keygen's `?product=`) no longer yields an invalid Windows file name that made every web-installer update download fail, and install a package reused from the cache under the name it was saved with
