---
"electron-updater": patch
---

fix(mac): the local proxy that serves a downloaded update to Squirrel.Mac requires its credentials on every route (including the zip), compares them in constant time, and logs request paths only at debug level
