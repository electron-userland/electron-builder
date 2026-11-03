---
"builder-util-runtime": patch
---

fix(runtime): a cross-origin redirect drops the request `auth` option (Basic credentials), whatever headers it keeps, so it goes only to the original origin
