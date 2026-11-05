---
"builder-util-runtime": patch
---

fix(runtime): a cross-origin redirect drops the request `auth` option together with the Authorization header, so Basic credentials go only to the original origin; with `DEBUG=electron-builder` a debug line names both origins, never the credentials
