---
"electron-updater": patch
---

fix(updater): every request of a differential download (single-range, multi-range and reading the embedded block map) follows redirects through `ElectronHttpExecutor.addRedirectHandlers`: credential headers such as `Authorization`, `PRIVATE-TOKEN`, `X-Api-Key` and `Cookie` are sent to a redirect target only on the same origin, a single-range download requests its remaining ranges from the redirect target while each multi-range request starts at the update URL, and at most 10 redirects are followed per request, as for every `ElectronHttpExecutor` request
