---
"electron-updater": patch
---

fix(mac): the local proxy that serves a downloaded update to Squirrel.Mac requires its credentials on every route (including the zip), compares them in constant time, answers only GET requests (a HEAD or POST gets a 405 and does not complete the download), rejects the download with `ERR_UPDATER_MAC_PROXY_SERVER_FAILED` when the proxy cannot listen, and logs request paths only at debug level
