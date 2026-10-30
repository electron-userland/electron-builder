---
"builder-util-runtime": patch
---

fix(runtime): drop the request `auth` option on a cross-origin redirect, as the Authorization header already is, so Basic credentials are not sent to the redirect target
