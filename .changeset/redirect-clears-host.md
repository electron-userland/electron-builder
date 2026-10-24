---
"builder-util-runtime": patch
---

fix(runtime): `HttpExecutor.prepareRedirectUrlOptions` leaves out `host`, so a redirected request goes to the redirect target even when the original request set `host` (ElectronHttpExecutor sets it from a `Host` header)
