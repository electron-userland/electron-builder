---
"builder-util-runtime": patch
"electron-updater": patch
---

fix(runtime): a download follows a `Location` header only on a 3xx response, and a redirect it cannot follow (another protocol than http(s), or an invalid URL) now fails the download instead of throwing an uncaught exception and stalling until the request times out
