---
"builder-util-runtime": patch
---

fix(runtime): a cross-origin redirect keeps the request `auth` option (Basic credentials) only when the cross-origin header choice keeps `authorization`, like an Authorization header, so by default it goes only to the original origin
